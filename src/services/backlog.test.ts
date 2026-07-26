import { describe, it, expect } from 'vitest';
import { BacklogService } from './backlog.js';
import type { BacklogDocument, AcceptanceCriterion } from '../domain/index.js';

function testDoc(): BacklogDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    backlogId: 'test',
    updatedAt: now,
    items: [
      { id: 'BLG-001', title: 'Item 1', status: 'todo', priority: 'high', type: 'feature', owner: 'unassigned', dependsOn: [], scope: '', createdAt: now, updatedAt: now, description: '', acceptanceCriteria: [], evidence: [], notes: [] },
    ],
  };
}

function docWithCriteria(completed: boolean[]): BacklogDocument {
  const now = new Date().toISOString();
  const criteria: AcceptanceCriterion[] = completed.map((c, i) => ({ text: `AC-${i + 1}: Criterio ${i + 1}`, completed: c }));
  return {
    schemaVersion: 1,
    backlogId: 'test',
    updatedAt: now,
    items: [
      { id: 'BLG-001', title: 'Item with criteria', status: 'todo', priority: 'high', type: 'feature', owner: 'unassigned', dependsOn: [], scope: '', createdAt: now, updatedAt: now, description: '', acceptanceCriteria: criteria, evidence: [], notes: [] },
    ],
  };
}

describe('BacklogService dryRun', () => {
  const service = new BacklogService();

  it('AC-001: dryRunAdd crea item simulado con ID incremental', async () => {
    const doc = testDoc();
    const result = await service.dryRunAdd(doc, 'Nuevo item', 'feature', 'high', 'core');
    expect(result.simulatedDoc.items).toHaveLength(2);
    expect(result.simulatedDoc.items[1].title).toBe('Nuevo item');
    expect(result.simulatedDoc.items[1].id).toBe('BLG-002');
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it('AC-002: dryRunUpdate retorna diff de cambios', async () => {
    const doc = testDoc();
    const result = await service.dryRunUpdate(doc, 'BLG-001', { title: 'Título actualizado' });
    expect(result.changes.some((c) => c.field === 'title')).toBe(true);
    expect(result.simulatedDoc.items[0].title).toBe('Título actualizado');
  });

  it('AC-003: dryRunClose simula cierre con evidencia', async () => {
    const doc = testDoc();
    const result = await service.dryRunClose(doc, 'BLG-001', ['evidencia-001']);
    expect(result.simulatedDoc.items[0].status).toBe('done');
    expect(result.changes.some((c) => c.field === 'status')).toBe(true);
    expect(result.changes.some((c) => c.field === 'evidence')).toBe(true);
  });

  it('AC-003: dryRunClose lanza error si item ya está done', async () => {
    const doc = testDoc();
    doc.items[0].status = 'done';
    doc.items[0].evidence = ['existing-evidence'];
    await expect(service.dryRunClose(doc, 'BLG-001', ['new-evidence'])).rejects.toThrow('ITEM_ALREADY_CLOSED');
  });

  it('AC-004: dryRunAdd preserva datos del item simulado para validación', async () => {
    const doc = testDoc();
    const result = await service.dryRunAdd(doc, 'Item válido', 'feature', 'high', 'core');
    expect(result.simulatedDoc.items).toHaveLength(2);
    const newItem = result.simulatedDoc.items[1];
    expect(newItem.title).toBe('Item válido');
    expect(newItem.status).toBe('todo');
    expect(newItem.id).toMatch(/^BLG-/);
    const originalItem = result.simulatedDoc.items[0];
    expect(originalItem.title).toBe('Item 1');
  });

  it('AC-005: dry-run no modifica el documento original', async () => {
    const doc = testDoc();
    const originalTitle = doc.items[0].title;
    await service.dryRunUpdate(doc, 'BLG-001', { title: 'Nuevo título' });
    expect(doc.items[0].title).toBe(originalTitle);
  });
});

describe('BacklogService query', () => {
  const service = new BacklogService();

  it('AC-001: get retorna found para IDs existentes y notFound para inexistentes', () => {
    const doc = testDoc();
    const result = service.get(doc, ['BLG-001', 'NONEXISTENT']);
    expect(result.found).toHaveLength(1);
    expect(result.found[0].id).toBe('BLG-001');
    expect(result.notFound).toHaveLength(1);
    expect(result.notFound[0].id).toBe('NONEXISTENT');
    expect(result.totalFound).toBe(1);
  });

  it('AC-002: list retorna todos los items sin filtro', () => {
    const doc = testDoc();
    const result = service.list(doc);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('AC-002: list filtra por estado', () => {
    const doc = testDoc();
    const result = service.list(doc, { status: 'done' });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    const resultTodo = service.list(doc, { status: 'todo' });
    expect(resultTodo.items).toHaveLength(1);
  });
});

describe('BacklogService update', () => {
  const service = new BacklogService();

  it('AC-001: update patch parcial modifica solo campos especificados', async () => {
    const doc = testDoc();
    const result = await service.dryRunUpdate(doc, 'BLG-001', { title: 'Nuevo título' });
    expect(result.simulatedDoc.items[0].title).toBe('Nuevo título');
    expect(result.simulatedDoc.items[0].status).toBe('todo');
  });

  it('AC-002: id y createdAt no se pueden modificar', async () => {
    const doc = testDoc();
    const result = await service.dryRunUpdate(doc, 'BLG-001', { id: 'BLG-999', createdAt: '2020-01-01' } as any);
    expect(result.simulatedDoc.items[0].id).toBe('BLG-001');
  });

  it('AC-003: in_progress requiere owner asignado', async () => {
    const doc = testDoc();
    await expect(service.dryRunUpdate(doc, 'BLG-001', { status: 'in_progress' })).rejects.toThrow('INVALID_TRANSITION');
    await expect(service.dryRunUpdate(doc, 'BLG-001', { status: 'in_progress', owner: 'human:yoab' })).resolves.toBeDefined();
  });

  it('AC-003: blocked requiere notas', async () => {
    const doc = testDoc();
    await expect(service.dryRunUpdate(doc, 'BLG-001', { status: 'blocked' })).rejects.toThrow('INVALID_TRANSITION');
    await expect(service.dryRunUpdate(doc, 'BLG-001', { status: 'blocked', notes: ['Razón del bloqueo'] })).resolves.toBeDefined();
  });

  it('AC-004: changelog registra field changes', async () => {
    const doc = testDoc();
    const result = await service.dryRunUpdate(doc, 'BLG-001', { title: 'Actualizado' });
    expect(result.changes.some((c) => c.field === 'title')).toBe(true);
    expect(result.changes.find((c) => c.field === 'title')?.previousValue).toBe('Item 1');
    expect(result.changes.find((c) => c.field === 'title')?.currentValue).toBe('Actualizado');
  });
});

describe('BacklogService close', () => {
  const service = new BacklogService();

  it('AC-001: close exitoso con criteria completos y evidencia', async () => {
    const doc = docWithCriteria([true]);
    const result = await service.dryRunClose(doc, 'BLG-001', ['evidencia-ok']);
    expect(result.simulatedDoc.items[0].status).toBe('done');
    expect(result.changes.some((c) => c.field === 'status')).toBe(true);
  });

  it('AC-002: close rechazado si faltan evidencias', async () => {
    const doc = docWithCriteria([true]);
    await expect(service.dryRunClose(doc, 'BLG-001', []))
      .rejects.toThrow('MISSING_EVIDENCE');
    await expect(service.dryRunClose(doc, 'BLG-001', ['']))
      .rejects.toThrow('MISSING_EVIDENCE');
  });

  it('AC-003: MISSING_ACCEPTANCE_CRITERIA lista criterios pendientes', async () => {
    const doc = docWithCriteria([false, true, false]);
    try {
      await service.dryRunClose(doc, 'BLG-001', ['evidencia']);
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('MISSING_ACCEPTANCE_CRITERIA');
      expect(err.message).toContain('AC-1');
      expect(err.message).toContain('AC-3');
    }
  });

  it('AC-004: MISSING_EVIDENCE con código específico', async () => {
    const doc = docWithCriteria([true]);
    try {
      await service.dryRunClose(doc, 'BLG-001', []);
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('MISSING_EVIDENCE');
    }
  });
});
