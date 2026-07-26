import { describe, it, expect } from 'vitest';
import { selectWithDependencies } from './selection.js';
import type { BacklogDocument } from '../domain/index.js';

function testDoc(): BacklogDocument {
  return {
    schemaVersion: 1,
    backlogId: 'test',
    updatedAt: '',
    items: [
      { id: 'BLG-001', title: 'Done task', status: 'done', priority: 'high', type: 'feature', owner: 'unassigned', dependsOn: [], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: ['ok'], notes: [] },
      { id: 'BLG-002', title: 'Pending task', status: 'todo', priority: 'high', type: 'feature', owner: 'unassigned', dependsOn: ['BLG-001'], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: [], notes: [] },
      { id: 'BLG-003', title: 'Blocked task', status: 'in_progress', priority: 'high', type: 'feature', owner: 'agent', dependsOn: ['BLG-999'], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: [], notes: [] },
      { id: 'BLG-004', title: 'Cancelled task', status: 'cancelled', priority: 'high', type: 'feature', owner: 'unassigned', dependsOn: [], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: [], notes: [] },
    ],
  };
}

describe('SelectionService', () => {
  it('excluye done y cancelled', () => {
    const result = selectWithDependencies(testDoc(), ['BLG-001', 'BLG-004']);
    expect(result.selectedIds).toEqual([]);
    expect(result.excludedItems.map((e) => e.reason)).toEqual(['status_final', 'status_final']);
  });

  it('selecciona pendientes sin dependencias bloqueantes', () => {
    const result = selectWithDependencies(testDoc(), ['BLG-002']);
    expect(result.selectedIds).toEqual(['BLG-002']);
  });

  it('dependency_blocked en modo strict', () => {
    const result = selectWithDependencies(testDoc(), ['BLG-003']);
    expect(result.excludedItems.some((e) => e.reason === 'dependency_blocked')).toBe(true);
    expect(result.selectedIds).not.toContain('BLG-003');
  });

  it('mantiene orden solicitado', () => {
    const result = selectWithDependencies(testDoc(), ['BLG-002', 'BLG-001']);
    expect(result.selectedIds).toEqual(['BLG-002']);
  });

  it('elimina duplicados', () => {
    const result = selectWithDependencies(testDoc(), ['BLG-002', 'BLG-002']);
    expect(result.selectedIds).toEqual(['BLG-002']);
    expect(result.requestedIds).toEqual(['BLG-002']);
  });

  it('AC-003: dependencia no terminada produce warning en modo normal', () => {
    const result = selectWithDependencies(testDoc(), ['BLG-003'], 'normal');
    expect(result.excludedItems.some((e) => e.reason === 'dependency_warning')).toBe(true);
    expect(result.selectedIds).toContain('BLG-003');
  });

  it('AC-004: la política usada aparece en el resultado', () => {
    const result = selectWithDependencies(testDoc(), ['BLG-002']);
    expect(result.dependencyPolicy).toBe('strict');
    const resultNormal = selectWithDependencies(testDoc(), ['BLG-002'], 'normal');
    expect(resultNormal.dependencyPolicy).toBe('normal');
  });
});
