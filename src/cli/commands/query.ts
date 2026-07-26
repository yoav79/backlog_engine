import { readFile } from 'node:fs/promises';
import { parse } from '../../parser/index.js';
import { BacklogService } from '../../services/backlog.js';

export async function getItems(path: string, ids: string[], options: { json?: boolean }) {
  const content = await readFile(path, 'utf-8');
  const doc = parse(content);
  const service = new BacklogService();
  const result = service.get(doc, ids);

  if (options.json) {
    console.log(JSON.stringify({ version: '1', data: result }));
  } else {
    for (const item of result.found) {
      console.log(`${item.id}: ${item.title} [${item.status}]`);
    }
    for (const nf of result.notFound) {
      console.log(`${nf.id}: ${nf.reason}`);
    }
  }
  return result;
}

export async function listItems(path: string, options: { status?: string; json?: boolean }) {
  const content = await readFile(path, 'utf-8');
  const doc = parse(content);
  const service = new BacklogService();
  const result = service.list(doc, options.status ? { status: options.status } : undefined);

  if (options.json) {
    console.log(JSON.stringify({ version: '1', data: result }));
  } else {
    console.log(`Total: ${result.total} item(s)`);
    for (const item of result.items) {
      console.log(`${item.id}: ${item.title} [${item.status}]`);
    }
  }
  return result;
}
