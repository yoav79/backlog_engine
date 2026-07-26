import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { toString } from 'mdast-util-to-string';
import type { Root, Heading, List, ListItem, Paragraph, YAML } from 'mdast';
import type { BacklogDocument, BacklogItem, BacklogStatus, Priority, ItemType } from '../domain/index.js';
import { BACKLOG_STATUSES, PRIORITIES, ITEM_TYPES } from '../domain/index.js';

export class ParseError extends Error {
  public readonly code: string;
  public readonly line: number;
  public readonly column: number;

  constructor(code: string, message: string, line: number, column: number) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

function parseYamlFrontmatter(yaml: string): Partial<BacklogDocument> {
  const result: Partial<BacklogDocument> = {};
  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      const trimmed = value.trim();
      if (key === 'schemaVersion') result.schemaVersion = Number(trimmed) as 1;
      if (key === 'backlogId') result.backlogId = trimmed;
      if (key === 'updatedAt') result.updatedAt = trimmed;
    }
  }
  return result;
}

function positionOf(node: { position?: { start: { line: number; column: number } } }): { line: number; column: number } {
  return {
    line: node.position?.start?.line ?? 0,
    column: node.position?.start?.column ?? 0,
  };
}

function parseCheckboxItem(text: string): { text: string; completed: boolean } {
  const checkboxMatch = text.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (checkboxMatch) {
    return { text: checkboxMatch[2].trim(), completed: checkboxMatch[1] !== ' ' };
  }
  const implicitCheckbox = text.match(/^\[([ xX])\]\s+(.+)$/);
  if (implicitCheckbox) {
    return { text: implicitCheckbox[2].trim(), completed: implicitCheckbox[1] !== ' ' };
  }
  return { text: text.trim(), completed: false };
}

const METADATA_FIELDS: Record<string, keyof BacklogItem> = {
  'status': 'status',
  'priority': 'priority',
  'type': 'type',
  'scope': 'scope',
  'owner': 'owner',
  'depends on': 'dependsOn',
  'created': 'createdAt',
  'updated': 'updatedAt',
};

function parseMetadataListItem(text: string): { key: keyof BacklogItem; value: string } | null {
  const match = text.match(/^(\w[\w ]*?):\s*(.*)$/);
  if (!match) return null;
  const label = match[1].toLowerCase().trim();
  const rawValue = match[2].trim();
  const fieldKey = METADATA_FIELDS[label];
  if (!fieldKey) return null;
  return { key: fieldKey, value: rawValue };
}

export function parse(markdown: string): BacklogDocument {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']).parse(markdown) as Root;

  const doc: Partial<BacklogDocument> = {};
  const items: BacklogItem[] = [];
  let currentItem: Partial<BacklogItem> | null = null;
  let currentSection: string | null = null;

  for (const node of tree.children) {
    if (node.type === 'yaml') {
      const yamlNode = node as YAML;
      const parsed = parseYamlFrontmatter(yamlNode.value);
      Object.assign(doc, parsed);
      continue;
    }

    if (node.type === 'heading') {
      const heading = node as Heading;
      const text = toString(heading);

      if (heading.depth === 1) {
        if (text !== 'Backlog') {
          const pos = positionOf(heading);
          throw new ParseError('INVALID_ROOT_HEADING', `Encabezado raíz debe ser "# Backlog", se encontró "${text}"`, pos.line, pos.column);
        }
        currentItem = null;
        currentSection = null;
        continue;
      }

      if (heading.depth === 2) {
        const idMatch = text.match(/^(BLG-[0-9]+)\s*[:-]\s*(.+)$/);
        if (idMatch) {
          if (currentItem?.id) {
            items.push(currentItem as BacklogItem);
          }
          currentItem = {
            id: idMatch[1],
            title: idMatch[2].trim(),
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
          };
          currentSection = null;
        } else {
          currentItem = null;
          currentSection = text.toLowerCase();
        }
        continue;
      }

      if (heading.depth === 3 && currentItem) {
        currentSection = text.toLowerCase();
        continue;
      }
    }

    if (node.type === 'paragraph' && currentItem) {
      const text = toString(node as Paragraph);
      if (currentSection === 'description') {
        currentItem.description = (currentItem.description ? currentItem.description + '\n' : '') + text;
      } else if (currentSection === 'evidence') {
        currentItem.evidence = [...(currentItem.evidence ?? []), text];
      } else if (currentSection === 'notes') {
        currentItem.notes = [...(currentItem.notes ?? []), text];
      }
    }

    if (node.type === 'list' && currentItem) {
      const list = node as List;
      for (const listItem of list.children) {
        const li = listItem as ListItem;
        const paragraph = li.children.find((c): c is Paragraph => c.type === 'paragraph');
        if (!paragraph) continue;

        const text = toString(paragraph);

        if (!currentSection) {
          const meta = parseMetadataListItem(text);
          if (meta) {
            if (meta.key === 'dependsOn') {
              currentItem.dependsOn = meta.value ? meta.value.split(',').map((s) => s.trim()) : [];
            } else if (meta.key === 'status' && BACKLOG_STATUSES.includes(meta.value as BacklogStatus)) {
              currentItem.status = meta.value as BacklogStatus;
            } else if (meta.key === 'priority' && PRIORITIES.includes(meta.value as Priority)) {
              currentItem.priority = meta.value as Priority;
            } else if (meta.key === 'type' && ITEM_TYPES.includes(meta.value as ItemType)) {
              currentItem.type = meta.value as ItemType;
            } else if (meta.key === 'createdAt' || meta.key === 'updatedAt') {
              (currentItem as any)[meta.key] = meta.value;
            } else if (meta.key === 'scope' || meta.key === 'owner') {
              (currentItem as any)[meta.key] = meta.value;
            }
          }
          continue;
        }

        if (currentSection === 'acceptance criteria') {
          const parsed = parseCheckboxItem(text);
          if (li.checked !== undefined && li.checked !== null) {
            parsed.completed = li.checked;
          }
          currentItem.acceptanceCriteria = [...(currentItem.acceptanceCriteria ?? []), parsed];
        } else if (currentSection === 'evidence') {
          const { text: cleanText, completed } = parseCheckboxItem(text);
          if (!completed) {
            currentItem.evidence = [...(currentItem.evidence ?? []), cleanText];
          }
        } else if (currentSection === 'notes') {
          currentItem.notes = [...(currentItem.notes ?? []), text.replace(/^\s*[-*]\s+/, '')];
        }
      }
    }
  }

  if (currentItem?.id) {
    items.push(currentItem as BacklogItem);
  }

  return {
    schemaVersion: doc.schemaVersion ?? 1,
    backlogId: doc.backlogId ?? '',
    updatedAt: doc.updatedAt ?? '',
    items,
  };
}
