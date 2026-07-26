import { describe, it, expect } from 'vitest';
import { validateStructure, validateSemantics } from './index.js';
import type { BacklogDocument } from '../domain/index.js';

function validDoc(): BacklogDocument {
  return {
    schemaVersion: 1,
    backlogId: 'test-001',
    updatedAt: '2026-07-25T12:00:00.000Z',
    items: [
      {
        id: 'BLG-001',
        title: 'Test Item',
        status: 'todo',
        priority: 'high',
        type: 'feature',
        owner: 'unassigned',
        dependsOn: [],
        scope: 'core',
        createdAt: '2026-07-25T12:00:00.000Z',
        updatedAt: '2026-07-25T12:00:00.000Z',
        description: 'Una descripción',
        acceptanceCriteria: [],
        evidence: [],
        notes: [],
      },
    ],
  };
}

describe('Validator (structural)', () => {
  it('AC-001: Documento canónico retorna valid=true sin errores', () => {
    const result = validateStructure(validDoc());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('AC-002: Frontmatter inválido produce INVALID_FRONTMATTER', () => {
    const doc = validDoc();
    doc.schemaVersion = 0 as 1;
    const result = validateStructure(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_FRONTMATTER')).toBe(true);
  });

  it('AC-003: ID mal formado produce error con código', () => {
    const doc = validDoc();
    doc.items[0].id = 'BLG-abc';
    const result = validateStructure(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_ITEM_ID')).toBe(true);
  });

  it('AC-004: Estado inválido produce error', () => {
    const doc = validDoc();
    doc.items[0].status = 'invalid_status' as any;
    const result = validateStructure(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_STATUS')).toBe(true);
  });

  it('AC-005: acceptanceCriteria faltante produce error', () => {
    const doc = validDoc();
    delete (doc.items[0] as any).acceptanceCriteria;
    const result = validateStructure(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ACCEPTANCE_CRITERIA')).toBe(true);
  });

  it('Valida múltiples errores simultáneamente', () => {
    const doc = validDoc();
    doc.schemaVersion = 0 as 1;
    doc.items[0].id = 'bad';
    doc.items[0].status = 'bogus' as any;
    const result = validateStructure(doc);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.valid).toBe(false);
  });
});

describe('Validator (semantic)', () => {
  it('AC-001: Detecta IDs duplicados', () => {
    const doc = validDoc();
    doc.items.push({ ...doc.items[0], id: 'BLG-001' });
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ITEM_ID')).toBe(true);
  });

  it('AC-002: Detecta dependencias inexistentes', () => {
    const doc = validDoc();
    doc.items[0].dependsOn = ['BLG-999'];
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'DEPENDENCY_NOT_FOUND')).toBe(true);
  });

  it('AC-003: Detecta dependencias cíclicas', () => {
    const doc = validDoc();
    doc.items.push({
      id: 'BLG-002',
      title: 'Item 2',
      status: 'todo',
      priority: 'high',
      type: 'feature',
      owner: 'unassigned',
      dependsOn: ['BLG-001'],
      scope: '',
      createdAt: '',
      updatedAt: '',
      description: '',
      acceptanceCriteria: [],
      evidence: [],
      notes: [],
    });
    doc.items[0].dependsOn = ['BLG-002'];
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'DEPENDENCY_CYCLE')).toBe(true);
  });

  it('AC-004: Detecta dependencia propia', () => {
    const doc = validDoc();
    doc.items[0].dependsOn = ['BLG-001'];
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'SELF_DEPENDENCY')).toBe(true);
  });

  it('AC-005: in_progress sin owner produce error', () => {
    const doc = validDoc();
    doc.items[0].status = 'in_progress';
    doc.items[0].owner = 'unassigned';
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'INVALID_STATE_OWNER')).toBe(true);
  });

  it('AC-006: done con criteria incompletos produce error', () => {
    const doc = validDoc();
    doc.items[0].status = 'done';
    doc.items[0].acceptanceCriteria = [{ text: 'Criterio', completed: false }];
    doc.items[0].evidence = ['Evidencia'];
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'MISSING_ACCEPTANCE_CRITERIA')).toBe(true);
  });

  it('AC-007: done sin evidencia produce error', () => {
    const doc = validDoc();
    doc.items[0].status = 'done';
    doc.items[0].acceptanceCriteria = [{ text: 'Criterio', completed: true }];
    doc.items[0].evidence = [];
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'MISSING_EVIDENCE')).toBe(true);
  });

  it('AC-008: blocked sin notas produce error', () => {
    const doc = validDoc();
    doc.items[0].status = 'blocked';
    doc.items[0].notes = [];
    const result = validateSemantics(doc);
    expect(result.errors.some((e) => e.code === 'BLOCKED_WITHOUT_NOTES')).toBe(true);
  });
});
