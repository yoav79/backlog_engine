import { describe, it, expect } from 'vitest';
import { render } from './index.js';
import { parse } from '../parser/index.js';
import type { BacklogDocument, BacklogItem } from '../domain/index.js';

function makeDoc(items: BacklogItem[]): BacklogDocument {
  return {
    schemaVersion: 1,
    backlogId: 'test-001',
    updatedAt: '2026-07-25T12:00:00.000Z',
    items,
  };
}

describe('Renderer', () => {
  it('AC-001: render() produce Markdown canónico completo', () => {
    const doc = makeDoc([
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
        acceptanceCriteria: [{ text: 'Criterio uno', completed: true }],
        evidence: ['Evidencia 1'],
        notes: ['Nota 1'],
      },
    ]);
    const output = render(doc);
    expect(output).toContain('schemaVersion: 1');
    expect(output).toContain('# Backlog');
    expect(output).toContain('BLG-001');
    expect(output).toContain('Test Item');
    expect(output).toContain('[x] Criterio uno');
    expect(output).toContain('Evidencia 1');
    expect(output).toContain('Nota 1');
  });

  it('AC-002: Mismo documento produce mismo Markdown', () => {
    const doc = makeDoc([
      {
        id: 'BLG-001',
        title: 'Test',
        status: 'todo',
        priority: 'medium',
        type: 'feature',
        owner: 'unassigned',
        dependsOn: [],
        scope: '',
        createdAt: '',
        updatedAt: '',
        description: 'Descripción',
        acceptanceCriteria: [],
        evidence: [],
        notes: [],
      },
    ]);
    const first = render(doc);
    const second = render(doc);
    expect(first).toBe(second);
  });

  it('AC-003: parse(render(doc)) preserva estructura', () => {
    const doc = makeDoc([
      {
        id: 'BLG-001',
        title: 'Item Uno',
        status: 'todo',
        priority: 'high',
        type: 'feature',
        owner: 'unassigned',
        dependsOn: [],
        scope: 'core',
        createdAt: '2026-07-25T12:00:00.000Z',
        updatedAt: '2026-07-25T12:00:00.000Z',
        description: 'Descripción del item',
        acceptanceCriteria: [
          { text: 'Criterio A', completed: true },
          { text: 'Criterio B', completed: false },
        ],
        evidence: ['Test pasado'],
        notes: ['Nota importante'],
      },
    ]);
    const markdown = render(doc);
    const reparsed = parse(markdown);
    expect(reparsed.items).toHaveLength(1);
    expect(reparsed.items[0].id).toBe('BLG-001');
    expect(reparsed.items[0].title).toBe('Item Uno');
    expect(reparsed.items[0].acceptanceCriteria).toHaveLength(2);
    expect(reparsed.items[0].acceptanceCriteria[0].completed).toBe(true);
  });

  it('AC-004: Contenido multilínea se preserva', () => {
    const doc = makeDoc([
      {
        id: 'BLG-001',
        title: 'Multilínea',
        status: 'todo',
        priority: 'low',
        type: 'bug',
        owner: 'unassigned',
        dependsOn: [],
        scope: '',
        createdAt: '',
        updatedAt: '',
        description: 'Línea uno\n\nLínea dos\n\nLínea tres',
        acceptanceCriteria: [],
        evidence: [],
        notes: [],
      },
    ]);
    const markdown = render(doc);
    expect(markdown).toContain('Línea uno');
    expect(markdown).toContain('Línea dos');
    expect(markdown).toContain('Línea tres');
  });

  it('AC-005: Items ordenados por ID ascendente', () => {
    const doc = makeDoc([
      {
        id: 'BLG-003',
        title: 'Tercero',
        status: 'todo',
        priority: 'medium',
        type: 'feature',
        owner: 'unassigned',
        dependsOn: [],
        scope: '',
        createdAt: '',
        updatedAt: '',
        description: '',
        acceptanceCriteria: [],
        evidence: [],
        notes: [],
      },
      {
        id: 'BLG-001',
        title: 'Primero',
        status: 'todo',
        priority: 'medium',
        type: 'feature',
        owner: 'unassigned',
        dependsOn: [],
        scope: '',
        createdAt: '',
        updatedAt: '',
        description: '',
        acceptanceCriteria: [],
        evidence: [],
        notes: [],
      },
      {
        id: 'BLG-002',
        title: 'Segundo',
        status: 'todo',
        priority: 'medium',
        type: 'feature',
        owner: 'unassigned',
        dependsOn: [],
        scope: '',
        createdAt: '',
        updatedAt: '',
        description: '',
        acceptanceCriteria: [],
        evidence: [],
        notes: [],
      },
    ]);
    const markdown = render(doc);
    const blg001 = markdown.indexOf('BLG-001');
    const blg002 = markdown.indexOf('BLG-002');
    const blg003 = markdown.indexOf('BLG-003');
    expect(blg001).toBeLessThan(blg002);
    expect(blg002).toBeLessThan(blg003);
  });
});
