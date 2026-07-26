#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('backlog')
  .description('Backlog Engine — Utilería determinista para gestión de backlogs en Markdown')
  .version('0.1.0');

program
  .command('init <path>')
  .description('Inicializar backlog vacío')
  .option('--force', 'Sobrescribir archivo existente')
  .option('--id <id>', 'ID del backlog')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: { force?: boolean; id?: string; json?: boolean }) => {
    try {
      const { initBacklog } = await import('./commands/init.js');
      const result = await initBacklog(path, options);
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'ok', data: result }));
      } else {
        console.log(`\x1b[32m✓\x1b[0m Backlog inicializado: \x1b[36m${path}\x1b[0m`);
      }
      process.exit(0);
    } catch (err: any) {
      if (err.code === 'FILE_ALREADY_EXISTS') {
        if (options.json) {
          console.log(JSON.stringify({ version: '1', status: 'error', error: { code: 'FILE_ALREADY_EXISTS', message: err.message } }));
        } else {
          console.log(`\x1b[31m✗\x1b[0m ${err.message}`);
        }
        process.exit(7);
      }
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'error', error: { code: err.code ?? 'UNKNOWN', message: err.message } }));
      } else {
        console.log(`\x1b[31m✗\x1b[0m ${err.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('validate <path>')
  .description('Validar backlog estructural y semánticamente')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: { json?: boolean }) => {
    try {
      const { validateBacklog } = await import('./commands/validate.js');
      const result = await validateBacklog(path, options);
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: result.valid ? 'ok' : 'invalid', data: result }));
      } else if (result.valid) {
        console.log(`\x1b[32m✓\x1b[0m Backlog válido: \x1b[36m${path}\x1b[0m`);
      } else {
        console.log(`\x1b[31m✗\x1b[0m Backlog inválido: \x1b[36m${path}\x1b[0m`);
        for (const err of result.errors) {
          console.log(`  \x1b[33m${err.code}\x1b[0m: ${err.message}`);
        }
      }
      process.exit(result.valid ? 0 : 3);
    } catch (err: any) {
      const exitCode = err.code === 'ITEM_NOT_FOUND' ? 4 : err.code === 'INVALID_TRANSITION' ? 5 : 1;
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'error', error: { code: err.code ?? 'UNKNOWN', message: err.message } }));
      } else {
        console.log(`\x1b[31m✗\x1b[0m ${err.message}`);
      }
      process.exit(exitCode);
    }
  });

program
  .command('get <path> <ids...>')
  .description('Consultar registros por ID')
  .option('--json', 'Salida JSON')
  .action(async (path: string, ids: string[], options: { json?: boolean }) => {
    try {
      const { getItems } = await import('./commands/query.js');
      await getItems(path, ids, options);
      process.exit(0);
    } catch (err: any) {
      console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('list <path>')
  .description('Listar registros')
  .option('--status <status>', 'Filtrar por estado')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: { status?: string; json?: boolean }) => {
    try {
      const { listItems } = await import('./commands/query.js');
      await listItems(path, options);
      process.exit(0);
    } catch (err: any) {
      console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('history <path> <id>')
  .description('Consultar historial de cambios de un registro')
  .option('--json', 'Salida JSON')
  .action(async (path: string, id: string, options: { json?: boolean }) => {
    try {
      const { historyBacklog } = await import('./commands/history.js');
      await historyBacklog(path, id, options);
      process.exit(0);
    } catch (err: any) {
      console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('changes <path>')
  .description('Consultar cambios recientes')
  .option('--actor <actor>', 'Filtrar por actor')
  .option('--operation <op>', 'Filtrar por operación')
  .option('--since <date>', 'Desde fecha (ISO 8601)')
  .option('--limit <n>', 'Límite de resultados')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: any) => {
    try {
      const { changesBacklog } = await import('./commands/history.js');
      await changesBacklog(path, {
        actor: options.actor,
        operation: options.operation,
        since: options.since,
        limit: options.limit ? parseInt(options.limit, 10) : undefined,
        json: options.json,
      });
      process.exit(0);
    } catch (err: any) {
      console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('diff <path> <id> <fromChangeId> <toChangeId>')
  .description('Mostrar diferencias entre dos versiones')
  .option('--json', 'Salida JSON')
  .action(async (path: string, id: string, fromChangeId: string, toChangeId: string, options: { json?: boolean }) => {
    try {
      const { diff } = await import('../services/changelog.js');
      const { readFile } = await import('node:fs/promises');
      const changelog = await readFile(path, 'utf-8');
      const result = diff(changelog, id, fromChangeId, toChangeId);
      if (options.json) {
        console.log(JSON.stringify({ version: '1', data: result }));
      } else {
        console.log(`Diff de ${id}: ${fromChangeId} → ${toChangeId}`);
        for (const change of result.changes) {
          console.log(`  ${change.field}: ${JSON.stringify(change.previousValue)} → ${JSON.stringify(change.currentValue)}`);
        }
      }
      process.exit(0);
    } catch (err: any) {
      console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('add <path>')
  .description('Agregar nuevo elemento al backlog')
  .requiredOption('--title <title>', 'Título del elemento')
  .requiredOption('--type <type>', 'Tipo (feature, bug, improvement, documentation)')
  .requiredOption('--priority <priority>', 'Prioridad (critical, high, medium, low)')
  .requiredOption('--scope <scope>', 'Scope del elemento')
  .option('--owner <owner>', 'Propietario')
  .option('--dry-run', 'Simular operación sin escribir')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: any) => {
    try {
      const { readFile } = await import('node:fs/promises');
      const { parse } = await import('../parser/index.js');
      const { BacklogService } = await import('../services/backlog.js');
      const content = await readFile(path, 'utf-8');
      const changelogPath = path.replace(/backlog\.md$/i, 'CHANGELOG.md');
      let changelogContent = '';
      try {
        changelogContent = await readFile(changelogPath, 'utf-8');
      } catch { /* no changelog yet */ }

      const doc = parse(content);
      const service = new BacklogService();

      if (options.dryRun) {
        const dryResult = await service.dryRunAdd(doc, options.title, options.type, options.priority, options.scope);
        if (options.json) {
          console.log(JSON.stringify({ version: '1', status: 'simulated', data: { changes: dryResult.changes, simulatedDoc: dryResult.simulatedDoc } }));
        } else {
          console.log(`\x1b[33m~\x1b[0m [DRY-RUN] Elemento simulado: \x1b[36m${dryResult.simulatedDoc.items[dryResult.simulatedDoc.items.length - 1].id}\x1b[0m`);
          for (const change of dryResult.changes) {
            console.log(`  \x1b[33m${change.field}\x1b[0m: ${JSON.stringify(change.previousValue)} → ${JSON.stringify(change.currentValue)}`);
          }
        }
        process.exit(0);
      }

      const result = await service.add(doc, {
        title: options.title,
        type: options.type,
        priority: options.priority,
        scope: options.scope,
        owner: options.owner,
      }, path, changelogPath, changelogContent);

      if (options.json) {
        console.log(JSON.stringify({ version: '1', data: result }));
      } else {
        console.log(`\x1b[32m✓\x1b[0m Elemento creado: \x1b[36m${result.id}\x1b[0m`);
      }
      process.exit(0);
    } catch (err: any) {
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'error', error: { message: err.message } }));
      } else {
        console.log(`\x1b[31m✗\x1b[0m ${err.message}`);
      }
      process.exit(5);
    }
  });

program
  .command('update <path>')
  .description('Actualizar elemento del backlog por ID')
  .requiredOption('--id <id>', 'ID del elemento a actualizar')
  .option('--title <title>', 'Nuevo título')
  .option('--status <status>', 'Nuevo estado (todo, ready, in_progress, blocked, done, cancelled)')
  .option('--priority <priority>', 'Nueva prioridad (critical, high, medium, low)')
  .option('--type <type>', 'Nuevo tipo (feature, bug, improvement, documentation)')
  .option('--owner <owner>', 'Nuevo propietario')
  .option('--scope <scope>', 'Nuevo scope')
  .option('--description <desc>', 'Nueva descripción')
  .option('--dry-run', 'Simular operación sin escribir')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: any) => {
    try {
      const { readFile } = await import('node:fs/promises');
      const { parse } = await import('../parser/index.js');
      const { BacklogService } = await import('../services/backlog.js');
      const content = await readFile(path, 'utf-8');
      const changelogPath = path.replace(/backlog\.md$/i, 'CHANGELOG.md');
      let changelogContent = '';
      try {
        changelogContent = await readFile(changelogPath, 'utf-8');
      } catch { /* no changelog yet */ }

      const doc = parse(content);
      const service = new BacklogService();
      const patch: Record<string, any> = {};
      for (const field of ['title', 'status', 'priority', 'type', 'owner', 'scope', 'description']) {
        if (options[field] !== undefined) patch[field] = options[field];
      }

      if (options.dryRun) {
        const dryResult = await service.dryRunUpdate(doc, options.id, patch);
        if (options.json) {
          console.log(JSON.stringify({ version: '1', status: 'simulated', data: { changes: dryResult.changes, simulatedDoc: dryResult.simulatedDoc } }));
        } else {
          console.log(`\x1b[33m~\x1b[0m [DRY-RUN] Actualización simulada de \x1b[36m${options.id}\x1b[0m`);
          for (const change of dryResult.changes) {
            console.log(`  \x1b[33m${change.field}\x1b[0m: ${JSON.stringify(change.previousValue)} → ${JSON.stringify(change.currentValue)}`);
          }
        }
        process.exit(0);
      }

      const result = await service.update(doc, options.id, patch, path, changelogPath, changelogContent);
      if (options.json) {
        console.log(JSON.stringify({ version: '1', data: result }));
      } else {
        console.log(`\x1b[32m✓\x1b[0m Elemento actualizado: \x1b[36m${result.id}\x1b[0m (${result.status})`);
      }
      process.exit(0);
    } catch (err: any) {
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'error', error: { message: err.message } }));
      } else {
        console.log(`\x1b[31m✗\x1b[0m ${err.message}`);
      }
      process.exit(5);
    }
  });

program
  .command('close <path>')
  .description('Cerrar elemento del backlog con evidencia')
  .requiredOption('--id <id>', 'ID del elemento a cerrar')
  .requiredOption('--actor <actor>', 'Actor que cierra (formato tipo:nombre)')
  .option('--evidence <items...>', 'Evidencias de cierre')
  .option('--dry-run', 'Simular operación sin escribir')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: any) => {
    try {
      const { readFile } = await import('node:fs/promises');
      const { parse } = await import('../parser/index.js');
      const { BacklogService } = await import('../services/backlog.js');
      const content = await readFile(path, 'utf-8');
      const changelogPath = path.replace(/backlog\.md$/i, 'CHANGELOG.md');
      let changelogContent = '';
      try {
        changelogContent = await readFile(changelogPath, 'utf-8');
      } catch { /* no changelog yet */ }

      const doc = parse(content);
      const service = new BacklogService();
      const evidence = options.evidence ? (Array.isArray(options.evidence) ? options.evidence : [options.evidence]) : [];
      const commandId = `close-${Date.now().toString(36)}`;

      if (options.dryRun) {
        const dryResult = await service.dryRunClose(doc, options.id, evidence);
        if (options.json) {
          console.log(JSON.stringify({ version: '1', status: 'simulated', data: { changes: dryResult.changes, simulatedDoc: dryResult.simulatedDoc } }));
        } else {
          console.log(`\x1b[33m~\x1b[0m [DRY-RUN] Cierre simulado de \x1b[36m${options.id}\x1b[0m`);
          for (const change of dryResult.changes) {
            console.log(`  \x1b[33m${change.field}\x1b[0m: ${JSON.stringify(change.previousValue)} → ${JSON.stringify(change.currentValue)}`);
          }
        }
        process.exit(0);
      }

      const result = await service.close(doc, options.id, evidence, options.actor, commandId, path, changelogPath, changelogContent);
      if (options.json) {
        console.log(JSON.stringify({ version: '1', data: result }));
      } else {
        console.log(`\x1b[32m✓\x1b[0m Elemento cerrado: \x1b[36m${result.id}\x1b[0m (${result.status})`);
      }
      process.exit(0);
    } catch (err: any) {
      const exitCode = err.code === 'MISSING_ACCEPTANCE_CRITERIA' || err.code === 'MISSING_EVIDENCE' ? 5 : 1;
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'error', error: { code: err.code ?? 'UNKNOWN', message: err.message } }));
      } else {
        console.log(`\x1b[31m✗\x1b[0m ${err.message}`);
      }
      process.exit(exitCode);
    }
  });

program
  .command('select <path>')
  .description('Seleccionar items pendientes excluyendo done/cancelled')
  .requiredOption('--ids <ids>', 'IDs separados por coma (ej: BLG-001,BLG-002)')
  .option('--policy <policy>', 'Política de dependencias: strict (excluye) o normal (warning)', 'strict')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: any) => {
    try {
      const { readFile } = await import('node:fs/promises');
      const { parse } = await import('../parser/index.js');
      const { selectWithDependencies } = await import('../services/selection.js');
      const content = await readFile(path, 'utf-8');
      const doc = parse(content);
      const ids = options.ids.split(',').map((s: string) => s.trim()).filter(Boolean);
      const policy = options.policy === 'normal' ? 'normal' : 'strict';
      const result = selectWithDependencies(doc, ids, policy);

      if (options.json) {
        console.log(JSON.stringify({ version: '1', data: result }));
      } else {
        console.log(`Solicitados: ${result.requestedIds.length} | Seleccionados: ${result.selectedIds.length} | Excluidos: ${result.excludedItems.length}`);
        console.log(`Política: ${result.dependencyPolicy}`);
        if (result.selectedIds.length > 0) {
          console.log(`\x1b[32mSeleccionados:\x1b[0m ${result.selectedIds.join(', ')}`);
        }
        for (const ex of result.excludedItems) {
          console.log(`\x1b[33mExcluido:\x1b[0m ${ex.id} (${ex.reason})`);
        }
      }
      process.exit(0);
    } catch (err: any) {
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'error', error: { message: err.message } }));
      } else {
        console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('prompt <path>')
  .description('Generar prompt de trabajo con IDs seleccionados')
  .requiredOption('--ids <ids>', 'IDs seleccionados separados por coma')
  .requiredOption('--out <file>', 'Ruta de salida del prompt (.md)')
  .option('--policy <policy>', 'Política de dependencias: strict o normal', 'strict')
  .option('--json', 'Salida JSON')
  .action(async (path: string, options: any) => {
    try {
      const { readFile } = await import('node:fs/promises');
      const { parse } = await import('../parser/index.js');
      const { generatePrompt } = await import('../services/prompt.js');
      const content = await readFile(path, 'utf-8');
      const doc = parse(content);
      const ids = options.ids.split(',').map((s: string) => s.trim()).filter(Boolean);
      const result = await generatePrompt(doc, {
        ids,
        outputPath: options.out,
        dependencyPolicy: options.policy === 'normal' ? 'normal' : 'strict',
      });

      if (options.json) {
        console.log(JSON.stringify({ version: '1', data: result }));
      } else {
        console.log(`\x1b[32m✓\x1b[0m Prompt generado: \x1b[36m${result.promptPath}\x1b[0m`);
        console.log(`  Seleccionados: ${result.selectedCount} | Excluidos: ${result.excludedCount}`);
      }
      process.exit(0);
    } catch (err: any) {
      if (options.json) {
        console.log(JSON.stringify({ version: '1', status: 'error', error: { message: err.message } }));
      } else {
        console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('changelog')
  .description('Comandos de changelog')
  .addCommand(
    new Command('validate')
      .description('Validar changelog')
      .argument('<path>', 'Ruta al changelog')
      .option('--json', 'Salida JSON')
      .action(async (path: string, options: { json?: boolean }) => {
        try {
          const { validateChangelogCommand } = await import('./commands/changelog-validate.js');
          await validateChangelogCommand(path, options);
          process.exit(0);
        } catch (err: any) {
          console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
          process.exit(1);
        }
      }),
  );

program.parse(process.argv);
