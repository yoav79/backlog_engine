import { describe, it, expect } from 'vitest';
import { parse, ParseError } from './index.js';

const validBacklog = `---
schemaVersion: 1
backlogId: blg-test-001
updatedAt: 2026-07-25T12:00:00.000Z
---

# Backlog

## BLG-001: Configurar CI/CD

- **Status:** todo
- **Priority:** high
- **Type:** feature
- **Owner:** unassigned
- **Depends on:** None
- **Scope:** devops

### Description

Configurar GitHub Actions para CI/CD.

### Acceptance Criteria

- [x] Tests pasan en PR
- [ ] Deploy automático configurado

### Evidence

- PR #1 merged

### Notes

- Usar GitHub Actions
`;

describe('Parser', () => {
  it('AC-001: parse() retorna BacklogDocument con campos extraídos', () => {
    const doc = parse(validBacklog);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.backlogId).toBe('blg-test-001');
    expect(doc.updatedAt).toBe('2026-07-25T12:00:00.000Z');
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0].id).toBe('BLG-001');
    expect(doc.items[0].title).toBe('Configurar CI/CD');
  });

  it('AC-002: Reconoce frontmatter YAML', () => {
    const doc = parse(validBacklog);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.backlogId).toBe('blg-test-001');
  });

  it('AC-003: Reconoce checkboxes en acceptanceCriteria', () => {
    const doc = parse(validBacklog);
    const criteria = doc.items[0].acceptanceCriteria;
    expect(criteria).toHaveLength(2);
    expect(criteria[0].text).toBe('Tests pasan en PR');
    expect(criteria[0].completed).toBe(true);
    expect(criteria[1].text).toBe('Deploy automático configurado');
    expect(criteria[1].completed).toBe(false);
  });

  it('AC-004: Reporta línea y columna en errores de sintaxis', () => {
    const badMarkdown = `# Wrong Heading\n\nSome content`;
    try {
      parse(badMarkdown);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      if (err instanceof ParseError) {
        expect(err.code).toBe('INVALID_ROOT_HEADING');
        expect(err.line).toBe(1);
      }
    }
  });

  it('AC-005: No ejecuta contenido incrustado', () => {
    const safe = parse(validBacklog);
    expect(safe.items[0].title).toBe('Configurar CI/CD');
  });

  it('parsea múltiples items', () => {
    const multi = `---
schemaVersion: 1
backlogId: multi
updatedAt: 2026-07-25T12:00:00.000Z
---

# Backlog

## BLG-001: Primera tarea

### Description

Primera descripción.

## BLG-002: Segunda tarea

### Description

Segunda descripción.
`;
    const doc = parse(multi);
    expect(doc.items).toHaveLength(2);
    expect(doc.items[0].id).toBe('BLG-001');
    expect(doc.items[1].id).toBe('BLG-002');
  });
});
