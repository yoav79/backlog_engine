# Backlog Engine

Utilería determinista para gestión de backlogs en Markdown para agentes de IA.

## ¿Qué es?

Backlog Engine es una herramienta CLI que permite gestionar backlogs de productos usando archivos Markdown con formato canónico. Proporciona operaciones CRUD, validación estructural y semántica, historial de cambios (changelog), selección de items con dependencias, y generación de prompts de trabajo para agentes de IA — todo sin base de datos, usando solo el sistema de archivos.

## Arquitectura

```
src/
├── cli/              — CLI con commander (punto de entrada)
│   ├── index.ts      — Definición de todos los comandos
│   └── commands/
│       ├── init.ts   — backlog init
│       ├── validate.ts — backlog validate
│       ├── history.ts  — backlog history / changes
│       ├── query.ts    — backlog get / list
│       └── changelog-validate.ts — backlog changelog validate
├── domain/
│   └── index.ts      — Tipos: BacklogItem, BacklogDocument, BacklogChange, etc.
├── parser/
│   └── index.ts      — Parseo Markdown → BacklogDocument (unified + remark)
├── validator/
│   └── index.ts      — Validación estructural y semántica
├── renderer/
│   └── index.ts      — Renderizado BacklogDocument → Markdown canónico
├── services/
│   ├── backlog.ts    — BacklogService: init, add, update, close, dry-run, get, list
│   ├── changelog.ts  — ChangelogService: recordChange, validateChangelog, diff, query
│   ├── selection.ts  — SelectionService: select con dependencias
│   └── prompt.ts     — PromptBuilder: generatePrompt, generateManifest
├── storage/
│   └── index.ts      — FileStorage: lectura/escritura atómica dual
└── index.ts          — Punto de entrada del paquete
```

### Flujo de datos

```
Markdown (backlog.md)
  → parse() → BacklogDocument (AST tipado)
    → validateStructure() + validateSemantics()
      → mutate() → render() → parse() → validate() (round-trip)
        → writeDualAtomic(backlog.md, CHANGELOG.md)
```

## Instalación

```bash
npm install -g backlog-engine
# O desde el código fuente:
git clone <repo>
cd backlog-engine
npm install
npm run build
npm link
```

## Formato del backlog

El backlog usa Markdown con frontmatter YAML:

```markdown
---
schemaVersion: 1
backlogId: blg-miproducto
updatedAt: 2026-07-25T12:00:00.000Z
---

# Backlog

## BLG-001

- **Title:** Implementar login
- **Status:** todo
- **Priority:** high
- **Type:** feature
- **Owner:** dev:alice
- **Scope:** core
- **Description:** Módulo de autenticación
- **Acceptance Criteria:**
  - ○ Debe validar email y contraseña
  - ✓ Debe retornar token JWT
- **Depends on:** BLG-000
- **Evidence:** []
- **Created at:** 2026-07-25T12:00:00.000Z
- **Updated at:** 2026-07-25T12:00:00.000Z
```

### Formato del CHANGELOG.md

```markdown
---
schemaVersion: 1
changelogId: chg-miproducto
lastChangeId: CHG-000005
updatedAt: 2026-07-25T14:00:00.000Z
---

# Changelog

## CHG-000001

- **Timestamp:** 2026-07-25T12:00:00.000Z
- **Actor:** system:init
- **Operation:** create
- **Items:** BLG-001
- **CommandId:** init-abc123
```

## Comandos

### `backlog init <path>`

Inicializa un backlog vacío.

```bash
backlog init mi-backlog.md              # Crea backlog.md + CHANGELOG.md
backlog init mi-backlog.md --force      # Sobrescribe si existe
backlog init mi-backlog.md --id blg-prod  # ID personalizado
backlog init mi-backlog.md --json       # Salida JSON
```

### `backlog validate <path>`

Valida la estructura y semántica del backlog.

```bash
backlog validate mi-backlog.md
backlog validate mi-backlog.md --json
```

### `backlog get <path> <ids...>`

Consulta items por ID.

```bash
backlog get mi-backlog.md BLG-001
backlog get mi-backlog.md BLG-001 BLG-002 --json
```

### `backlog list <path>`

Lista todos los items.

```bash
backlog list mi-backlog.md
backlog list mi-backlog.md --status todo
backlog list mi-backlog.md --json
```

### `backlog add <path>`

Agrega un nuevo item.

```bash
backlog add mi-backlog.md \
  --title "Implementar login" \
  --type feature \
  --priority high \
  --scope core \
  --owner dev:alice

backlog add mi-backlog.md \
  --title "Bug crítico" \
  --type bug \
  --priority critical \
  --scope security \
  --dry-run  # Simula sin escribir
```

### `backlog update <path>`

Actualiza un item existente (patch parcial).

```bash
backlog update mi-backlog.md \
  --id BLG-001 \
  --status in_progress \
  --owner dev:alice

backlog update mi-backlog.md \
  --id BLG-001 \
  --title "Nuevo título" \
  --dry-run
```

**Validaciones de transición:**
- `in_progress` requiere `--owner` distinto de "unassigned"
- `blocked` requiere `--notes`
- `done` requiere acceptance criteria completos + evidencia

### `backlog close <path>`

Cierra un item con evidencia.

```bash
backlog close mi-backlog.md \
  --id BLG-001 \
  --actor dev:alice \
  --evidence "Test OK" "Code reviewed"

backlog close mi-backlog.md \
  --id BLG-001 \
  --actor dev:alice \
  --evidence "Validado" \
  --dry-run
```

### `backlog select <path>`

Selecciona items pendientes excluyendo done/cancelled, evaluando dependencias.

```bash
backlog select mi-backlog.md --ids BLG-001,BLG-002
backlog select mi-backlog.md --ids BLG-001,BLG-002 --policy normal
backlog select mi-backlog.md --ids BLG-001 --json
```

### `backlog prompt <path>`

Genera un prompt de trabajo con items seleccionados y restricciones.

```bash
backlog prompt mi-backlog.md \
  --ids BLG-001,BLG-002 \
  --out prompt.md
```

### `backlog history <path> <id>`

Historial de cambios de un item.

```bash
backlog history mi-backlog.md BLG-001
backlog history mi-backlog.md BLG-001 --json
```

### `backlog changes <path>`

Cambios recientes en el changelog.

```bash
backlog changes mi-backlog.md
backlog changes mi-backlog.md --actor dev:alice --limit 5 --json
```

### `backlog diff <path> <id> <from> <to>`

Diff entre dos versiones de un item.

```bash
backlog diff CHANGELOG.md BLG-001 CHG-000001 CHG-000005
```

### `backlog changelog validate <path>`

Valida la integridad del CHANGELOG.md.

```bash
backlog changelog validate CHANGELOG.md
backlog changelog validate CHANGELOG.md --json
```

**Validaciones:** IDs consecutivos, timestamps ISO 8601, actores formato `tipo:nombre`, operaciones del catálogo, commandId único, entradas duplicadas, referencias a items del backlog.

## Códigos de salida

| Código | Significado |
|--------|-------------|
| 0 | Éxito |
| 1 | Error genérico |
| 2 | Error de parseo |
| 3 | Backlog inválido |
| 4 | Item no encontrado |
| 5 | Mutación rechazada (transición inválida, faltan criteria/evidencia) |
| 6 | Conflicto de hash (archivo modificado externamente) |
| 7 | Archivo ya existe |

## Scripts

```bash
npm run build          # Compilar TypeScript
npm run dev            # Ejecutar en desarrollo (tsx)
npm test               # Ejecutar tests (Vitest)
npm run lint           # ESLint
npm run format         # Prettier
npm run typecheck      # tsc --noEmit
```
