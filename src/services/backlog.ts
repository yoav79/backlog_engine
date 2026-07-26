import type { BacklogDocument, BacklogItem, BacklogStatus, FieldChange, CreateBacklogItemInput, UpdateBacklogItemInput } from '../domain/index.js';
import { render } from '../renderer/index.js';
import { parse } from '../parser/index.js';
import { validateStructure, validateSemantics } from '../validator/index.js';
import { recordChange } from './changelog.js';
import { FileStorage } from '../storage/index.js';

export class FileAlreadyExistsError extends Error {
  public readonly code = 'FILE_ALREADY_EXISTS';
  constructor(path: string) {
    super(`FILE_ALREADY_EXISTS: El archivo ${path} ya existe. Use --force para sobrescribir.`);
    this.name = 'FileAlreadyExistsError';
  }
}

export interface InitOptions {
  force?: boolean;
  backlogId?: string;
}

export interface InitResult {
  backlogId: string;
  path: string;
  schemaVersion: number;
  status: string;
}

export class BacklogService {
  private storage: FileStorage;

  constructor(storage?: FileStorage) {
    this.storage = storage ?? new FileStorage();
  }

  async init(path: string, options: InitOptions): Promise<InitResult> {
    let fileExists = false;
    try {
      await this.storage.read(path);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (fileExists && !options.force) {
      throw new FileAlreadyExistsError(path);
    }

    const doc: BacklogDocument = {
      schemaVersion: 1,
      backlogId: options.backlogId ?? `blg-${Date.now().toString(36)}`,
      updatedAt: new Date().toISOString(),
      items: [],
    };

    const markdown = render(doc);
    const reParsed = parse(markdown);
    const structural = validateStructure(reParsed);
    if (!structural.valid) {
      throw new Error(`Round-trip validation failed: ${structural.errors.map((e) => e.message).join('; ')}`);
    }
    const semantic = validateSemantics(reParsed);
    if (!semantic.valid) {
      throw new Error(`Semantic validation failed: ${semantic.errors.map((e) => e.message).join('; ')}`);
    }

    const initialChangelog = `---
schemaVersion: 1
changelogId: chg-${Date.now().toString(36)}
lastChangeId: null
updatedAt: ${new Date().toISOString()}
---

# Changelog
`;

    const changeResult = recordChange(initialChangelog, {
      actor: 'system:init',
      operation: 'create',
      itemIds: [],
      commandId: `init-${Date.now().toString(36)}`,
      reason: 'Inicialización del backlog',
      currentDocument: doc,
    });

    const readResult = await this.storage.read(path).catch(() => null);
    const hash = readResult?.hash ?? 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

    if (fileExists) {
      await this.storage.writeAtomic(path, markdown, hash);
    } else {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, markdown, 'utf-8');
    }

    const changelogPath = path.replace(/backlog\.md$/, 'CHANGELOG.md');
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(changelogPath, changeResult.changelogMarkdown, 'utf-8');

    return { backlogId: doc.backlogId, path, schemaVersion: 1, status: 'initialized' };
  }

  async dryRunAdd(
    doc: BacklogDocument,
    title: string,
    type: string,
    priority: string,
    scope: string,
  ): Promise<{ simulatedDoc: BacklogDocument; changes: FieldChange[] }> {
    const maxNum = doc.items.reduce((max, item) => {
      const m = item.id.match(/BLG-0*(\d+)/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const newId = `BLG-${String(maxNum + 1).padStart(3, '0')}`;

    const newItem: BacklogItem = {
      id: newId,
      title,
      status: 'todo' as BacklogStatus,
      priority: priority as any,
      type: type as any,
      owner: 'unassigned',
      dependsOn: [],
      scope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: '',
      acceptanceCriteria: [],
      evidence: [],
      notes: [],
    };

    const simulatedDoc: BacklogDocument = {
      ...doc,
      items: [...doc.items, newItem],
    };

    return {
      simulatedDoc,
      changes: [
        { field: 'items', previousValue: doc.items.length, currentValue: simulatedDoc.items.length },
      ],
    };
  }

  validateTransition(item: BacklogItem, patch: Partial<BacklogItem>): void {
    const newStatus = patch.status ?? item.status;

    if (newStatus === 'in_progress') {
      const newOwner = patch.owner ?? item.owner;
      if (!newOwner || newOwner.trim() === '' || newOwner === 'unassigned') {
        const err: any = new Error('INVALID_TRANSITION: El estado in_progress requiere un owner asignado (no puede ser "unassigned").');
        err.code = 'INVALID_TRANSITION';
        throw err;
      }
    }

    if (newStatus === 'blocked') {
      const newNotes = patch.notes ?? item.notes;
      if (!newNotes || newNotes.length === 0 || newNotes.every((n: string) => n.trim() === '')) {
        const err: any = new Error('INVALID_TRANSITION: El estado blocked requiere al menos una nota explicativa.');
        err.code = 'INVALID_TRANSITION';
        throw err;
      }
    }

    if (newStatus === 'done') {
      if (item.acceptanceCriteria.length > 0) {
        const pending = item.acceptanceCriteria.filter((ac) => !ac.completed);
        if (pending.length > 0) {
          const err: any = new Error('INVALID_TRANSITION: No se puede transitar a done con acceptance criteria incompletos.');
          err.code = 'INVALID_TRANSITION';
          throw err;
        }
      }
      const newEvidence = patch.evidence ?? item.evidence;
      if (!newEvidence || newEvidence.length === 0 || newEvidence.every((e: string) => e.trim() === '')) {
        const err: any = new Error('INVALID_TRANSITION: done requiere al menos una evidencia no vacía.');
        err.code = 'INVALID_TRANSITION';
        throw err;
      }
    }
  }

  async dryRunUpdate(
    doc: BacklogDocument,
    id: string,
    patch: Partial<BacklogItem>,
  ): Promise<{ simulatedDoc: BacklogDocument; changes: FieldChange[] }> {
    const itemIndex = doc.items.findIndex((i) => i.id === id);
    if (itemIndex < 0) {
      const err: any = new Error(`ITEM_NOT_FOUND: ${id}`);
      err.code = 'ITEM_NOT_FOUND';
      throw err;
    }

    const originalItem = doc.items[itemIndex];
    this.validateTransition(originalItem, patch);

    const changes: FieldChange[] = [];

    const updatedItem = { ...originalItem };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || key === 'createdAt') continue;
      const oldVal = (originalItem as any)[key];
      const newVal = value;
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field: key, previousValue: oldVal, currentValue: newVal });
        (updatedItem as any)[key] = newVal;
      }
    }
    updatedItem.updatedAt = new Date().toISOString();

    const simulatedDoc: BacklogDocument = {
      ...doc,
      items: doc.items.map((item, i) => (i === itemIndex ? updatedItem : item)),
    };

    return { simulatedDoc, changes };
  }

  validateCloseCandidate(doc: BacklogDocument, id: string, evidence: string[]): void {
    const item = doc.items.find((i) => i.id === id);
    if (!item) throw new Error(`ITEM_NOT_FOUND: ${id}`);

    if (item.acceptanceCriteria.length > 0) {
      const pending = item.acceptanceCriteria.filter((ac) => !ac.completed);
      if (pending.length > 0) {
        const pendingTexts = pending.map((ac) => `"${ac.text}"`).join(', ');
        const err: any = new Error(`MISSING_ACCEPTANCE_CRITERIA: Los siguientes criterios de aceptación no están completos: ${pendingTexts}`);
        err.code = 'MISSING_ACCEPTANCE_CRITERIA';
        err.pendingCriteria = pending;
        throw err;
      }
    }

    const nonEmptyEvidence = evidence.filter((e) => e.trim() !== '');
    if (nonEmptyEvidence.length === 0) {
      const err: any = new Error('MISSING_EVIDENCE: Se requiere al menos una evidencia no vacía para cerrar el item.');
      err.code = 'MISSING_EVIDENCE';
      throw err;
    }
  }

  async dryRunClose(
    doc: BacklogDocument,
    id: string,
    evidence: string[],
  ): Promise<{ simulatedDoc: BacklogDocument; changes: FieldChange[] }> {
    const itemIndex = doc.items.findIndex((i) => i.id === id);
    if (itemIndex < 0) throw new Error(`ITEM_NOT_FOUND: ${id}`);

    const originalItem = doc.items[itemIndex];
    if (originalItem.status === 'done') {
      throw new Error(`ITEM_ALREADY_CLOSED: ${id}`);
    }

    this.validateCloseCandidate(doc, id, evidence);

    const changes: FieldChange[] = [
      { field: 'status', previousValue: originalItem.status, currentValue: 'done' as BacklogStatus },
    ];

    if (evidence.length > 0) {
      changes.push({ field: 'evidence', previousValue: [...originalItem.evidence], currentValue: evidence });
    }

    const updatedItem: BacklogItem = {
      ...originalItem,
      status: 'done' as BacklogStatus,
      evidence,
      updatedAt: new Date().toISOString(),
    };

    const simulatedDoc: BacklogDocument = {
      ...doc,
      items: doc.items.map((item, i) => (i === itemIndex ? updatedItem : item)),
    };

    return { simulatedDoc, changes };
  }

  get(doc: BacklogDocument, ids: string[]): { found: BacklogItem[]; notFound: { id: string; reason: string }[]; totalFound: number } {
    const found: BacklogItem[] = [];
    const notFound: { id: string; reason: string }[] = [];

    for (const id of ids) {
      const item = doc.items.find((i) => i.id === id);
      if (item) {
        found.push(item);
      } else {
        notFound.push({ id, reason: 'ITEM_NOT_FOUND' });
      }
    }

    return { found, notFound, totalFound: found.length };
  }

  list(doc: BacklogDocument, filter?: { status?: string }): { items: BacklogItem[]; total: number } {
    let items = doc.items;
    if (filter?.status) {
      items = items.filter((i) => i.status === filter.status);
    }
    return { items, total: items.length };
  }

  async add(
    doc: BacklogDocument,
    input: CreateBacklogItemInput,
    backlogPath: string,
    changelogPath: string,
    changelogContent: string,
  ): Promise<{ id: string; status: string }> {
    const maxNum = doc.items.reduce((max, item) => {
      const m = item.id.match(/BLG-0*(\d+)/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const newId = `BLG-${String(maxNum + 1).padStart(3, '0')}`;

    const newItem: BacklogItem = {
      id: newId,
      title: input.title,
      status: 'todo' as BacklogStatus,
      priority: input.priority,
      type: input.type,
      owner: input.owner ?? 'unassigned',
      dependsOn: [],
      scope: input.scope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: input.description ?? '',
      acceptanceCriteria: [],
      evidence: [],
      notes: [],
    };

    const newDoc: BacklogDocument = {
      ...doc,
      items: [...doc.items, newItem],
    };

    const markdown = render(newDoc);
    const reParsed = parse(markdown);
    const structural = validateStructure(reParsed);
    if (!structural.valid) {
      throw new Error(`ADD_REJECTED: ${structural.errors.map((e) => e.message).join('; ')}`);
    }
    const semantic = validateSemantics(reParsed);
    if (!semantic.valid) {
      throw new Error(`ADD_REJECTED: ${semantic.errors.map((e) => e.message).join('; ')}`);
    }

    const changeResult = recordChange(changelogContent, {
      actor: input.owner ?? 'system',
      operation: 'create',
      itemIds: [newId],
      commandId: `add-${Date.now().toString(36)}`,
      currentDocument: newDoc,
    });

    const repo = new FileStorage();
    const { content: _, hash } = await repo.read(backlogPath);

    await repo.writeDualAtomic(
      backlogPath,
      markdown,
      changelogPath,
      changeResult.changelogMarkdown,
      hash,
    );

    return { id: newId, status: 'created' };
  }

  async update(
    doc: BacklogDocument,
    id: string,
    patch: UpdateBacklogItemInput,
    backlogPath: string,
    changelogPath: string,
    changelogContent: string,
  ): Promise<{ id: string; status: string }> {
    const dryResult = await this.dryRunUpdate(doc, id, patch as Partial<BacklogItem>);
    const markdown = render(dryResult.simulatedDoc);
    const reParsed = parse(markdown);
    const structural = validateStructure(reParsed);
    if (!structural.valid) {
      throw new Error(`UPDATE_REJECTED: ${structural.errors.map((e) => e.message).join('; ')}`);
    }
    const semantic = validateSemantics(reParsed);
    if (!semantic.valid) {
      throw new Error(`UPDATE_REJECTED: ${semantic.errors.map((e) => e.message).join('; ')}`);
    }

    const changeResult = recordChange(changelogContent, {
      actor: patch.owner ?? 'system',
      operation: 'update',
      itemIds: [id],
      commandId: `update-${Date.now().toString(36)}`,
      previousDocument: doc,
      currentDocument: dryResult.simulatedDoc,
    });

    const repo = new FileStorage();
    const { hash } = await repo.read(backlogPath);

    await repo.writeDualAtomic(
      backlogPath,
      markdown,
      changelogPath,
      changeResult.changelogMarkdown,
      hash,
    );

    return { id, status: 'updated' };
  }

  async close(
    doc: BacklogDocument,
    id: string,
    evidence: string[],
    actor: string,
    commandId: string,
    backlogPath: string,
    changelogPath: string,
    changelogContent: string,
  ): Promise<{ id: string; status: string }> {
    const dryResult = await this.dryRunClose(doc, id, evidence);
    const markdown = render(dryResult.simulatedDoc);
    const reParsed = parse(markdown);
    const structural = validateStructure(reParsed);
    if (!structural.valid) {
      throw new Error(`CLOSE_REJECTED: ${structural.errors.map((e) => e.message).join('; ')}`);
    }
    const semantic = validateSemantics(reParsed);
    if (!semantic.valid) {
      throw new Error(`CLOSE_REJECTED: ${semantic.errors.map((e) => e.message).join('; ')}`);
    }

    const changeResult = recordChange(changelogContent, {
      actor,
      operation: 'status_transition',
      itemIds: [id],
      commandId,
      reason: 'Cierre de item',
      previousDocument: doc,
      currentDocument: dryResult.simulatedDoc,
    });

    const repo = new FileStorage();
    const { hash } = await repo.read(backlogPath);

    await repo.writeDualAtomic(
      backlogPath,
      markdown,
      changelogPath,
      changeResult.changelogMarkdown,
      hash,
    );

    return { id, status: 'closed' };
  }
}
