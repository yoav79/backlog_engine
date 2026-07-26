import type { BacklogDocument, SelectionResult, ExcludedItem } from '../domain/index.js';

export function selectWithDependencies(
  doc: BacklogDocument,
  requestedIds: string[],
  dependencyPolicy: 'strict' | 'normal' = 'strict',
): SelectionResult {
  const uniqueIds = [...new Set(requestedIds)];
  const selectedIds: string[] = [];
  const excludedItems: ExcludedItem[] = [];
  const itemsMap = new Map(doc.items.map((i) => [i.id, i]));

  for (const id of uniqueIds) {
    const item = itemsMap.get(id);
    if (!item) {
      excludedItems.push({ id, reason: 'not_found' });
      continue;
    }
    if (item.status === 'done' || item.status === 'cancelled') {
      excludedItems.push({ id, reason: 'status_final' });
      continue;
    }
    selectedIds.push(id);
  }

  for (const id of selectedIds) {
    const item = itemsMap.get(id);
    if (!item || item.dependsOn.length === 0) continue;

    const blockedDeps = item.dependsOn.filter((depId) => {
      const depItem = itemsMap.get(depId);
      return !depItem || depItem.status !== 'done';
    });

    if (blockedDeps.length > 0) {
      if (dependencyPolicy === 'strict') {
        const idx = selectedIds.indexOf(id);
        if (idx >= 0) {
          selectedIds.splice(idx, 1);
          excludedItems.push({ id, reason: 'dependency_blocked' });
        }
      } else {
        excludedItems.push({ id, reason: 'dependency_warning' });
      }
    }
  }

  return {
    requestedIds: uniqueIds,
    selectedIds,
    excludedItems,
    dependencyPolicy,
  };
}
