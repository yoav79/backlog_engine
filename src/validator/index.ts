import type { BacklogDocument, ValidationResult, ValidationError } from '../domain/index.js';
import { BACKLOG_STATUSES, PRIORITIES, ITEM_TYPES } from '../domain/index.js';

function detectCycle(
  itemId: string,
  dependsOn: string[],
  allItems: Map<string, string[]>,
  visited: Set<string>,
  path: Set<string>,
): string[] | null {
  if (path.has(itemId)) {
    return Array.from(path);
  }
  if (visited.has(itemId)) {
    return null;
  }
  visited.add(itemId);
  path.add(itemId);
  const deps = allItems.get(itemId) ?? [];
  for (const dep of deps) {
    const cycle = detectCycle(dep, dependsOn, allItems, visited, path);
    if (cycle) return cycle;
  }
  path.delete(itemId);
  return null;
}

export function validateSemantics(doc: BacklogDocument): ValidationResult {
  const errors: ValidationError[] = [];
  const seenIds = new Map<string, number>();
  const dependencyMap = new Map<string, string[]>();

  for (const item of doc.items) {
    if (seenIds.has(item.id)) {
      errors.push({
        code: 'DUPLICATE_ITEM_ID',
        message: `ID duplicado: ${item.id}`,
        itemId: item.id,
      });
    }
    seenIds.set(item.id, (seenIds.get(item.id) ?? 0) + 1);

    if (item.dependsOn.includes(item.id)) {
      errors.push({
        code: 'SELF_DEPENDENCY',
        message: `El item ${item.id} depende de sí mismo`,
        itemId: item.id,
      });
    }

    for (const depId of item.dependsOn) {
      if (!seenIds.has(depId) && !doc.items.some((i) => i.id === depId)) {
        errors.push({
          code: 'DEPENDENCY_NOT_FOUND',
          message: `La dependencia ${depId} del item ${item.id} no existe`,
          itemId: item.id,
        });
      }
    }

    dependencyMap.set(item.id, item.dependsOn);

    if (item.status === 'in_progress' && (!item.owner || item.owner === 'unassigned')) {
      errors.push({
        code: 'INVALID_STATE_OWNER',
        message: `El item ${item.id} está in_progress pero su owner es "${item.owner ?? 'unassigned'}"`,
        itemId: item.id,
      });
    }

    if (item.status === 'done') {
      const allCompleted =
        Array.isArray(item.acceptanceCriteria) &&
        item.acceptanceCriteria.length > 0 &&
        item.acceptanceCriteria.every((c) => c.completed);
      if (!allCompleted) {
        errors.push({
          code: 'MISSING_ACCEPTANCE_CRITERIA',
          message: `El item ${item.id} está done pero no todos los criteria están completos`,
          itemId: item.id,
        });
      }
      const hasEvidence = Array.isArray(item.evidence) && item.evidence.length > 0;
      if (!hasEvidence) {
        errors.push({
          code: 'MISSING_EVIDENCE',
          message: `El item ${item.id} está done pero no tiene evidencia`,
          itemId: item.id,
        });
      }
    }

    if (item.status === 'blocked') {
      const hasNotes = Array.isArray(item.notes) && item.notes.length > 0;
      if (!hasNotes) {
        errors.push({
          code: 'BLOCKED_WITHOUT_NOTES',
          message: `El item ${item.id} está blocked pero no tiene notas`,
          itemId: item.id,
        });
      }
    }
  }

  const allVisited = new Set<string>();
  for (const item of doc.items) {
    const pathSet = new Set<string>();
    const cycle = detectCycle(item.id, item.dependsOn, dependencyMap, allVisited, pathSet);
    if (cycle) {
      errors.push({
        code: 'DEPENDENCY_CYCLE',
        message: `Ciclo detectado: ${cycle.join(' -> ')}`,
        itemId: item.id,
      });
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateStructure(doc: BacklogDocument): ValidationResult {
  const errors: ValidationError[] = [];

  if (!doc.schemaVersion || doc.schemaVersion !== 1) {
    errors.push({
      code: 'INVALID_FRONTMATTER',
      message: `schemaVersion debe ser 1, se encontró ${doc.schemaVersion}`,
      path: 'frontmatter.schemaVersion',
    });
  }

  if (!doc.backlogId || typeof doc.backlogId !== 'string' || doc.backlogId.trim() === '') {
    errors.push({
      code: 'INVALID_FRONTMATTER',
      message: 'backlogId es obligatorio y debe ser un string no vacío',
      path: 'frontmatter.backlogId',
    });
  }

  if (!doc.updatedAt || typeof doc.updatedAt !== 'string') {
    errors.push({
      code: 'INVALID_FRONTMATTER',
      message: 'updatedAt es obligatorio y debe ser un string ISO 8601',
      path: 'frontmatter.updatedAt',
    });
  }

  if (!Array.isArray(doc.items)) {
    errors.push({
      code: 'MISSING_ITEMS',
      message: 'El documento debe contener un arreglo items',
      path: 'items',
    });
    return { valid: errors.length === 0, errors };
  }

  for (const item of doc.items) {
    if (!item.id || !/^BLG-[0-9]{3,6}$/.test(item.id)) {
      errors.push({
        code: 'INVALID_ITEM_ID',
        message: `ID de item inválido: "${item.id}". Debe cumplir BLG-[0-9]{3,6}`,
        path: `items[].id`,
        itemId: item.id,
      });
    }

    if (!item.title || typeof item.title !== 'string' || item.title.trim() === '') {
      errors.push({
        code: 'MISSING_TITLE',
        message: `El item ${item.id} debe tener un title no vacío`,
        path: `items[].title`,
        itemId: item.id,
      });
    }

    if (item.status && !BACKLOG_STATUSES.includes(item.status)) {
      errors.push({
        code: 'INVALID_STATUS',
        message: `Estado "${item.status}" no es válido. Valores: ${BACKLOG_STATUSES.join(', ')}`,
        path: `items[].status`,
        itemId: item.id,
      });
    }

    if (item.priority && !PRIORITIES.includes(item.priority)) {
      errors.push({
        code: 'INVALID_PRIORITY',
        message: `Prioridad "${item.priority}" no es válida. Valores: ${PRIORITIES.join(', ')}`,
        path: `items[].priority`,
        itemId: item.id,
      });
    }

    if (item.type && !ITEM_TYPES.includes(item.type)) {
      errors.push({
        code: 'INVALID_TYPE',
        message: `Tipo "${item.type}" no es válido. Valores: ${ITEM_TYPES.join(', ')}`,
        path: `items[].type`,
        itemId: item.id,
      });
    }

    if (!item.createdAt || typeof item.createdAt !== 'string') {
      errors.push({
        code: 'MISSING_CREATED_AT',
        message: `El item ${item.id} debe tener createdAt`,
        path: `items[].createdAt`,
        itemId: item.id,
      });
    }

    if (!item.updatedAt || typeof item.updatedAt !== 'string') {
      errors.push({
        code: 'MISSING_UPDATED_AT',
        message: `El item ${item.id} debe tener updatedAt`,
        path: `items[].updatedAt`,
        itemId: item.id,
      });
    }

    if (!Array.isArray(item.acceptanceCriteria)) {
      errors.push({
        code: 'MISSING_ACCEPTANCE_CRITERIA',
        message: `El item ${item.id} debe tener acceptanceCriteria como arreglo`,
        path: `items[].acceptanceCriteria`,
        itemId: item.id,
      });
    }

    if (!Array.isArray(item.evidence)) {
      errors.push({
        code: 'MISSING_EVIDENCE',
        message: `El item ${item.id} debe tener evidence como arreglo`,
        path: `items[].evidence`,
        itemId: item.id,
      });
    }

    if (!Array.isArray(item.notes)) {
      errors.push({
        code: 'MISSING_NOTES',
        message: `El item ${item.id} debe tener notes como arreglo`,
        path: `items[].notes`,
        itemId: item.id,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
