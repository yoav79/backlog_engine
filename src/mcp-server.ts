#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import type { BacklogDocument, BacklogItem, CreateBacklogItemInput, UpdateBacklogItemInput } from './domain/index.js';
import { parse } from './parser/index.js';
import { validateStructure, validateSemantics } from './validator/index.js';
import { BacklogService } from './services/backlog.js';
import { selectWithDependencies } from './services/selection.js';
import { generatePrompt } from './services/prompt.js';
import { validateChangelog } from './services/changelog.js';

function resolvePath(p: string | undefined): string {
  const cwd = process.cwd();
  return p ? join(cwd, p) : join(cwd, 'BACKLOG.md');
}

function changelogPath(backlog: string): string {
  return backlog.replace(/backlog\.md$/i, 'CHANGELOG.md');
}

async function readBacklog(path: string): Promise<{ doc: BacklogDocument; content: string }> {
  const content = await readFile(path, 'utf-8');
  return { doc: parse(content), content };
}

async function readChangelog(chgPath: string): Promise<string> {
  try {
    return await readFile(chgPath, 'utf-8');
  } catch {
    return '';
  }
}

const server = new McpServer({
  name: 'backlog-engine',
  version: '0.1.0',
});

server.tool(
  'backlog-list',
  'Listar elementos del backlog',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md (default: BACKLOG.md en raíz)'),
    status: z.enum(['todo', 'ready', 'in_progress', 'blocked', 'done', 'cancelled']).optional().describe('Filtrar por estado'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const { doc } = await readBacklog(p);
    const service = new BacklogService();
    const result = service.list(doc, args.status ? { status: args.status } : undefined);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-get',
  'Consultar elementos por ID',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md'),
    ids: z.array(z.string()).describe('IDs a consultar (ej: BLG-001, BLG-002)'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const { doc } = await readBacklog(p);
    const service = new BacklogService();
    const result = service.get(doc, args.ids);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-add',
  'Agregar nuevo elemento al backlog',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md'),
    title: z.string().describe('Título del elemento'),
    type: z.enum(['feature', 'bug', 'improvement', 'documentation']).describe('Tipo'),
    priority: z.enum(['critical', 'high', 'medium', 'low']).describe('Prioridad'),
    scope: z.string().describe('Scope del elemento'),
    owner: z.string().optional().describe('Propietario'),
    dryRun: z.boolean().optional().describe('Simular sin escribir'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const { doc } = await readBacklog(p);
    const chgPath = changelogPath(p);
    const changelogContent = await readChangelog(chgPath);
    const service = new BacklogService();

    if (args.dryRun) {
      const dryResult = await service.dryRunAdd(doc, args.title, args.type, args.priority, args.scope);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', status: 'simulated', data: { changes: dryResult.changes } }) }] };
    }

    const result = await service.add(doc, {
      title: args.title, type: args.type, priority: args.priority, scope: args.scope, owner: args.owner,
    } as CreateBacklogItemInput, p, chgPath, changelogContent);

    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-update',
  'Actualizar un elemento del backlog (patch parcial)',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md'),
    id: z.string().describe('ID del elemento (ej: BLG-001)'),
    title: z.string().optional().describe('Nuevo título'),
    status: z.enum(['todo', 'ready', 'in_progress', 'blocked', 'done', 'cancelled']).optional().describe('Nuevo estado'),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Nueva prioridad'),
    type: z.enum(['feature', 'bug', 'improvement', 'documentation']).optional().describe('Nuevo tipo'),
    owner: z.string().optional().describe('Nuevo propietario'),
    scope: z.string().optional().describe('Nuevo scope'),
    description: z.string().optional().describe('Nueva descripción'),
    dryRun: z.boolean().optional().describe('Simular sin escribir'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const { doc } = await readBacklog(p);
    const chgPath = changelogPath(p);
    const changelogContent = await readChangelog(chgPath);
    const service = new BacklogService();
    const patch: UpdateBacklogItemInput = {};
    for (const field of ['title', 'status', 'priority', 'type', 'owner', 'scope', 'description'] as const) {
      if ((args as any)[field] !== undefined) (patch as any)[field] = (args as any)[field];
    }

    if (args.dryRun) {
      const dryResult = await service.dryRunUpdate(doc, args.id, patch as Partial<BacklogItem>);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', status: 'simulated', data: { changes: dryResult.changes } }) }] };
    }

    const result = await service.update(doc, args.id, patch, p, chgPath, changelogContent);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-close',
  'Cerrar elemento con evidencia',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md'),
    id: z.string().describe('ID del elemento (ej: BLG-001)'),
    actor: z.string().describe('Actor en formato tipo:nombre (ej: human:yoab)'),
    evidence: z.array(z.string()).optional().describe('Evidencias de cierre'),
    dryRun: z.boolean().optional().describe('Simular sin escribir'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const { doc } = await readBacklog(p);
    const chgPath = changelogPath(p);
    const changelogContent = await readChangelog(chgPath);
    const service = new BacklogService();
    const evidence = args.evidence ?? [];

    if (args.dryRun) {
      const dryResult = await service.dryRunClose(doc, args.id, evidence);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', status: 'simulated', data: { changes: dryResult.changes } }) }] };
    }

    const commandId = `close-${Date.now().toString(36)}`;
    const result = await service.close(doc, args.id, evidence, args.actor, commandId, p, chgPath, changelogContent);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-validate',
  'Validar backlog estructural y semánticamente',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    try {
      const content = await readFile(p, 'utf-8');
      let doc: BacklogDocument;
      try {
        doc = parse(content);
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: { valid: false, errors: [{ code: err.code ?? 'PARSE_ERROR', message: err.message }] } }) }] };
      }
      const structural = validateStructure(doc);
      if (!structural.valid) return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: structural }) }] };
      const semantic = validateSemantics(doc);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: semantic }) }] };
    } catch {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', status: 'error', data: { valid: false, errors: [{ code: 'FILE_NOT_FOUND', message: `No se encontró el archivo: ${p}` }] } }) }] };
    }
  },
);

server.tool(
  'backlog-init',
  'Inicializar un backlog vacío en Markdown',
  {
    path: z.string().optional().describe('Ruta donde crear el BACKLOG.md (default: BACKLOG.md en raíz)'),
    force: z.boolean().optional().describe('Sobrescribir si existe'),
    id: z.string().optional().describe('ID del backlog'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const service = new BacklogService();
    const result = await service.init(p, { force: args.force, backlogId: args.id });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-select',
  'Seleccionar items pendientes excluyendo done/cancelled con validación de dependencias',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md'),
    ids: z.array(z.string()).describe('IDs a seleccionar'),
    policy: z.enum(['strict', 'normal']).optional().describe('Política de dependencias'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const { doc } = await readBacklog(p);
    const result = selectWithDependencies(doc, args.ids, (args.policy ?? 'strict') as 'strict' | 'normal');
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-prompt',
  'Generar prompt de trabajo con IDs seleccionados y restricciones',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md'),
    ids: z.array(z.string()).describe('IDs seleccionados'),
    out: z.string().describe('Ruta de salida del prompt (.md), relativa al proyecto'),
    policy: z.enum(['strict', 'normal']).optional().describe('Política de dependencias'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const { doc } = await readBacklog(p);
    const outPath = join(process.cwd(), args.out);
    const result = await generatePrompt(doc, {
      ids: args.ids,
      outputPath: outPath,
      dependencyPolicy: (args.policy ?? 'strict') as 'strict' | 'normal',
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', data: result }) }] };
  },
);

server.tool(
  'backlog-changelog-validate',
  'Validar integridad del CHANGELOG.md',
  {
    path: z.string().optional().describe('Ruta al BACKLOG.md (para derivar CHANGELOG.md)'),
  },
  async (args, _extra) => {
    const p = resolvePath(args.path);
    const chgPath = changelogPath(p);
    const changelogContent = await readChangelog(chgPath);
    if (!changelogContent) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', status: 'error', data: { valid: false, errors: [{ code: 'FILE_NOT_FOUND', message: `No se encontró el changelog: ${chgPath}` }] } }) }] };
    }
    let backlog: BacklogDocument | undefined;
    try {
      const result = await readBacklog(p);
      backlog = result.doc;
    } catch { }

    const result = validateChangelog(changelogContent, backlog);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ version: '1', status: result.valid ? 'ok' : 'invalid', data: result }) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
