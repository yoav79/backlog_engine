import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, unlink, access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, normalize, dirname } from 'node:path';

export class SourceConflictError extends Error {
  public readonly code = 'SOURCE_CONFLICT';
  constructor(expectedHash: string, actualHash: string) {
    super(
      `SOURCE_CONFLICT: El archivo ha cambiado desde la última lectura. Esperado ${expectedHash}, actual ${actualHash}.`,
    );
    this.name = 'SourceConflictError';
  }
}

export class PathTraversalError extends Error {
  public readonly code = 'PATH_TRAVERSAL';
  constructor(path: string) {
    super(`PATH_TRAVERSAL: Ruta no permitida: ${path}`);
    this.name = 'PathTraversalError';
  }
}

export function securePath(userPath: string): string {
  if (userPath.includes('\0')) {
    throw new PathTraversalError(userPath);
  }

  const normalized = normalize(userPath);

  if (normalized.includes('..')) {
    throw new PathTraversalError(userPath);
  }

  const resolved = resolve(normalized);
  return resolved;
}

export interface ReadResult {
  content: string;
  hash: string;
}

export class FileStorage {
  async read(filePath: string): Promise<ReadResult> {
    const resolvedPath = securePath(filePath);
    await access(resolvedPath, constants.R_OK);

    const content = await readFile(resolvedPath, 'utf-8');
    const hash = createHash('sha256').update(content, 'utf-8').digest('hex');

    return { content, hash: `sha256:${hash}` };
  }

  async writeAtomic(
    filePath: string,
    content: string,
    expectedHash: string,
  ): Promise<void> {
    const resolvedPath = securePath(filePath);
    const hashPrefix = 'sha256:';

    const currentContent = await readFile(resolvedPath, 'utf-8');
    const currentHash = createHash('sha256')
      .update(currentContent, 'utf-8')
      .digest('hex');

    const expectedHashValue = expectedHash.startsWith(hashPrefix)
      ? expectedHash.slice(hashPrefix.length)
      : expectedHash;

    if (currentHash !== expectedHashValue) {
      throw new SourceConflictError(expectedHash, `sha256:${currentHash}`);
    }

    const tmpPath = `${resolvedPath}.tmp`;
    await writeFile(tmpPath, content, 'utf-8');
    try {
      await rename(tmpPath, resolvedPath);
    } catch (err) {
      await unlink(tmpPath).catch(() => {});
      throw err;
    }
  }

  async writeDualAtomic(
    backlogPath: string,
    backlogContent: string,
    changelogPath: string,
    changelogContent: string,
    expectedHash: string,
  ): Promise<void> {
    const resolvedBacklogPath = securePath(backlogPath);
    const resolvedChangelogPath = securePath(changelogPath);

    const hashPrefix = 'sha256:';
    const currentContent = await readFile(resolvedBacklogPath, 'utf-8');
    const currentHash = createHash('sha256')
      .update(currentContent, 'utf-8')
      .digest('hex');

    const expectedHashValue = expectedHash.startsWith(hashPrefix)
      ? expectedHash.slice(hashPrefix.length)
      : expectedHash;

    if (currentHash !== expectedHashValue) {
      throw new SourceConflictError(expectedHash, `sha256:${currentHash}`);
    }

    const backlogTmp = `${resolvedBacklogPath}.tmp`;
    const changelogTmp = `${resolvedChangelogPath}.tmp`;

    await mkdir(dirname(resolvedBacklogPath), { recursive: true });
    await mkdir(dirname(resolvedChangelogPath), { recursive: true });

    await writeFile(backlogTmp, backlogContent, 'utf-8');
    try {
      await writeFile(changelogTmp, changelogContent, 'utf-8');
    } catch (err) {
      await unlink(backlogTmp).catch(() => {});
      throw err;
    }

    try {
      await rename(backlogTmp, resolvedBacklogPath);
    } catch (err) {
      await unlink(backlogTmp).catch(() => {});
      await unlink(changelogTmp).catch(() => {});
      throw err;
    }

    try {
      await rename(changelogTmp, resolvedChangelogPath);
    } catch (err) {
      try {
        const { writeFile: wf } = await import('node:fs/promises');
        const originalContent = await readFile(resolvedBacklogPath, 'utf-8');
        const revertTmp = `${resolvedBacklogPath}.revert`;
        await wf(revertTmp, originalContent, 'utf-8');
        await rename(revertTmp, resolvedBacklogPath);
        await unlink(revertTmp).catch(() => {});
      } catch {
        // Rollback parcial: no se pudo revertir
      }
      await unlink(changelogTmp).catch(() => {});
      throw err;
    }
  }
}
