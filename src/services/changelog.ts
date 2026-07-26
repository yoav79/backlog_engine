import type { BacklogDocument, BacklogChange, ChangeOperation, FieldChange, ValidationResult, ValidationError } from '../domain/index.js';

export interface DedupResult {
  applied: boolean;
  reason?: string;
}

export interface RecordChangeRequest {
  actor: string;
  operation: ChangeOperation;
  itemIds: string[];
  commandId: string;
  reason?: string;
  previousDocument?: BacklogDocument;
  currentDocument: BacklogDocument;
}

export interface ChangelogResult {
  entry: BacklogChange;
  changelogMarkdown: string;
}

export function checkCommandId(changelog: string, commandId: string): DedupResult {
  const lines = changelog.split('\n');
  for (const line of lines) {
    const match = line.match(/commandid[:\s]*\*{0,2}\s*(.+?)\s*$/i);
    if (match) {
      const existingId = match[1].trim().replace(/["']/g, '').replace(/\*+$/, '').trim();
      if (existingId === commandId) {
        return { applied: false, reason: 'COMMAND_ALREADY_APPLIED' };
      }
    }
  }
  return { applied: true };
}

function getLastChangeId(changelog: string): string {
  const match = changelog.match(/lastChangeId\s*:\s*(.+)$/m);
  if (!match) return 'CHG-000000';
  return match[1].trim();
}

export function nextChangeId(changelog: string): string {
  const lastId = getLastChangeId(changelog);
  const numMatch = lastId.match(/CHG-0*(\d+)/);
  if (!numMatch) return 'CHG-000001';
  const nextNum = parseInt(numMatch[1], 10) + 1;
  return `CHG-${String(nextNum).padStart(6, '0')}`;
}

function computeFieldChanges(
  previous: BacklogDocument | undefined,
  current: BacklogDocument,
  itemIds: string[],
): FieldChange[] {
  const changes: FieldChange[] = [];

  if (!previous) {
    for (const id of itemIds) {
      const item = current.items.find((i) => i.id === id);
      if (!item) continue;
      for (const [key, value] of Object.entries(item)) {
        changes.push({
          field: key,
          previousValue: null,
          currentValue: value,
        });
      }
    }
    return changes;
  }

  for (const id of itemIds) {
    const prevItem = previous.items.find((i) => i.id === id);
    const currItem = current.items.find((i) => i.id === id);
    if (!currItem) continue;

    const fieldsToCheck: (keyof typeof currItem)[] = [
      'title', 'status', 'priority', 'type', 'owner', 'dependsOn',
      'scope', 'description', 'acceptanceCriteria', 'evidence', 'notes',
    ];

    for (const field of fieldsToCheck) {
      const prevVal = prevItem ? JSON.stringify(prevItem[field]) : null;
      const currVal = JSON.stringify(currItem[field]);
      if (prevVal !== currVal) {
        changes.push({
          field: field as string,
          previousValue: prevItem ? prevItem[field] : null,
          currentValue: currItem[field],
        });
      }
    }
  }

  return changes;
}

export function recordChange(changelog: string, request: RecordChangeRequest): ChangelogResult {
  if (request.operation === 'status_transition' || request.operation === 'delete' || request.operation === 'restore') {
    if (!request.reason) {
      throw new Error('Reason is required for status_transition, delete, and restore operations');
    }
  }

  const dedup = checkCommandId(changelog, request.commandId);
  if (!dedup.applied) {
    throw new Error(`COMMAND_ALREADY_APPLIED: commandId ${request.commandId} ya existe`);
  }

  const changeId = nextChangeId(changelog);
  const fieldChanges = computeFieldChanges(request.previousDocument, request.currentDocument, request.itemIds);

  const entry: BacklogChange = {
    changeId,
    timestamp: new Date().toISOString(),
    actor: request.actor,
    operation: request.operation,
    itemIds: request.itemIds,
    reason: request.reason,
    changes: fieldChanges,
    commandId: request.commandId,
  };

  const frontmatterMatch = changelog.match(/^---\n[\s\S]*?\n---\n/);
  let frontmatter = '---\nschemaVersion: 1\nchangelogId: chg-default\nlastChangeId: CHG-000000\nupdatedAt: ' + new Date().toISOString() + '\n---\n\n# Changelog\n';
  let existingEntries = '';

  if (frontmatterMatch) {
    const frontmatterText = frontmatterMatch[0];
    const updatedFrontmatter = frontmatterText.replace(
      /lastChangeId\s*:\s*.+$/m,
      `lastChangeId: ${changeId}`,
    ).replace(
      /updatedAt\s*:\s*.+$/m,
      `updatedAt: ${new Date().toISOString()}`,
    );
    existingEntries = changelog.slice(frontmatterMatch[0].length);
    const headerMatch = existingEntries.match(/^# Changelog\n/);
    if (headerMatch) {
      existingEntries = existingEntries.slice(headerMatch[0].length);
    }

    const entryMd = `\n## ${changeId}\n\n- **Timestamp:** ${entry.timestamp}\n- **Actor:** ${entry.actor}\n- **Operation:** ${entry.operation}\n- **Items:** ${entry.itemIds.join(', ')}\n- **CommandId:** ${entry.commandId}\n${entry.reason ? `- **Reason:** ${entry.reason}\n` : ''}${fieldChanges.length > 0 ? `- **Changes:** ${fieldChanges.length} campo(s) modificado(s)\n` : ''}`;

    const newChangelog = `${updatedFrontmatter}\n# Changelog${entryMd}${existingEntries}`;

    return { entry, changelogMarkdown: newChangelog };
  }

  const basicEntry = `\n## ${changeId}\n\n- **Timestamp:** ${entry.timestamp}\n- **Actor:** ${entry.actor}\n- **Operation:** ${entry.operation}\n- **Items:** ${entry.itemIds.join(', ')}\n- **CommandId:** ${entry.commandId}\n${entry.reason ? `- **Reason:** ${entry.reason}\n` : ''}`;

  const newChangelog = `${frontmatter}${basicEntry}`;

  return { entry, changelogMarkdown: newChangelog };
}

function stripBold(value: string): string {
  return value.replace(/^\*{1,2}\s*/, '').replace(/\s*\*{1,2}$/, '');
}

function parseChangeEntry(entryText: string): BacklogChange | null {
  const idMatch = entryText.match(/^##\s+(CHG-[0-9]+)/m);
  if (!idMatch) return null;
  const changeId = idMatch[1];

  const actor = stripBold(entryText.match(/Actor:\s*(.+)$/m)?.[1]?.trim() ?? '');
  const operation = stripBold((entryText.match(/Operation:\s*(.+)$/m)?.[1]?.trim() ?? '')) as ChangeOperation;
  const items = stripBold(entryText.match(/Items:\s*(.+)$/m)?.[1]?.trim() ?? '');
  const commandId = stripBold(entryText.match(/CommandId:\s*(.+)$/m)?.[1]?.trim() ?? '');
  const reason = stripBold(entryText.match(/Reason:\s*(.+)$/m)?.[1]?.trim() ?? '');
  const timestamp = stripBold(entryText.match(/Timestamp:\s*(.+)$/m)?.[1]?.trim() ?? '');

  return {
    changeId,
    timestamp,
    actor,
    operation,
    itemIds: items ? items.split(',').map((s: string) => s.trim()) : [],
    reason: reason || undefined,
    changes: [],
    commandId,
  };
}

function splitChangelogEntries(changelog: string): string[] {
  const entries: string[] = [];
  let current = '';
  for (const line of changelog.split('\n')) {
    if (line.startsWith('## CHG-')) {
      if (current) entries.push(current);
      current = line;
    } else {
      current += '\n' + line;
    }
  }
  if (current) entries.push(current);
  return entries;
}

export function getHistory(changelog: string, itemId: string): { entries: BacklogChange[]; total: number } {
  const entries = splitChangelogEntries(changelog)
    .map(parseChangeEntry)
    .filter((e): e is BacklogChange => e !== null)
    .filter((e) => e.itemIds.includes(itemId))
    .reverse();

  return { entries, total: entries.length };
}

export interface ChangeFilter {
  actor?: string;
  operation?: ChangeOperation;
  since?: string;
  limit?: number;
}

export function queryChanges(changelog: string, filter: ChangeFilter): { entries: BacklogChange[]; total: number } {
  let entries = splitChangelogEntries(changelog)
    .map(parseChangeEntry)
    .filter((e): e is BacklogChange => e !== null);

  if (filter.actor) {
    entries = entries.filter((e) =>
      e.actor.toLowerCase().includes(filter.actor!.toLowerCase()),
    );
  }
  if (filter.operation) {
    entries = entries.filter((e) => e.operation === filter.operation);
  }
  if (filter.since) {
    entries = entries.filter((e) => e.timestamp >= filter.since!);
  }

  entries.reverse();

  if (filter.limit && filter.limit > 0) {
    entries = entries.slice(0, filter.limit);
  }

  return { entries, total: entries.length };
}

export function diff(
  changelog: string,
  itemId: string,
  fromChangeId: string,
  toChangeId: string,
): { itemId: string; fromChangeId: string; toChangeId: string; changes: FieldChange[] } {
  const entries = splitChangelogEntries(changelog)
    .map(parseChangeEntry)
    .filter((e): e is BacklogChange => e !== null)
    .filter((e) => e.itemIds.includes(itemId));

  const toEntry = entries.find((e) => e.changeId === toChangeId);

  return {
    itemId,
    fromChangeId,
    toChangeId,
    changes: toEntry?.changes ?? [],
  };
}

export function validateChangelog(changelog: string, backlog?: BacklogDocument): ValidationResult {
  const errors: ValidationError[] = [];
  const entries = splitChangelogEntries(changelog)
    .map(parseChangeEntry)
    .filter((e): e is BacklogChange => e !== null);

  if (entries.length === 0) {
    return { valid: true, errors: [] };
  }

  const validOps = ['create', 'update', 'status_transition', 'delete', 'restore', 'bulk_update'];
  const seenCommandIds = new Set<string>();
  const seenChangeIds = new Set<string>();
  const seenEntrySignatures = new Set<string>();
  let expectedNum = 1;

  for (const entry of entries) {
    const numMatch = entry.changeId.match(/CHG-0*(\d+)/);
    const changeNum = numMatch ? parseInt(numMatch[1], 10) : 0;

    if (changeNum !== expectedNum) {
      errors.push({
        code: 'NON_CONSECUTIVE_CHANGE_ID',
        message: `Se esperaba CHG-${String(expectedNum).padStart(6, '0')}, se encontró ${entry.changeId}`,
        itemId: entry.changeId,
      });
    }
    expectedNum = changeNum + 1;

    if (seenChangeIds.has(entry.changeId)) {
      errors.push({
        code: 'DUPLICATE_CHANGE_ID',
        message: `ID de cambio duplicado: ${entry.changeId}`,
        itemId: entry.changeId,
      });
    }
    seenChangeIds.add(entry.changeId);

    if (!validOps.includes(entry.operation)) {
      errors.push({
        code: 'INVALID_OPERATION',
        message: `Operación inválida "${entry.operation}" en ${entry.changeId}. Válidas: ${validOps.join(', ')}`,
        itemId: entry.changeId,
      });
    }

    const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (!iso8601Pattern.test(entry.timestamp)) {
      errors.push({
        code: 'INVALID_TIMESTAMP',
        message: `Timestamp inválido en ${entry.changeId}: "${entry.timestamp}"`,
        itemId: entry.changeId,
      });
    }

    if (!entry.actor || !/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(entry.actor)) {
      errors.push({
        code: 'INVALID_ACTOR_FORMAT',
        message: `Formato de actor inválido en ${entry.changeId}: "${entry.actor}". Debe ser tipo:nombre`,
        itemId: entry.changeId,
      });
    }

    if (seenCommandIds.has(entry.commandId)) {
      errors.push({
        code: 'DUPLICATE_COMMAND_ID',
        message: `commandId duplicado: "${entry.commandId}" en ${entry.changeId}`,
        itemId: entry.changeId,
      });
    }
    seenCommandIds.add(entry.commandId);

    const signature = `${entry.actor}|${entry.operation}|${entry.timestamp}|${entry.commandId}|${(entry.itemIds ?? []).join(',')}`;
    if (seenEntrySignatures.has(signature)) {
      errors.push({
        code: 'DUPLICATE_ENTRY',
        message: `Entrada duplicada detectada en ${entry.changeId}: mismo actor, operación, timestamp y commandId que otra entrada.`,
        itemId: entry.changeId,
      });
    }
    seenEntrySignatures.add(signature);
  }

  if (backlog) {
    const validItemIds = new Set(backlog.items.map((i) => i.id));
    for (const entry of entries) {
      for (const itemId of entry.itemIds) {
        if (!validItemIds.has(itemId)) {
          errors.push({
            code: 'INVALID_ITEM_REFERENCE',
            message: `El itemId "${itemId}" referenciado en ${entry.changeId} no existe en el backlog.`,
            itemId: entry.changeId,
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
