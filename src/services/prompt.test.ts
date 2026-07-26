import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateManifest, generatePrompt } from './prompt.js';
import type { BacklogDocument } from '../domain/index.js';

describe('Manifest generation', () => {
  let tmpDir: string;
  let backlogPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    backlogPath = join(tmpDir, 'backlog.md');
    await writeFile(backlogPath, '# Backlog\n\nContenido de prueba', 'utf-8');
  });

  afterEach(async () => {
    await unlink(backlogPath).catch(() => {});
  });

  it('AC-001: Manifiesto contiene todos los campos requeridos', async () => {
    const manifest = await generateManifest(
      backlogPath,
      ['BLG-001', 'BLG-002'],
      ['BLG-001'],
      [{ id: 'BLG-002', reason: 'status_done' }],
      'exclude_blocked',
    );
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.backlogPath).toBe(backlogPath);
    expect(manifest.requestedIds).toEqual(['BLG-001', 'BLG-002']);
    expect(manifest.selectedIds).toEqual(['BLG-001']);
    expect(manifest.excludedItems).toHaveLength(1);
    expect(manifest.excludedItems[0].reason).toBe('status_done');
    expect(manifest.dependencyPolicy).toBe('exclude_blocked');
  });

  it('AC-002: sourceHash es SHA-256 del backlog', async () => {
    const manifest = await generateManifest(backlogPath, [], [], [], 'strict');
    expect(manifest.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('AC-003: excludedItems lista exclusiones con razón', async () => {
    const manifest = await generateManifest(
      backlogPath,
      [],
      [],
      [{ id: 'BLG-001', reason: 'not_found' }],
      'strict',
    );
    expect(manifest.excludedItems[0].id).toBe('BLG-001');
    expect(manifest.excludedItems[0].reason).toBe('not_found');
  });

  it('AC-004: No contiene IDs no solicitados', async () => {
    const manifest = await generateManifest(backlogPath, ['BLG-001'], ['BLG-001'], [], 'strict');
    expect(manifest.selectedIds).toEqual(['BLG-001']);
    expect(manifest.selectedIds).not.toContain('BLG-999');
  });
});

describe('Prompt generation', () => {
  const doc: BacklogDocument = {
    schemaVersion: 1,
    backlogId: 'test',
    updatedAt: '2026-07-25T12:00:00.000Z',
    items: [
      { id: 'BLG-001', title: 'Implement login', status: 'todo', priority: 'high', type: 'feature', owner: 'dev:alice', dependsOn: [], scope: 'core', createdAt: '', updatedAt: '', description: 'User login feature', acceptanceCriteria: [{ text: 'Should work', completed: false }], evidence: [], notes: [] },
      { id: 'BLG-002', title: 'Done task', status: 'done', priority: 'medium', type: 'bug', owner: 'unassigned', dependsOn: [], scope: '', createdAt: '', updatedAt: '', description: '', acceptanceCriteria: [], evidence: ['fixed'], notes: [] },
    ],
  };

  it('AC-001: prompt incluye solo IDs seleccionados (excluye done/cancelled)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'prompt-test-'));
    const promptPath = join(tmpDir, 'prompt.md');
    const result = await generatePrompt(doc, { ids: ['BLG-001', 'BLG-002'], outputPath: promptPath });
    expect(result.selectedCount).toBe(1);
    expect(result.excludedCount).toBe(1);
    await unlink(promptPath).catch(() => {});
  });

  it('AC-002: prompt incluye prohibiciones explícitas', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'prompt-test-'));
    const promptPath = join(tmpDir, 'prompt.md');
    await generatePrompt(doc, { ids: ['BLG-001'], outputPath: promptPath });
    const content = await readFile(promptPath, 'utf-8');
    expect(content).toContain('Do NOT');
    expect(content).toContain('Authorized IDs');
    expect(content).toContain('Implement login');
    await unlink(promptPath).catch(() => {});
  });

  it('AC-003: prompt con IDs inexistentes produce exclusiones', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'prompt-test-'));
    const promptPath = join(tmpDir, 'prompt.md');
    const result = await generatePrompt(doc, { ids: ['BLG-001', 'NONEXISTENT'], outputPath: promptPath });
    expect(result.selectedCount).toBe(1);
    expect(result.excludedCount).toBe(1);
    await unlink(promptPath).catch(() => {});
  });
});
