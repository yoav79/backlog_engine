import { readFile } from 'node:fs/promises';
import { validateChangelog } from '../../services/changelog.js';
import { parse } from '../../parser/index.js';
import type { BacklogDocument } from '../../domain/index.js';

export interface ChangelogValidateOptions {
  json?: boolean;
}

function deriveBacklogPath(changelogPath: string): string {
  return changelogPath.replace(/CHANGELOG\.md$/i, 'BACKLOG.md');
}

export async function validateChangelogCommand(path: string, options: ChangelogValidateOptions) {
  const changelog = await readFile(path, 'utf-8');

  let backlog: BacklogDocument | undefined;
  const backlogPath = deriveBacklogPath(path);
  try {
    const backlogContent = await readFile(backlogPath, 'utf-8');
    backlog = parse(backlogContent);
  } catch {
    // No backlog file available, skip cross-reference validation
  }

  const result = validateChangelog(changelog, backlog);

  if (options.json) {
    console.log(JSON.stringify({ version: '1', status: result.valid ? 'ok' : 'invalid', data: result }));
  } else if (result.valid) {
    console.log(`\x1b[32m✓\x1b[0m Changelog válido: \x1b[36m${path}\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗\x1b[0m Changelog inválido: \x1b[36m${path}\x1b[0m`);
    for (const err of result.errors) {
      console.log(`  \x1b[33m${err.code}\x1b[0m: ${err.message}`);
    }
  }

  return result;
}
