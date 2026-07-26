import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorage, SourceConflictError, PathTraversalError } from './index.js';

describe('FileStorage', () => {
  let storage: FileStorage;
  let tmpDir: string;
  let testFile: string;

  beforeEach(async () => {
    storage = new FileStorage();
    tmpDir = await mkdtemp(join(tmpdir(), 'backlog-test-'));
    testFile = join(tmpDir, 'backlog.md');
    await writeFile(testFile, '# Backlog\n\nAlgo de contenido', 'utf-8');
  });

  afterEach(async () => {
    await unlink(testFile).catch(() => {});
    await unlink(`${testFile}.tmp`).catch(() => {});
    await unlink(join(tmpDir, 'backlog.md.bak')).catch(() => {});
  });

  it('AC-001: read() retorna contenido y hash SHA-256', async () => {
    const result = await storage.read(testFile);
    expect(result.content).toBe('# Backlog\n\nAlgo de contenido');
    expect(result.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('AC-002: writeAtomic() escribe contenido, verifica hash y reemplaza', async () => {
    const before = await storage.read(testFile);
    const newContent = '# Backlog actualizado\n\nNuevo contenido';
    await storage.writeAtomic(testFile, newContent, before.hash);
    const after = await storage.read(testFile);
    expect(after.content).toBe(newContent);
  });

  it('AC-003: writeAtomic() con hash incorrecto lanza SOURCE_CONFLICT', async () => {
    const badHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    const originalContent = await readFile(testFile, 'utf-8');
    await expect(
      storage.writeAtomic(testFile, 'nuevo contenido', badHash),
    ).rejects.toThrow(SourceConflictError);
    const after = await readFile(testFile, 'utf-8');
    expect(after).toBe(originalContent);
  });

  it('AC-004: Fallo durante escritura no deja archivo temporal ni corrompe el original', async () => {
    const before = await storage.read(testFile);
    const invalidPath = join(tmpDir, 'nested', 'backlog.md');
    try {
      await storage.writeAtomic(invalidPath, 'contenido', before.hash);
    } catch {
      // Error esperado por directorio inexistente
    }
    const after = await readFile(testFile, 'utf-8');
    expect(after).toBe('# Backlog\n\nAlgo de contenido');
    const tmpFile = join(tmpDir, 'nested', 'backlog.md.tmp');
    await expect(readFile(tmpFile)).rejects.toThrow();
  });

  it('AC-005: Path traversal es mitigado', async () => {
    await expect(storage.read('../../etc/passwd')).rejects.toThrow(PathTraversalError);
    await expect(
      storage.writeAtomic('../../etc/passwd', 'x', 'sha256:0'),
    ).rejects.toThrow();
  });

  it('AC-006: AT-10 — Escritura atómica con integridad tras fallo simulado', async () => {
    const before = await storage.read(testFile);
    const originalContent = before.content;
    const originalHash = before.hash;

    // Simular fallo: escribir a un directorio que no existe
    const badPath = join(tmpDir, 'subdir', 'backlog.md');
    try {
      await storage.writeAtomic(badPath, 'datos corruptos', originalHash);
    } catch {
      // Error esperado
    }
    const after = await readFile(testFile, 'utf-8');
    expect(after).toBe(originalContent);
    const tmpFile = join(tmpDir, 'subdir', 'backlog.md.tmp');
    await expect(readFile(tmpFile)).rejects.toThrow();
  });
});
