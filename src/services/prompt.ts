import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { BacklogDocument, BacklogItem, ExcludedItem } from '../domain/index.js';

export interface Manifest {
  schemaVersion: number;
  backlogPath: string;
  sourceHash: string;
  requestedIds: string[];
  selectedIds: string[];
  excludedItems: { id: string; reason: string }[];
  dependencyPolicy: string;
}

export interface PromptOptions {
  ids: string[];
  outputPath: string;
  excludeStatuses?: string[];
  dependencyPolicy?: 'strict' | 'normal';
  json?: boolean;
}

export interface PromptResult {
  promptPath: string;
  manifestPath?: string;
  selectedCount: number;
  excludedCount: number;
}

export async function generateManifest(
  backlogPath: string,
  requestedIds: string[],
  selectedIds: string[],
  excludedItems: { id: string; reason: string }[],
  dependencyPolicy: string,
  outputPath?: string,
): Promise<Manifest> {
  const content = await readFile(backlogPath, 'utf-8');
  const hash = createHash('sha256').update(content, 'utf-8').digest('hex');
  const sourceHash = `sha256:${hash}`;

  const manifest: Manifest = {
    schemaVersion: 1,
    backlogPath,
    sourceHash,
    requestedIds: [...new Set(requestedIds)],
    selectedIds: [...new Set(selectedIds)],
    excludedItems: excludedItems.map((e) => ({ id: e.id, reason: e.reason })),
    dependencyPolicy,
  };

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true }).catch(() => {});
    await writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  return manifest;
}

function renderItemDetail(item: BacklogItem): string {
  const lines = [
    `### ${item.id}: ${item.title}`,
    `- **Status:** ${item.status}`,
    `- **Priority:** ${item.priority}`,
    `- **Type:** ${item.type}`,
    `- **Owner:** ${item.owner}`,
    `- **Scope:** ${item.scope}`,
    `- **Description:** ${item.description || '(sin descripción)'}`,
  ];
  if (item.acceptanceCriteria.length > 0) {
    lines.push('- **Acceptance Criteria:**');
    for (const ac of item.acceptanceCriteria) {
      lines.push(`  - ${ac.completed ? '✓' : '○'} ${ac.text}`);
    }
  }
  if (item.dependsOn.length > 0) {
    lines.push(`- **Depends on:** ${item.dependsOn.join(', ')}`);
  }
  return lines.join('\n');
}

export async function generatePrompt(
  doc: BacklogDocument,
  options: PromptOptions,
): Promise<PromptResult> {
  const itemsMap = new Map(doc.items.map((i) => [i.id, i]));
  const selectedItems: BacklogItem[] = [];
  const excludedItems: ExcludedItem[] = [];
  const seen = new Set<string>();

  for (const id of options.ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = itemsMap.get(id);
    if (!item) {
      excludedItems.push({ id, reason: 'not_found' });
      continue;
    }
    const excludeStatuses = options.excludeStatuses ?? ['done', 'cancelled'];
    if (excludeStatuses.includes(item.status)) {
      excludedItems.push({ id, reason: `status_${item.status}` });
      continue;
    }
    selectedItems.push(item);
  }

  const promptParts: string[] = [
    '# Work Prompt',
    '',
    '## Objective',
    '',
    'Process the following backlog items according to the constraints below.',
    '',
    '## Authorized IDs',
    '',
    selectedItems.map((i) => `- ${i.id}: ${i.title} [${i.status}]`).join('\n') || '(none)',
    '',
    '## Item Details',
    '',
  ];

  for (const item of selectedItems) {
    promptParts.push(renderItemDetail(item));
    promptParts.push('');
  }

  if (excludedItems.length > 0) {
    promptParts.push('## Excluded Items');
    promptParts.push('');
    for (const ex of excludedItems) {
      promptParts.push(`- ${ex.id}: ${ex.reason}`);
    }
    promptParts.push('');
  }

  promptParts.push('## Constraints');
  promptParts.push('');
  promptParts.push('- Do NOT modify items outside the Authorized IDs list above.');
  promptParts.push('- Do NOT change the schema, frontmatter, or structure of the backlog.');
  promptParts.push('- Do NOT create new backlog items or delete existing ones.');
  promptParts.push('- Do NOT mark items as done without providing evidence.');
  promptParts.push('- Do NOT remove or alter acceptance criteria.');
  promptParts.push('- All changes must be backward compatible.');
  promptParts.push('');

  promptParts.push('## Required Output Format');
  promptParts.push('');
  promptParts.push('Provide the updated backlog in Markdown format following the canonical schema.');
  promptParts.push('Include only the sections that were modified. If no changes are needed, state that explicitly.');
  promptParts.push('');

  const promptContent = promptParts.join('\n');

  await mkdir(dirname(options.outputPath), { recursive: true }).catch(() => {});
  await writeFile(options.outputPath, promptContent, 'utf-8');

  return {
    promptPath: options.outputPath,
    manifestPath: undefined,
    selectedCount: selectedItems.length,
    excludedCount: excludedItems.length,
  };
}
