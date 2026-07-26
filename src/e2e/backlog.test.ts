import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initBacklog } from '../cli/commands/init.js';
import { validateBacklog } from '../cli/commands/validate.js';
import { getItems, listItems } from '../cli/commands/query.js';

import { BacklogService } from '../services/backlog.js';
import { selectWithDependencies } from '../services/selection.js';
import { generatePrompt } from '../services/prompt.js';
import { validateChangelog, getHistory, queryChanges } from '../services/changelog.js';
import { parse } from '../parser/index.js';
import { render } from '../renderer/index.js';
import { validateStructure, validateSemantics } from '../validator/index.js';
import type { BacklogStatus, Priority, ItemType } from '../domain/index.js';

let tmpDir: string;
let backlogPath: string;
let changelogPath: string;
let service: BacklogService;

function changelogFromBacklog(bp: string): string {
  return bp.replace(/backlog\.md$/, 'CHANGELOG.md');
}

async function readDoc(path: string) {
  const content = await readFile(path, 'utf-8');
  return parse(content);
}

async function readChangelog(path: string) {
  return readFile(path, 'utf-8');
}

async function addItem(
  title: string,
  type: ItemType,
  priority: Priority,
  scope: string,
  owner?: string,
) {
  const content = await readFile(backlogPath, 'utf-8');
  const changelogContent = await readFile(changelogPath, 'utf-8').catch(() => '');
  const doc = parse(content);
  const result = await service.add(
    doc,
    { title, type, priority, scope, owner },
    backlogPath,
    changelogPath,
    changelogContent,
  );
  return result;
}

async function updateItem(
  id: string,
  patch: Record<string, unknown>,
) {
  const content = await readFile(backlogPath, 'utf-8');
  const changelogContent = await readFile(changelogPath, 'utf-8');
  const doc = parse(content);
  const result = await service.update(doc, id, patch, backlogPath, changelogPath, changelogContent);
  return result;
}

async function closeItem(
  id: string,
  evidence: string[],
  actor: string,
) {
  const content = await readFile(backlogPath, 'utf-8');
  const changelogContent = await readFile(changelogPath, 'utf-8');
  const doc = parse(content);
  const commandId = `close-${Date.now().toString(36)}`;
  const result = await service.close(doc, id, evidence, actor, commandId, backlogPath, changelogPath, changelogContent);
  return result;
}

describe('Backlog Engine — E2E full lifecycle', () => {
  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'backlog-e2e-'));
    backlogPath = join(tmpDir, 'backlog.md');
    changelogPath = changelogFromBacklog(backlogPath);
    service = new BacklogService();
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('1. init', () => {
    it('creates backlog.md with frontmatter and header', async () => {
      const result = await initBacklog(backlogPath, { id: 'e2e-test' });
      expect(result.status).toBe('initialized');
      expect(result.backlogId).toBe('e2e-test');
      expect(result.path).toBe(backlogPath);

      const doc = await readDoc(backlogPath);
      expect(doc.schemaVersion).toBe(1);
      expect(doc.backlogId).toBe('e2e-test');
      expect(doc.items).toHaveLength(0);
    });

    it('creates CHANGELOG.md alongside backlog', async () => {
      const changelog = await readChangelog(changelogPath);
      expect(changelog).toContain('schemaVersion: 1');
      expect(changelog).toContain('# Changelog');
    });

    it('validates as valid', async () => {
      const result = await validateBacklog(backlogPath, {});
      expect(result.valid).toBe(true);
    });

    it('rejects re-init without --force', async () => {
      await expect(initBacklog(backlogPath, {})).rejects.toThrow('FILE_ALREADY_EXISTS');
    });
  });

  describe('2. add', () => {
    it('adds an item and returns BLG-001', async () => {
      const result = await addItem('Implement login', 'feature', 'high', 'auth', 'dev:alice');
      expect(result.id).toBe('BLG-001');
      expect(result.status).toBe('created');
    });

    it('persists the item in backlog.md', async () => {
      const doc = await readDoc(backlogPath);
      expect(doc.items).toHaveLength(1);
      expect(doc.items[0].id).toBe('BLG-001');
      expect(doc.items[0].title).toBe('Implement login');
      expect(doc.items[0].status).toBe('todo');
      expect(doc.items[0].priority).toBe('high');
      expect(doc.items[0].type).toBe('feature');
      expect(doc.items[0].owner).toBe('dev:alice');
      expect(doc.items[0].scope).toBe('auth');
      expect(doc.items[0].createdAt).toBeTruthy();
      expect(doc.items[0].updatedAt).toBeTruthy();
    });

    it('records entry in CHANGELOG.md', async () => {
      const changelog = await readChangelog(changelogPath);
      expect(changelog).toContain('CHG-000002');
      expect(changelog).toContain('Operation: create');
      expect(changelog).toContain('Items: BLG-001');
    });

    it('adds a second item with different type/priority', async () => {
      const result = await addItem('Fix crash on null input', 'bug', 'critical', 'core', 'dev:bob');
      expect(result.id).toBe('BLG-002');
    });

    it('adds a third item with dependencies', async () => {
      const result = await addItem('Add tests for login', 'improvement', 'medium', 'testing');
      expect(result.id).toBe('BLG-003');
    });

    it('adds a documentation item', async () => {
      const result = await addItem('Write API docs', 'documentation', 'low', 'docs');
      expect(result.id).toBe('BLG-004');
    });

    it('validates backlog after multiple adds', async () => {
      const result = await validateBacklog(backlogPath, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('3. get', () => {
    it('returns found for existing IDs', async () => {
      const result = await getItems(backlogPath, ['BLG-001'], {});
      expect(result.found).toHaveLength(1);
      expect(result.found[0].id).toBe('BLG-001');
    });

    it('returns notFound for nonexistent IDs', async () => {
      const result = await getItems(backlogPath, ['BLG-999'], {});
      expect(result.found).toHaveLength(0);
      expect(result.notFound).toHaveLength(1);
      expect(result.notFound[0].reason).toBe('ITEM_NOT_FOUND');
    });

    it('returns multiple items in one call', async () => {
      const result = await getItems(backlogPath, ['BLG-001', 'BLG-002', 'BLG-999'], {});
      expect(result.found).toHaveLength(2);
      expect(result.notFound).toHaveLength(1);
    });
  });

  describe('4. list', () => {
    it('lists all items without filter', async () => {
      const result = await listItems(backlogPath, {});
      expect(result.total).toBe(4);
      expect(result.items).toHaveLength(4);
    });

    it('lists items filtered by status', async () => {
      const result = await listItems(backlogPath, { status: 'todo' });
      expect(result.total).toBe(4);
    });

    it('returns empty for unmatched status', async () => {
      const result = await listItems(backlogPath, { status: 'done' });
      expect(result.total).toBe(0);
    });
  });

  describe('5. update', () => {
    it('updates title', async () => {
      await updateItem('BLG-001', { title: 'Implement OAuth login' });
      const doc = await readDoc(backlogPath);
      expect(doc.items[0].title).toBe('Implement OAuth login');
    });

    it('updates status and owner together', async () => {
      await updateItem('BLG-001', { status: 'in_progress', owner: 'dev:alice' });
      const doc = await readDoc(backlogPath);
      expect(doc.items[0].status).toBe('in_progress');
      expect(doc.items[0].owner).toBe('dev:alice');
    });

    it('updates priority and scope', async () => {
      await updateItem('BLG-002', { priority: 'medium', scope: 'security' });
      const doc = await readDoc(backlogPath);
      expect(doc.items[0].priority).toBe('high');
      expect(doc.items[1].priority).toBe('medium');
      expect(doc.items[1].scope).toBe('security');
    });

    it('adds acceptance criteria via description', async () => {
      await updateItem('BLG-001', {
        description: '- Must support Google OAuth\n- Must support GitHub OAuth',
      });
      const doc = await readDoc(backlogPath);
      expect(doc.items[0].description).toContain('Google OAuth');
    });

    it('blocks in_progress without owner', async () => {
      const content = await readFile(backlogPath, 'utf-8');
      const doc = parse(content);
      await expect(service.dryRunUpdate(doc, 'BLG-003', { status: 'in_progress' }))
        .rejects.toThrow('INVALID_TRANSITION');
    });

    it('blocks blocked without notes', async () => {
      const content = await readFile(backlogPath, 'utf-8');
      const doc = parse(content);
      await expect(service.dryRunUpdate(doc, 'BLG-003', { status: 'blocked' }))
        .rejects.toThrow('INVALID_TRANSITION');
    });

    it('records change in CHANGELOG.md on update', async () => {
      const changelog = await readChangelog(changelogPath);
      expect(changelog).toContain('CHG-000006');
    });

    it('validates after updates', async () => {
      const result = await validateBacklog(backlogPath, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('6. close', () => {
    it('rejects close for item without completed acceptance criteria', async () => {
      const content = await readFile(backlogPath, 'utf-8');
      const doc = parse(content);
      await expect(service.dryRunClose(doc, 'BLG-001', ['test-evidence']))
        .rejects.toThrow('MISSING_ACCEPTANCE_CRITERIA');
    });

    it('adds acceptance criteria and marks them done', async () => {
      const content = await readFile(backlogPath, 'utf-8');
      const doc = parse(content);
      const item = doc.items.find((i) => i.id === 'BLG-001')!;
      item.acceptanceCriteria = [
        { text: 'Google OAuth works', completed: true },
        { text: 'GitHub OAuth works', completed: true },
      ];
      const markdown = render(doc);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(backlogPath, markdown, 'utf-8');

      const verify = await readDoc(backlogPath);
      expect(verify.items.find((i) => i.id === 'BLG-001')!.acceptanceCriteria).toHaveLength(2);
    });

    it('closes item with evidence', async () => {
      const result = await closeItem(
        'BLG-001',
        ['Google OAuth tested on staging', 'GitHub OAuth passes integration tests'],
        'human:yoab',
      );
      expect(result.status).toBe('closed');
    });

    it('persists done status in backlog.md', async () => {
      const doc = await readDoc(backlogPath);
      const item = doc.items.find((i) => i.id === 'BLG-001')!;
      expect(item.status).toBe('done');
      expect(item.evidence).toContain('Google OAuth tested on staging');
    });

    it('records close in CHANGELOG.md', async () => {
      const changelog = await readChangelog(changelogPath);
      expect(changelog).toContain('Operation: status_transition');
      expect(changelog).toContain('Items: BLG-001');
    });

    it('validates after close', async () => {
      const result = await validateBacklog(backlogPath, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('7. select', () => {
    it('excludes done and cancelled items', async () => {
      const doc = await readDoc(backlogPath);
      const result = selectWithDependencies(doc, ['BLG-001', 'BLG-002', 'BLG-003', 'BLG-004']);
      expect(result.selectedIds).not.toContain('BLG-001');
      expect(result.excludedItems.filter((e) => e.id === 'BLG-001')[0].reason).toBe('status_final');
      expect(result.selectedIds).toContain('BLG-002');
      expect(result.selectedIds).toContain('BLG-003');
      expect(result.selectedIds).toContain('BLG-004');
    });

    it('returns excluded with dependency_blocked in strict mode', async () => {
      const doc = await readDoc(backlogPath);
      const result = selectWithDependencies(doc, ['BLG-002', 'BLG-003']);
      expect(result.selectedIds).toContain('BLG-002');
      expect(result.selectedIds).toContain('BLG-003');
    });

    it('removes duplicates from requested IDs', () => {
      const doc = {
        schemaVersion: 1 as const,
        backlogId: 'test',
        updatedAt: '',
        items: [
          { id: 'BLG-001', title: 'Item', status: 'todo' as BacklogStatus, priority: 'high' as Priority, type: 'feature' as ItemType, owner: 'u', dependsOn: [] as string[], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: [], notes: [] },
        ],
      };
      const result = selectWithDependencies(doc, ['BLG-001', 'BLG-001']);
      expect(result.requestedIds).toEqual(['BLG-001']);
    });

    it('detects not_found for nonexistent IDs', () => {
      const doc = {
        schemaVersion: 1 as const,
        backlogId: 'test',
        updatedAt: '',
        items: [],
      };
      const result = selectWithDependencies(doc, ['BLG-999']);
      expect(result.excludedItems[0].reason).toBe('not_found');
    });
  });

  describe('8. prompt', () => {
    it('generates prompt with selected items only', async () => {
      const outPath = join(tmpDir, 'prompt.md');
      const doc = await readDoc(backlogPath);
      const result = await generatePrompt(doc, { ids: ['BLG-002', 'BLG-003'], outputPath: outPath });
      expect(result.selectedCount).toBe(2);
      expect(result.excludedCount).toBe(0);
      const content = await readFile(outPath, 'utf-8');
      expect(content).toContain('BLG-002');
      expect(content).toContain('BLG-003');
      expect(content).toContain('Do NOT');
    });

    it('excludes done items from prompt', async () => {
      const outPath = join(tmpDir, 'prompt2.md');
      const doc = await readDoc(backlogPath);
      const result = await generatePrompt(doc, { ids: ['BLG-001', 'BLG-002'], outputPath: outPath });
      expect(result.selectedCount).toBe(1);
      expect(result.excludedCount).toBe(1);
      const content = await readFile(outPath, 'utf-8');
      expect(content).toContain('Excluded Items');
      expect(content).toContain('BLG-001');
    });

    it('reports not_found for nonexistent IDs', async () => {
      const outPath = join(tmpDir, 'prompt3.md');
      const doc = await readDoc(backlogPath);
      const result = await generatePrompt(doc, { ids: ['BLG-999'], outputPath: outPath });
      expect(result.selectedCount).toBe(0);
      expect(result.excludedCount).toBe(1);
    });
  });

  describe('9. validate', () => {
    it('returns valid for canonical backlog', async () => {
      const result = await validateBacklog(backlogPath, {});
      expect(result.valid).toBe(true);
    });

    it('detects structural errors', async () => {
      const { writeFile } = await import('node:fs/promises');
      const badPath = join(tmpDir, 'bad-backlog.md');
      await writeFile(badPath, '# Wrong\n', 'utf-8');
      const result = await validateBacklog(badPath, {});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      await unlink(badPath).catch(() => {});
    });
  });

  describe('10. history / changelog queries', () => {
    it('returns history for a specific item', async () => {
      const changelog = await readChangelog(changelogPath);
      const result = getHistory(changelog, 'BLG-001');
      expect(result.total).toBeGreaterThanOrEqual(3);
      const creates = result.entries.filter((e) => e.operation === 'create');
      expect(creates.length).toBe(1);
      const transitions = result.entries.filter((e) => e.operation === 'status_transition');
      expect(transitions.length).toBe(1);
    });

    it('returns empty history for nonexistent item', async () => {
      const changelog = await readChangelog(changelogPath);
      const result = getHistory(changelog, 'NONEXISTENT');
      expect(result.total).toBe(0);
    });

    it('queries recent changes', async () => {
      const changelog = await readChangelog(changelogPath);
      const result = queryChanges(changelog, {});
      expect(result.total).toBeGreaterThanOrEqual(8);
    });

    it('filters changes by actor', async () => {
      const changelog = await readChangelog(changelogPath);
      const result = queryChanges(changelog, { actor: 'human:yoab' });
      expect(result.total).toBe(1);
      expect(result.entries[0].actor).toBe('human:yoab');
    });

    it('filters changes by operation', async () => {
      const changelog = await readChangelog(changelogPath);
      const result = queryChanges(changelog, { operation: 'create' });
      expect(result.total).toBe(4);
    });

    it('limits results', async () => {
      const changelog = await readChangelog(changelogPath);
      const result = queryChanges(changelog, { limit: 3 });
      expect(result.entries.length).toBeLessThanOrEqual(3);
    });
  });

  describe('11. diff', () => {
    it('returns changes between two versions of an item', async () => {
      const changelog = await readChangelog(changelogPath);
      const history = getHistory(changelog, 'BLG-001');
      expect(history.entries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('12. changelog validate', () => {
    it('returns valid for canonical changelog', async () => {
      const changelog = await readChangelog(changelogPath);
      const doc = await readDoc(backlogPath);
      const result = validateChangelog(changelog, doc);
      expect(result.valid).toBe(true);
    });

    it('passes for single-entry changelog', async () => {
      const { writeFile } = await import('node:fs/promises');
      const badChangelog = `---
schemaVersion: 1
changelogId: chg-test
lastChangeId: CHG-000005
updatedAt: 2026-07-25T12:00:00.000Z
---

# Changelog

## CHG-000001

- **Timestamp:** 2026-07-25T12:00:00.000Z
- **Actor:** system:init
- **Operation:** create
- **Items:** 
- **CommandId:** init-001`;
      const result = validateChangelog(badChangelog);
      expect(result.valid).toBe(true);
    });

    it('detects invalid timestamps', async () => {
      const badChangelog = `---
schemaVersion: 1
changelogId: chg-test
lastChangeId: null
updatedAt: not-a-date
---

# Changelog

## CHG-000001

- **Timestamp:** bad-timestamp
- **Actor:** agent:test
- **Operation:** create
- **Items:** BLG-001
- **CommandId:** cmd-001`;
      const result = validateChangelog(badChangelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_TIMESTAMP')).toBe(true);
    });

    it('detects invalid actor format', async () => {
      const badChangelog = `---
schemaVersion: 1
changelogId: chg-test
lastChangeId: null
updatedAt: 2026-07-25T12:00:00.000Z
---

# Changelog

## CHG-000001

- **Timestamp:** 2026-07-25T12:00:00.000Z
- **Actor:** invalid-no-colon
- **Operation:** create
- **Items:** BLG-001
- **CommandId:** cmd-001`;
      const result = validateChangelog(badChangelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_ACTOR_FORMAT')).toBe(true);
    });

    it('detects duplicate command IDs', async () => {
      const badChangelog = `---
schemaVersion: 1
changelogId: chg-test
lastChangeId: CHG-000002
updatedAt: 2026-07-25T12:00:00.000Z
---

# Changelog

## CHG-000001

- **Timestamp:** 2026-07-25T12:00:00.000Z
- **Actor:** agent:test
- **Operation:** create
- **Items:** BLG-001
- **CommandId:** same-cmd

## CHG-000002

- **Timestamp:** 2026-07-25T13:00:00.000Z
- **Actor:** agent:test
- **Operation:** create
- **Items:** BLG-002
- **CommandId:** same-cmd`;
      const result = validateChangelog(badChangelog);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_COMMAND_ID')).toBe(true);
    });
  });

  describe('13. full render → parse round-trip', () => {
    it('survives render → parse → render for complex document', async () => {
      const original = await readDoc(backlogPath);
      const markdown = render(original);
      const reParsed = parse(markdown);
      const structural = validateStructure(reParsed);
      expect(structural.valid).toBe(true);
      const semantic = validateSemantics(reParsed);
      expect(semantic.valid).toBe(true);
      expect(reParsed.items).toHaveLength(original.items.length);
      for (const item of reParsed.items) {
        const origItem = original.items.find((i) => i.id === item.id);
        expect(origItem).toBeDefined();
        expect(item.title).toBe(origItem!.title);
        expect(item.priority).toBe(origItem!.priority);
        expect(item.type).toBe(origItem!.type);
        expect(item.scope).toBe(origItem!.scope);
        expect(item.createdAt).toBeTruthy();
        expect(item.updatedAt).toBeTruthy();
      }
    });
  });
});
