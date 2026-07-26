# 7. Backend Schema

## Data Entities & Relationships

### BacklogDocument (backlog.md)

Representa el archivo principal de backlog. Es la fuente de verdad.

```typescript
interface BacklogDocument {
  schemaVersion: 1;
  backlogId: string;
  updatedAt: string;       // ISO 8601
  items: BacklogItem[];
}
```

### BacklogItem

Representa un registro individual dentro del backlog.

```typescript
interface BacklogItem {
  id: string;               // Formato: BLG-[0-9]{3,6}
  title: string;
  status: BacklogStatus;
  priority: "critical" | "high" | "medium" | "low";
  type: "feature" | "bug" | "improvement" | "documentation";
  owner: string;            // "unassigned" por defecto
  dependsOn: string[];      // IDs de otros BacklogItem
  scope: string;
  createdAt: string;        // ISO 8601, inmutable
  updatedAt: string;        // ISO 8601, se actualiza en mutaciones
  description: string;
  acceptanceCriteria: { text: string; completed: boolean }[];
  evidence: string[];
  notes: string[];
}
```

### BacklogStatus

```typescript
type BacklogStatus =
  | "todo"          // Registrado, no autorizado
  | "ready"         // Preparado, sin dependencias bloqueantes
  | "in_progress"   // Trabajo activo con owner
  | "blocked"       // No puede continuar, requiere razón documentada
  | "done"          // Criterios satisfechos y evidencia registrada
  | "cancelled";    // Descartado explícitamente
```

### Relaciones

- Un **BacklogDocument** contiene **0..N BacklogItem**.
- Un **BacklogItem** puede depender de **0..N BacklogItem** vía `dependsOn` (relación autorreferencial).
- Las dependencias forman un grafo acíclico dirigido (DAG).
- Un **BacklogItem** puede tener **0..N entradas de changelog** asociadas (relación referencial por ID).

### ChangelogDocument (CHANGELOG.md)

```typescript
interface ChangelogDocument {
  schemaVersion: 1;
  changelogId: string;
  lastChangeId: string;
  updatedAt: string;       // ISO 8601
  entries: BacklogChange[];
}
```

### BacklogChange

```typescript
type ChangeOperation =
  | "create"
  | "update"
  | "status_transition"
  | "delete"
  | "restore"
  | "bulk_update";

interface FieldChange {
  field: string;
  previousValue: unknown;
  currentValue: unknown;
}

interface BacklogChange {
  changeId: string;         // Formato: CHG-[0-9]{6}
  timestamp: string;        // ISO 8601
  actor: string;            // Ej: "agent:build", "human:yoab"
  operation: ChangeOperation;
  itemIds: string[];
  reason?: string;
  changes: FieldChange[];
  commandId: string;        // Idempotencia
}
```

### Relaciones changelog

- Un **ChangelogDocument** contiene **1..N BacklogChange** en orden descendente.
- Un **BacklogChange** referencia **1..N BacklogItem** vía `itemIds`.
- Un **BacklogChange** se vincula unívocamente a un **commandId** (único global).
- La cardinalidad entre operación y changelog es **1:1** (RN-017).

## API Contracts

### BacklogEngine (API interna)

```typescript
interface BacklogEngine {
  // Validación
  validate(markdown: string): ValidationResult;

  // Mutaciones (reciben backlog + changelog, retornan ambos actualizados)
  init(input: InitInput): BacklogTransactionResult;
  add(markdown: string, changelog: string, input: CreateBacklogItemInput): BacklogTransactionResult;
  update(markdown: string, changelog: string, id: string, patch: UpdateBacklogItemInput): BacklogTransactionResult;
  close(markdown: string, changelog: string, id: string, evidence: string[], actor: string, commandId: string): BacklogTransactionResult;

  // Consultas
  get(markdown: string, ids: string[]): QueryResult;
  list(markdown: string, filter?: ListFilter): QueryResult;

  // Selección y prompts
  select(markdown: string, request: SelectionRequest): SelectionResult;
  generatePrompt(markdown: string, request: PromptRequest): PromptResult;

  // Changelog
  getHistory(changelog: string, itemId: string): HistoryResult;
  queryChanges(changelog: string, filter: ChangeFilter): ChangeQueryResult;
  diff(changelog: string, itemId: string, fromChangeId: string, toChangeId: string): DiffResult;
  validateChangelog(changelog: string): ValidationResult;

  // Render
  render(document: BacklogDocument): string;
}

interface BacklogTransactionResult {
  backlogMarkdown: string;
  changelogMarkdown: string;
  change: BacklogChange | null;
  applied: boolean;
}
```

### CLI Commands

| Comando | Propósito |
|---|---|
| `backlog init <path> --id <ID>` | Inicializar backlog vacío |
| `backlog validate <path> [--json]` | Validar backlog |
| `backlog list <path> [--status] [--json]` | Listar registros |
| `backlog get <path> <ID>... [--json]` | Consultar por ID |
| `backlog add <path> --title <T> --type <T> --priority <P> --scope <S>` | Agregar registro |
| `backlog update <path> <ID> --status <S> [--owner <O>]` | Actualizar registro |
| `backlog select <path> --ids <ID,ID> [--json]` | Seleccionar pendientes |
| `backlog prompt <path> --ids <ID,ID> --out <file>` | Generar prompt |
| `backlog close <path> <ID> --evidence <E>` | Cerrar registro |
| `backlog history <path> <ID>` | Historial de cambios |
| `backlog changes <path> [--actor] [--operation] [--since] [--limit]` | Consultar cambios |
| `backlog diff <path> <ID> <changeId1> <changeId2>` | Diff entre cambios |
| `backlog changelog validate <path>` | Validar changelog |

### Exit codes

| Código | Significado |
|---|---|
| 0 | Operación completada |
| 1 | Error operativo no clasificado |
| 2 | Argumentos inválidos |
| 3 | Backlog estructural o semánticamente inválido |
| 4 | Registro no encontrado |
| 5 | Transición o mutación rechazada |
| 6 | Conflicto de versión/hash |
| 7 | commandId duplicado (COMMAND_ALREADY_APPLIED) |

## Data Flow

### Flujo de mutación (con changelog)

```
Solicitud del agente
       ↓
  Backlog Engine
       ↓
  Leer backlog.md + CHANGELOG.md
       ↓
  Validar estado actual (estructural + semántico)
       ↓
  Verificar commandId no duplicado en changelog
       ↓
  Aplicar mutación en memoria
       ↓
  Calcular diferencias (field changes automáticos)
       ↓
  Renderizar nuevo backlog.md (canónico)
       ↓
  Generar entrada de CHANGELOG.md
       ↓
  Validar ambos documentos renderizados
       ↓
  Escribir transacción atómica dual:
    1. backlog.md.tmp
    2. CHANGELOG.md.tmp
    3. Validar ambos temporales
    4. Renombrar backlog.md.tmp → backlog.md
    5. Renombrar CHANGELOG.md.tmp → CHANGELOG.md
       ↓
  Retornar resultado
```

### Flujo de consulta (solo lectura)

```
Solicitud del agente
       ↓
  Backlog Engine
       ↓
  Leer backlog.md (o CHANGELOG.md según comando)
       ↓
  Validar documento (opcional para consultas)
       ↓
  Ejecutar consulta en memoria
       ↓
  Retornar resultado (humano o JSON)
```

## Storage Strategy

### Archivos

| Archivo | Propósito | Formato | Tamaño estimado |
|---|---|---|---|
| `backlog.md` | Fuente de verdad del backlog | Markdown canónico + frontmatter YAML | ~500 KB para 5,000 items |
| `CHANGELOG.md` | Historial de cambios | Markdown canónico + frontmatter YAML | Crece indefinidamente (append-only) |

### Estrategia de escritura

- **Transacción atómica dual:** Ambas escrituras (backlog + changelog) se ejecutan como una unidad.
- **Archivos temporales:** Se escriben `.tmp` en el mismo filesystem, se validan, y luego se renombran.
- **Verificación de hash:** Antes de escribir, se verifica que el hash del archivo original no haya cambiado (SOURCE_CONFLICT).
- **Rollback:** Si cualquier paso falla, los archivos originales permanecen intactos y los temporales se eliminan.

### Respaldo y retención

- Sin backups automáticos en el MVP. La escritura atómica es la única garantía.
- CHANGELOG.md funciona como historial de cambios (no es un backup completo del backlog).

## Sensitive Data

- **Datos personales:** No se espera que el backlog contenga PII. El contenido es técnico (features, bugs, tareas de desarrollo).
- **Secretos:** No se almacenan credenciales, tokens ni claves. Si aparecieran accidentalmente en descripciones o notas, la herramienta no los inspecciona ni expone.
- **Logs:** Los logs estructurados opcionales usan IDs y códigos de error, no contenido del backlog.
- **Path traversal:** La herramienta normaliza y valida rutas de archivo. No sigue enlaces simbólicos fuera del directorio autorizado sin configuración explícita.

## Volume Estimates

| Métrica | Valor | Notas |
|---|---|---|
| Items por backlog | 10 — 5,000 | MVP target |
| Crecimiento mensual | ~50-200 items | Proyecto típico de desarrollo |
| Entradas de changelog por item | 3-20 | Durante todo el ciclo de vida |
| Tamaño máximo backlog.md | ~500 KB | Para 5,000 items |
| Tamaño CHANGELOG.md | ~10-50 MB | Después de 10,000+ cambios |
| Concurrencia | 1 operación a la vez | Sin concurrencia en MVP |
| Frecuencia de mutaciones | ~10-50/día | Uso típico con agentes |

---

> **Checklist:** ✅ Entidades mapeadas (BacklogDocument, BacklogItem, BacklogChange). ✅ APIs listadas (interna + CLI). ✅ Datos sensibles identificados (ninguno esperado). ✅ Volumen estimado.
