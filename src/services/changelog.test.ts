import { describe, it, expect } from 'vitest';
import { checkCommandId, nextChangeId, recordChange, validateChangelog } from './changelog.js';
import type { BacklogDocument } from '../domain/index.js';

const baseChangelog = `---
schemaVersion: 1
changelogId: chg-test
lastChangeId: CHG-000001
updatedAt: 2026-07-25T12:00:00.000Z
---

# Changelog

## CHG-000001

- Timestamp: 2026-07-25T12:00:00.000Z
- Actor: agent:build
- Operation: create
- Items: BLG-001
- CommandId: cmd-001
`;

function makeDoc(): BacklogDocument {
  return {
    schemaVersion: 1,
    backlogId: 'test',
    updatedAt: '',
    items: [
      { id: 'BLG-001', title: 'Item', status: 'todo', priority: 'high', type: 'feature', owner: 'unassigned', dependsOn: [], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: [], notes: [] },
    ],
  };
}

describe('ChangelogService', () => {
  describe('checkCommandId', () => {
    it('AC-001: commandId único permite la operación', () => {
      expect(checkCommandId(baseChangelog, 'cmd-999').applied).toBe(true);
    });

    it('AC-002: commandId repetido retorna COMMAND_ALREADY_APPLIED', () => {
      const result = checkCommandId(baseChangelog, 'cmd-001');
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('COMMAND_ALREADY_APPLIED');
    });
  });

  describe('nextChangeId', () => {
    it('incrementa desde CHG-000001', () => {
      expect(nextChangeId(baseChangelog)).toBe('CHG-000002');
    });

    it('incrementa desde changelog vacío', () => {
      expect(nextChangeId('')).toBe('CHG-000001');
    });
  });

  describe('recordChange', () => {
    it('AC-001/AC-002: genera entrada con changeId, timestamp, actor, operation, itemIds, commandId', () => {
      const doc = makeDoc();
      const result = recordChange(baseChangelog, {
        actor: 'agent:test',
        operation: 'update',
        itemIds: ['BLG-001'],
        commandId: 'cmd-002',
        previousDocument: doc,
        currentDocument: doc,
      });
      expect(result.entry.changeId).toBe('CHG-000002');
      expect(result.entry.actor).toBe('agent:test');
      expect(result.entry.operation).toBe('update');
      expect(result.entry.itemIds).toEqual(['BLG-001']);
      expect(result.entry.commandId).toBe('cmd-002');
      expect(result.entry.timestamp).toBeTruthy();
    });

    it('AC-005: create registra previousValue=null', () => {
      const currentDoc = makeDoc();
      const result = recordChange(baseChangelog, {
        actor: 'agent:test',
        operation: 'create',
        itemIds: ['BLG-001'],
        commandId: 'cmd-002',
        currentDocument: currentDoc,
      });
      const createChanges = result.entry.changes.filter((c) => c.previousValue === null);
      expect(createChanges.length).toBeGreaterThan(0);
    });

    it('AC-004: status_transition registra previousValue y currentValue', () => {
      const prevDoc = makeDoc();
      prevDoc.items[0].status = 'todo';
      const currDoc = makeDoc();
      currDoc.items[0].status = 'in_progress';
      const result = recordChange(baseChangelog, {
        actor: 'human:yoab',
        operation: 'status_transition',
        itemIds: ['BLG-001'],
        commandId: 'cmd-002',
        reason: 'Comenzando trabajo',
        previousDocument: prevDoc,
        currentDocument: currDoc,
      });
      const statusChange = result.entry.changes.find((c) => c.field === 'status');
      expect(statusChange).toBeDefined();
      expect(statusChange!.previousValue).toBe('todo');
      expect(statusChange!.currentValue).toBe('in_progress');
    });

    it('AC-006: status_transition requiere reason', () => {
      expect(() =>
        recordChange(baseChangelog, {
          actor: 'agent:test',
          operation: 'status_transition',
          itemIds: ['BLG-001'],
          commandId: 'cmd-002',
          previousDocument: makeDoc(),
          currentDocument: makeDoc(),
        }),
      ).toThrow('Reason is required');
    });

    it('AC-007: changelog generado sigue formato canónico', () => {
      const doc = makeDoc();
      const result = recordChange(baseChangelog, {
        actor: 'agent:test',
        operation: 'update',
        itemIds: ['BLG-001'],
        commandId: 'cmd-002',
        previousDocument: doc,
        currentDocument: doc,
      });
      expect(result.changelogMarkdown).toContain('schemaVersion:');
      expect(result.changelogMarkdown).toContain('# Changelog');
      expect(result.changelogMarkdown).toContain('CHG-000002');
      expect(result.changelogMarkdown).toContain('Timestamp:');
    });
  });

  describe('validateChangelog', () => {
    const validChangelog = `---
schemaVersion: 1
changelogId: chg-test
lastChangeId: CHG-000002
updatedAt: 2026-07-25T12:00:00.000Z
---

# Changelog

## CHG-000001

- Timestamp: 2026-07-25T12:00:00.000Z
- Actor: agent:build
- Operation: create
- Items: BLG-001
- CommandId: cmd-001

## CHG-000002

- **Timestamp:** 2026-07-25T13:00:00.000Z
- **Actor:** human:yoab
- **Operation:** update
- **Items:** BLG-001
- **CommandId:** cmd-002`;

    it('AC-001: changelog canónico retorna válido', () => {
      const result = validateChangelog(validChangelog);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('retorna válido para changelog vacío (sin entradas)', () => {
      const result = validateChangelog('---\nschemaVersion: 1\n---\n\n# Changelog\n');
      expect(result.valid).toBe(true);
    });

    it('AC-002: IDs no consecutivos detectados como error', () => {
      const changelog = validChangelog.replace('## CHG-000002', '## CHG-000005');
      const result = validateChangelog(changelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'NON_CONSECUTIVE_CHANGE_ID')).toBe(true);
    });

    it('AC-003: Timestamps inválidos detectados', () => {
      const changelog = validChangelog.replace('- **Timestamp:** 2026-07-25T13:00:00.000Z', '- **Timestamp:** not-a-timestamp');
      const result = validateChangelog(changelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_TIMESTAMP')).toBe(true);
    });

    it('AC-004: Actores con formato inválido detectados', () => {
      const changelog = validChangelog.replace('- **Actor:** human:yoab', '- **Actor:** invalid-actor');
      const result = validateChangelog(changelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_ACTOR_FORMAT')).toBe(true);
    });

    it('AC-005: Operación fuera del catálogo detectada', () => {
      const changelog = validChangelog.replace('- **Operation:** update', '- **Operation:** invalid_op');
      const result = validateChangelog(changelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_OPERATION')).toBe(true);
    });

    it('AC-006: commandId duplicado detectado', () => {
      const changelog = validChangelog.replace('- **CommandId:** cmd-002', '- **CommandId:** cmd-001');
      const result = validateChangelog(changelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_COMMAND_ID')).toBe(true);
    });

    it('DUPLICATE_ENTRY: entradas duplicadas detectadas (SCOPE-008)', () => {
      const duplicateEntry = `\n## CHG-000003\n\n- **Timestamp:** 2026-07-25T13:00:00.000Z\n- **Actor:** human:yoab\n- **Operation:** update\n- **Items:** BLG-001\n- **CommandId:** cmd-002`;
      const changelog = validChangelog + duplicateEntry;
      const result = validateChangelog(changelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_ENTRY')).toBe(true);
    });

    it('INVALID_ITEM_REFERENCE: referencias inválidas detectadas (SCOPE-007)', () => {
      const backlog: BacklogDocument = {
        schemaVersion: 1,
        backlogId: 'test',
        updatedAt: '',
        items: [
          { id: 'BLG-001', title: 'Item', status: 'todo', priority: 'high', type: 'feature', owner: 'unassigned', dependsOn: [], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: [], notes: [] },
        ],
      };
      const result = validateChangelog(validChangelog, backlog);
      expect(result.valid).toBe(true);
      const changelogBadRef = validChangelog.replace('BLG-001', 'NONEXISTENT');
      const result2 = validateChangelog(changelogBadRef, backlog);
      expect(result2.valid).toBe(false);
      expect(result2.errors.some((e) => e.code === 'INVALID_ITEM_REFERENCE')).toBe(true);
    });
  });
});
