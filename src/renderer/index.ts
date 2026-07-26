import { unified } from 'unified';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import type { Root, YAML, Heading, Paragraph, List, ListItem, Text } from 'mdast';
import type { BacklogDocument, BacklogItem, AcceptanceCriterion } from '../domain/index.js';

function buildFrontmatter(doc: BacklogDocument): YAML {
  return {
    type: 'yaml',
    value: `schemaVersion: ${doc.schemaVersion}\nbacklogId: ${doc.backlogId}\nupdatedAt: ${doc.updatedAt}`,
  };
}

function buildText(value: string): Text {
  return { type: 'text', value };
}

function buildParagraph(value: string): Paragraph {
  return {
    type: 'paragraph',
    children: [buildText(value)],
  };
}

function buildHeading(depth: 1 | 2 | 3, text: string): Heading {
  return {
    type: 'heading',
    depth,
    children: [buildText(text)],
  };
}

function buildCheckboxItem(criterion: AcceptanceCriterion): ListItem {
  const marker = criterion.completed ? '[x]' : '[ ]';
  return {
    type: 'listItem',
    spread: false,
    checked: criterion.completed,
    children: [
      {
        type: 'paragraph',
        children: [buildText(`${marker} ${criterion.text}`)],
      },
    ],
  };
}

function buildListItem(text: string): ListItem {
  return {
    type: 'listItem',
    spread: false,
    children: [buildParagraph(text)],
  };
}

function itemIdNumber(id: string): number {
  const match = id.match(/BLG-0*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function sortItems(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => itemIdNumber(a.id) - itemIdNumber(b.id));
}

function buildMetadataListItem(label: string, value: string): ListItem {
  return {
    type: 'listItem',
    spread: false,
    children: [{
      type: 'paragraph',
      children: [
        { type: 'strong', children: [{ type: 'text', value: `${label}:` }] },
        { type: 'text', value: ` ${value}` },
      ],
    }],
  };
}

function buildItemSection(item: BacklogItem): (Heading | Paragraph | List)[] {
  const nodes: (Heading | Paragraph | List)[] = [];

  nodes.push(buildHeading(2, `${item.id}: ${item.title}`));

  const metaLines: ListItem[] = [
    buildMetadataListItem('Status', item.status),
    buildMetadataListItem('Priority', item.priority),
    buildMetadataListItem('Type', item.type),
    buildMetadataListItem('Scope', item.scope),
    buildMetadataListItem('Owner', item.owner),
  ];
  if (item.dependsOn.length > 0) {
    metaLines.push(buildMetadataListItem('Depends On', item.dependsOn.join(', ')));
  }
  metaLines.push(buildMetadataListItem('Created', item.createdAt));
  metaLines.push(buildMetadataListItem('Updated', item.updatedAt));

  nodes.push({
    type: 'list',
    spread: false,
    ordered: false,
    children: metaLines,
  });

  if (item.description) {
    nodes.push(buildHeading(3, 'Description'));
    const parts = item.description.split('\n');
    for (const part of parts) {
      if (part.trim()) {
        nodes.push(buildParagraph(part.trim()));
      }
    }
  }

  if (item.acceptanceCriteria && item.acceptanceCriteria.length > 0) {
    nodes.push(buildHeading(3, 'Acceptance Criteria'));
    nodes.push({
      type: 'list',
      spread: false,
      ordered: false,
      children: item.acceptanceCriteria.map(buildCheckboxItem),
    });
  }

  if (item.evidence && item.evidence.length > 0) {
    nodes.push(buildHeading(3, 'Evidence'));
    nodes.push({
      type: 'list',
      spread: false,
      ordered: false,
      children: item.evidence.map(buildListItem),
    });
  }

  if (item.notes && item.notes.length > 0) {
    nodes.push(buildHeading(3, 'Notes'));
    nodes.push({
      type: 'list',
      spread: false,
      ordered: false,
      children: item.notes.map(buildListItem),
    });
  }

  return nodes;
}

export function render(doc: BacklogDocument): string {
  const sortedItems = sortItems(doc.items);

  const tree: Root = {
    type: 'root',
    children: [
      buildFrontmatter(doc),
      buildHeading(1, 'Backlog'),
      ...sortedItems.flatMap(buildItemSection),
    ],
  };

  const result = unified()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkStringify, {
      bullet: '-',
      emphasis: '_',
      strong: '*',
      listItemIndent: 'one',
      incrementListMarker: false,
    })
    .stringify(tree);

  return result;
}
