import { readFile } from 'node:fs/promises';
import { getHistory, queryChanges } from '../../services/changelog.js';

export async function historyBacklog(path: string, id: string, options: { json?: boolean }) {
  const changelog = await readFile(path, 'utf-8');
  const result = getHistory(changelog, id);

  if (options.json) {
    console.log(JSON.stringify({ version: '1', data: result }));
  } else {
    console.log(`Historial para ${id}: ${result.total} cambio(s)`);
    for (const entry of result.entries) {
      console.log(`  ${entry.changeId} [${entry.operation}] ${entry.timestamp} — ${entry.actor}`);
    }
  }
  return result;
}

export async function changesBacklog(
  path: string,
  options: { actor?: string; operation?: string; since?: string; limit?: number; json?: boolean },
) {
  const changelog = await readFile(path, 'utf-8');
  const result = queryChanges(changelog, {
    actor: options.actor,
    operation: options.operation as any,
    since: options.since,
    limit: options.limit,
  });

  if (options.json) {
    console.log(JSON.stringify({ version: '1', data: result }));
  } else {
    console.log(`Cambios: ${result.total} entrada(s)`);
    for (const entry of result.entries) {
      console.log(`  ${entry.changeId} [${entry.operation}] ${entry.actor} — ${entry.timestamp}`);
    }
  }
  return result;
}
