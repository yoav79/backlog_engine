import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CLI', () => {
  let tmpDir: string;
  let backlogPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'backlog-cli-test-'));
    backlogPath = join(tmpDir, 'backlog.md');
  });

  afterEach(async () => {
    await unlink(backlogPath).catch(() => {});
    const changelogPath = backlogPath.replace('backlog.md', 'CHANGELOG.md');
    await unlink(changelogPath).catch(() => {});
  });

  it('AC-004: init crea backlog.md y CHANGELOG.md', async () => {
    const { initBacklog } = await import('./commands/init.js');
    const result = await initBacklog(backlogPath, {});
    expect(result.status).toBe('initialized');
    const content = await readFile(backlogPath, 'utf-8');
    expect(content).toContain('# Backlog');
    const changelogPath = backlogPath.replace('backlog.md', 'CHANGELOG.md');
    const changelogContent = await readFile(changelogPath, 'utf-8');
    expect(changelogContent).toContain('# Changelog');
  });

  it('AC-005: init sin --force sobre archivo existente da error', async () => {
    const { initBacklog } = await import('./commands/init.js');
    const { FileAlreadyExistsError } = await import('../services/backlog.js');
    await initBacklog(backlogPath, {});
    await expect(initBacklog(backlogPath, {})).rejects.toThrow(FileAlreadyExistsError);
  });

  it('AC-006: init con --force sobrescribe archivo existente', async () => {
    const { initBacklog } = await import('./commands/init.js');
    await initBacklog(backlogPath, { id: 'first' });
    await initBacklog(backlogPath, { force: true, id: 'second' });
    const content = await readFile(backlogPath, 'utf-8');
    expect(content).toContain('second');
  });

  it('AC-001: validate sobre backlog canónico retorna válido', async () => {
    const { initBacklog } = await import('./commands/init.js');
    const { validateBacklog } = await import('./commands/validate.js');
    await initBacklog(backlogPath, {});
    const result = await validateBacklog(backlogPath, {});
    expect(result.valid).toBe(true);
  });

  it('AC-002: validate sobre backlog inválido retorna errores', async () => {
    const { validateBacklog } = await import('./commands/validate.js');
    await writeFile(backlogPath, '# Wrong\nContenido inválido', 'utf-8');
    const result = await validateBacklog(backlogPath, {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
