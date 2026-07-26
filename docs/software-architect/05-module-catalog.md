# 5. Module Catalog

## Módulos

### CLI

| Campo | Valor |
|---|---|
| **Nombre** | CLI |
| **Objetivo** | Adaptar argumentos de línea de comandos a llamadas de la API interna y formatear la salida para el usuario |
| **Usuarios** | Humano operador, orquestador (scripts) |
| **Responsabilidades** | Parsear argumentos y flags, invocar servicios, formatear salida humano/JSON, gestionar exit codes |
| **Funciones** | `init`, `validate`, `list`, `get`, `add`, `update`, `select`, `prompt`, `close` |
| **Entradas** | Argumentos CLI (`process.argv`), flags (`--json`, `--status`, `--ids`, etc.) |
| **Salidas** | Texto formateado (humano) o JSON estructurado, exit code (0-6) |
| **Reglas de negocio** | Ninguna propia; delega toda validación a los servicios |
| **Dependencias** | BacklogService, SelectionService, PromptBuilder, FileStorage |
| **Permisos** | Ejecución en terminal, lectura/escritura de archivos |
| **Prioridad MVP** | Alta |

---

### Parser

| Campo | Valor |
|---|---|
| **Nombre** | Parser |
| **Objetivo** | Transformar el contenido Markdown de `backlog.md` en un modelo interno `BacklogDocument` tipado |
| **Usuarios** | BacklogService, Validator, SelectionService, CLI (vía servicios) |
| **Responsabilidades** | Leer frontmatter, reconocer registros por ID, extraer campos, secciones y checkboxes, reportar ubicación de errores de sintaxis |
| **Funciones** | `parse(markdown: string): BacklogDocument` |
| **Entradas** | String con contenido Markdown |
| **Salidas** | `BacklogDocument` o error de parseo con ubicación |
| **Reglas de negocio** | RN-013 (campos desconocidos fallan en modo estricto) |
| **Dependencias** | Domain (tipos), librería AST CommonMark/GFM |
| **Permisos** | Ninguno (opera en memoria) |
| **Prioridad MVP** | Crítica |

---

### Validator

| Campo | Valor |
|---|---|
| **Nombre** | Validator |
| **Objetivo** | Verificar que un `BacklogDocument` cumple todas las reglas estructurales, semánticas y de transición |
| **Usuarios** | BacklogService (pre-mutación), CLI (validate), FileStorage (post-render) |
| **Responsabilidades** | Validar frontmatter, IDs únicos, dependencias existentes, ausencia de ciclos, coherencia estado-owner-estado-evidencia, transiciones permitidas |
| **Funciones** | `validate(document: BacklogDocument): ValidationResult` |
| **Entradas** | `BacklogDocument` |
| **Salidas** | `ValidationResult { valid: boolean, errors: ValidationError[] }` |
| **Reglas de negocio** | RN-001 a RN-015 |
| **Dependencias** | Domain (tipos, reglas) |
| **Permisos** | Ninguno (opera en memoria) |
| **Prioridad MVP** | Crítica |

---

### Renderer

| Campo | Valor |
|---|---|
| **Nombre** | Renderer |
| **Objetivo** | Convertir un `BacklogDocument` en Markdown canónico siguiendo el contrato de formato |
| **Usuarios** | BacklogService, FileStorage |
| **Responsabilidades** | Generar frontmatter, encabezados, campos en orden, secciones obligatorias, preservar contenido semántico, garantizar idempotencia (parse(render(x)) = x semánticamente) |
| **Funciones** | `render(document: BacklogDocument): string` |
| **Entradas** | `BacklogDocument` |
| **Salidas** | String con Markdown canónico |
| **Reglas de negocio** | RN-015 (orden por número de ID), contrato Markdown (sección 8) |
| **Dependencias** | Domain (tipos) |
| **Permisos** | Ninguno (opera en memoria) |
| **Prioridad MVP** | Crítica |

---

### BacklogService

| Campo | Valor |
|---|---|
| **Nombre** | BacklogService |
| **Objetivo** | Ejecutar operaciones de negocio sobre el backlog: agregar, actualizar, consultar y cerrar registros |
| **Usuarios** | CLI |
| **Responsabilidades** | Generar IDs autoincrementales, aplicar patches parciales, validar transiciones, coordinar parser → validator → render → storage |
| **Funciones** | `add(document, input): MutationResult`, `update(document, id, patch): MutationResult`, `close(document, id, evidence): MutationResult`, `get(document, ids): QueryResult`, `list(document, filter): QueryResult` |
| **Entradas** | `BacklogDocument`, `CreateBacklogItemInput` / `UpdateBacklogItemInput` / lista de IDs |
| **Salidas** | `MutationResult` / `QueryResult` |
| **Reglas de negocio** | RN-002 (ID inmutable), RN-003 a RN-006 (transiciones), RN-012 (sin escritura parcial) |
| **Dependencias** | Parser, Validator, Renderer, FileStorage |
| **Permisos** | Ninguno directo; delega escritura a FileStorage |
| **Prioridad MVP** | Alta |

---

### SelectionService

| Campo | Valor |
|---|---|
| **Nombre** | SelectionService |
| **Objetivo** | Filtrar una lista de IDs solicitados excluyendo aquellos en estado final o con dependencias bloqueantes |
| **Usuarios** | CLI, PromptBuilder |
| **Responsabilidades** | Recibir solicitud de IDs, eliminar duplicados, excluir done/cancelled, evaluar dependencias, producir lista seleccionada y exclusiones con razón |
| **Funciones** | `select(document: BacklogDocument, request: SelectionRequest): SelectionResult` |
| **Entradas** | `BacklogDocument`, `SelectionRequest { requestedIds, excludeStatuses, dependencyPolicy }` |
| **Salidas** | `SelectionResult { requestedIds, selectedIds, excludedItems, dependencyPolicy }` |
| **Reglas de negocio** | RN-010 (done/cancelled nunca autorizados), RN-011 (solo IDs solicitados), RN-007 a RN-009 (dependencias) |
| **Dependencias** | Parser, Validator (para verificar dependencias) |
| **Permisos** | Ninguno (opera en memoria) |
| **Prioridad MVP** | Alta |

---

### PromptBuilder

| Campo | Valor |
|---|---|
| **Nombre** | PromptBuilder |
| **Objetivo** | Generar un prompt de trabajo acotado y su manifiesto JSON a partir de los registros seleccionados |
| **Usuarios** | CLI, orquestador |
| **Responsabilidades** | Construir prompt con IDs autorizados, detalle de items, criterios de aceptación, alcance, prohibiciones y formato de respuesta; generar manifiesto JSON verificable |
| **Funciones** | `generatePrompt(document, selection, options): PromptResult` |
| **Entradas** | `BacklogDocument`, `SelectionResult`, `PromptOptions { outputPath }` |
| **Salidas** | `PromptResult { promptPath, manifestPath, selectedCount, excludedCount }` |
| **Reglas de negocio** | RN-010, RN-011; el prompt nunca incluye IDs no seleccionados |
| **Dependencias** | SelectionService, FileStorage |
| **Permisos** | Escritura de archivos (prompt.md, manifiesto) |
| **Prioridad MVP** | Alta |

---

### FileStorage

| Campo | Valor |
|---|---|
| **Nombre** | FileStorage |
| **Objetivo** | Gestionar la lectura, escritura atómica y hash del archivo `backlog.md` |
| **Usuarios** | BacklogService, CLI, PromptBuilder |
| **Responsabilidades** | Leer archivo y calcular hash SHA-256, escribir a temporal y reemplazar atómicamente, verificar conflicto de hash (SOURCE_CONFLICT), limpiar temporales en fallo |
| **Funciones** | `read(path): { content, hash }`, `writeAtomic(path, content, expectedHash): void` |
| **Entradas** | Ruta al archivo, contenido a escribir, hash esperado |
| **Salidas** | Contenido leído + hash, o confirmación de escritura |
| **Reglas de negocio** | RN-012 (sin escritura parcial), atomic write, hash verification |
| **Dependencias** | Ninguna (solo módulos nativos: fs, crypto) |
| **Permisos** | Lectura/escritura de archivos en el sistema de archivos local |
| **Prioridad MVP** | Crítica |

---

### Domain (Tipos compartidos)

| Campo | Valor |
|---|---|
| **Nombre** | Domain |
| **Objetivo** | Definir los tipos, interfaces y constantes compartidas por todos los módulos |
| **Usuarios** | Todos los módulos |
| **Responsabilidades** | Definir `BacklogItem`, `BacklogDocument`, `BacklogStatus`, tipos de entrada/salida, constantes de estado, prioridad y tipo |
| **Funciones** | Ninguna; es un conjunto de definiciones de tipo |
| **Entradas** | N/A |
| **Salidas** | N/A |
| **Reglas de negocio** | Las enumera para que Validator las aplique |
| **Dependencias** | Ninguna |
| **Permisos** | Ninguno |
| **Prioridad MVP** | Crítica |

### ChangelogService

| Campo | Valor |
|---|---|
| **Nombre** | ChangelogService |
| **Objetivo** | Registrar automáticamente toda mutación exitosa en CHANGELOG.md, calcular diferencias de campos, gestionar commandId para evitar duplicados |
| **Usuarios** | BacklogService, CLI |
| **Responsabilidades** | Generar entradas de changelog con field changes automáticos, validar commandId único, consultar historial por registro y por filtros, mantener formato canónico |
| **Funciones** | `recordChange(document, changelog, request): ChangelogResult`, `getHistory(changelog, itemId): ChangeEntry[]`, `queryChanges(changelog, filter): ChangeEntry[]`, `validateChangelog(changelog): ValidationResult` |
| **Entradas** | `BacklogDocument`, `CHANGELOG.md` (string), `UpdateRequest` con commandId, actor, operation, reason |
| **Salidas** | `ChangelogResult { entry: BacklogChange, changelogMarkdown: string }` |
| **Reglas de negocio** | RN-017 a RN-022 |
| **Dependencias** | Domain, FileStorage |
| **Permisos** | Escritura de archivos (junto con FileStorage en transacción) |
| **Prioridad MVP** | Alta |

---

## Notificaciones y reportes

La herramienta no genera notificaciones push ni reportes periódicos. Toda la salida es bajo demanda, por comando explícito.

| Módulo | Reportes / Salidas |
|---|---|
| **CLI** | Salida de cada comando en formato humano o JSON; exit code |
| **Validator** | Reporte de validación con lista de errores (código, mensaje, path, itemId) |
| **SelectionService** | Reporte de selección con IDs solicitados, seleccionados y excluidos (con razón) |
| **PromptBuilder** | Manifiesto JSON con sourceHash, requestedIds, selectedIds, excludedItems, dependencyPolicy |
| **FileStorage** | Log opcional de operaciones de lectura/escritura |
| **ChangelogService** | Historial de cambios por registro, consulta de cambios recientes con filtros, diff entre versiones |

---

> **Checklist:** ✅ Todos los módulos MVP identificados (10 incluyendo Domain). ✅ Dependencias mapeadas. ✅ Prioridades asignadas.
