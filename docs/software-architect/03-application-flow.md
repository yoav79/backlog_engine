# 3. Application Flow

## Actors & Roles

| Actor | Rol | Descripción | Responsabilidades |
|---|---|---|---|
| **Agente consumidor** | Solicitante | Agente de IA que necesita consultar o modificar el backlog | Solicita consultas, mutaciones o un prompt de trabajo |
| **Humano operador** | Operador | Persona que supervisa y opera la herramienta | Revisa el backlog, ejecuta comandos, resuelve errores o conflictos |
| **Orquestador** | Coordinador | Sistema o script que orquesta el flujo de trabajo | Invoca la API/CLI y entrega el prompt a un agente ejecutor |
| **Backlog Engine** | Ejecutor | La utilería misma | Valida, selecciona, muta, renderiza y persiste |
| **Reviewer externo** | Validador | Entidad que verifica resultados | Produce evidencia para solicitar cierre de tareas |

## User Journeys

### CU-01 — Validar backlog

**Actor primario:** Humano operador o agente consumidor

**Flujo paso a paso:**

1. El actor ejecuta `backlog validate <path>` (con flag opcional `--json`).
2. **FileStorage** lee el archivo `backlog.md` y calcula su hash SHA-256.
3. **Parser** transforma el contenido Markdown en un `BacklogDocument` interno.
4. **Validator** ejecuta validación estructural:
   - Frontmatter presente y con campos reconocidos para `schemaVersion`.
   - Encabezado raíz es exactamente `# Backlog`.
   - Cada elemento tiene encabezado nivel 2 con ID válido (`^BLG-[0-9]{3,6}$`).
   - Subsecciones obligatorias presentes: Description, Acceptance Criteria, Evidence, Notes.
   - Campos de metadatos en el orden definido.
   - Tipos de datos correctos (estados, prioridades, tipos dentro del catálogo).
5. **Validator** ejecuta validación semántica:
   - IDs únicos (sin duplicados).
   - Dependencias existen (`dependsOn` apunta a IDs válidos).
   - Sin dependencias cíclicas.
   - Sin dependencia propia.
   - Coherencia estado-owner: `in_progress` requiere owner distinto de `unassigned`.
   - Coherencia estado-evidencia: `done` requiere todos los criterios completos y al menos una evidencia.
6. **Validator** produce un `ValidationResult` con `valid=true` o una lista de errores (cada uno con `code`, `message`, `path` e `itemId` cuando aplique).
7. **CLI** muestra el resultado:
   - Modo humano: texto legible con resumen.
   - Modo JSON: objeto estructurado con `{ valid, errorCount, errors, sourceHash, durationMs }`.
8. **Exit code:** `0` si válido, `3` si inválido.

**Postcondiciones:** El archivo no se modifica. El hash permanece intacto.

---

### CU-02 — Agregar registro

**Actor primario:** Humano operador

**Flujo paso a paso:**

1. El actor ejecuta `backlog add <path> --title "<título>" --type feature --priority high --scope core [--owner nombre]`.
2. **CLI** parsea los argumentos en un `CreateBacklogItemInput`.
3. **FileStorage** lee `backlog.md` y calcula su hash (hash fuente).
4. **Parser** transforma el contenido en un `BacklogDocument`.
5. **Validator** verifica que el documento actual es válido. Si no, aborta con error `INVALID_DOCUMENT`.
6. **BacklogService** genera un nuevo ID:
   - Escanea IDs existentes, encuentra el número más alto, incrementa en 1.
   - Formato: `BLG-XXX` (ej: `BLG-001`, `BLG-042`, `BLG-999`).
   - El ID no es elegido por el agente consumidor.
7. **BacklogService** crea un nuevo `BacklogItem`:
   - `id`: generado automáticamente.
   - `title`, `type`, `priority`, `scope` desde el input.
   - `status`: `todo` por defecto.
   - `owner`: `unassigned` si no se especifica.
   - `dependsOn`: `[]` por defecto.
   - `createdAt`, `updatedAt`: timestamp actual ISO.
   - `description`, `acceptanceCriteria`, `evidence`, `notes`: vacíos por defecto.
8. **Renderer** genera el Markdown canónico completo del documento (todos los items, incluido el nuevo).
9. **Parser** re-parsea el Markdown renderizado para verificar round-trip.
10. **Validator** verifica que el nuevo documento es estructural y semánticamente válido.
11. **FileStorage** escribe atómicamente:
    - Escribe a un archivo temporal en el mismo filesystem.
    - Verifica que el hash del archivo original no haya cambiado (`SOURCE_CONFLICT` si cambió).
    - Reemplaza el original con el temporal (rename atómico).
12. **CLI** retorna: `{ id: "BLG-00N", status: "created" }`.
13. **Exit code:** `0` si éxito, `5` si mutación rechazada, `6` si conflicto de hash.

---

### CU-03 — Actualizar registro

**Actor primario:** Agente consumidor u operador

**Flujo paso a paso:**

1. El actor ejecuta `backlog update <path> <ID> --status in_progress --owner build-agent`.
2. **CLI** parsea los argumentos en un `UpdateBacklogItemInput` (patch). Solo se incluyen los campos a modificar.
3. **FileStorage** lee `backlog.md`, calcula hash.
4. **Parser** transforma a `BacklogDocument`.
5. **Validator** verifica documento actual válido.
6. **BacklogService** localiza el `BacklogItem` por ID. Si no existe, retorna `ITEM_NOT_FOUND` (exit code 4).
7. **BacklogService** aplica el patch respetando:
   - Campos permitidos: `title`, `status`, `priority`, `type`, `owner`, `dependsOn`, `scope`, `description`, `acceptanceCriteria`, `evidence`, `notes`.
   - Campos prohibidos: `id` (inmutable), `createdAt` (inmutable).
   - `updatedAt` se actualiza automáticamente al timestamp actual.
8. **BacklogService** valida la transición de estado según reglas de negocio:
   - `in_progress` requiere owner distinto de `unassigned`.
   - `blocked` requiere al menos una nota o razón.
   - `done` requiere todos los criterios completos y al menos una evidencia.
   - Transiciones no definidas son rechazadas (ej: `todo` → `done` sin pasar por `in_progress`).
9. **Renderer** genera Markdown canónico completo.
10. **Parser** re-parsea y valida round-trip.
11. **Validator** verifica el documento completo (no solo el item modificado).
12. **FileStorage** escribe atómicamente con verificación de hash.
13. **CLI** retorna el resultado: `{ id, status, updatedAt }`.
14. **Exit code:** `0` si éxito, `4` si ID no existe, `5` si transición inválida, `6` si conflicto.

---

### CU-04 — Consultar registros

**Actor primario:** Cualquier actor

**Flujo paso a paso:**

1. El actor ejecuta `backlog get <path> <ID1> <ID2>...` o `backlog list <path> [--status filtro]`.
2. **FileStorage** lee `backlog.md` (sin modificar).
3. **Parser** transforma a `BacklogDocument`.
4. **BacklogService** busca los IDs solicitados:
   - `get`: busca cada ID individualmente.
   - `list`: retorna todos los registros, opcionalmente filtrados por estado.
5. Para cada ID solicitado en `get`:
   - Si existe: incluido en `found`.
   - Si no existe: incluido en `notFound` con razón.
6. **CLI** muestra resultado:
   - Modo humano: tabla o lista legible.
   - Modo JSON: `{ found: [...], notFound: [...], totalFound: N }`.
7. **Exit code:** `0` siempre (incluso si algunos IDs no existen; la información de no encontrados está en la salida).

**Postcondiciones:** El archivo no se modifica.

---

### CU-05 — Seleccionar pendientes

**Actor primario:** Orquestador

**Flujo paso a paso:**

1. El actor ejecuta `backlog select <path> --ids ID1,ID2,ID3 [--exclude-status done,cancelled]`.
2. **FileStorage** lee `backlog.md`.
3. **Parser** transforma a `BacklogDocument`.
4. **SelectionService** procesa la solicitud:
   a. Toma la lista de IDs solicitados, elimina duplicados, conserva el orden original.
   b. Para cada ID:
      - Si el estado es `done` o `cancelled`: excluye con razón `status_final`.
      - Si no existe el ID: excluye con razón `not_found`.
      - Si existe y no está en estado final: incluye en selección.
   c. Para cada ID seleccionado, evalúa dependencias:
      - Si todas las dependencias están `done`: el item es elegible.
      - Si alguna dependencia no está `done`: el item se marca como `excluded` con razón `dependency_blocked` (en modo strict) o `warning` (en modo normal).
5. **SelectionService** produce `SelectionResult`:
   - `requestedIds`: lista original.
   - `selectedIds`: IDs autorizados.
   - `excludedItems`: `[{ id, reason }]`.
   - `dependencyPolicy`: política usada.
6. **CLI** muestra el resultado en humano o JSON.
7. **Exit code:** `0`.

**Regla crítica:** Solo pueden autorizarse IDs expresamente solicitados. No se añaden IDs implícitamente.

---

### CU-06 — Generar prompt

**Actor primario:** Orquestador

**Flujo paso a paso:**

1. El actor ejecuta `backlog prompt <path> --ids ID1,ID2 --out prompt.md`.
2. **FileStorage** lee `backlog.md` y calcula hash fuente.
3. **Parser** transforma a `BacklogDocument`.
4. **SelectionService** ejecuta CU-05 para obtener los IDs seleccionados y excluidos.
5. **PromptBuilder** construye el prompt con la plantilla canónica:
   - Objetivo de la asignación.
   - Lista exacta de IDs autorizados (`selectedIds`).
   - Detalle completo de cada registro seleccionado (título, estado, prioridad, tipo, descripción, criterios de aceptación, dependencias).
   - Alcance permitido y fuera de alcance.
   - Prohibiciones explícitas:
     - No modificar items fuera de `selectedIds`.
     - No cambiar el esquema del backlog.
     - No crear registros adicionales.
     - No marcar trabajo como `done` sin evidencia.
   - Formato de respuesta requerido por cada ID.
6. **PromptBuilder** genera el manifiesto JSON:
   ```json
   {
     "schemaVersion": 1,
     "backlogPath": "backlog.md",
     "sourceHash": "sha256:...",
     "requestedIds": ["BLG-001", "BLG-002"],
     "selectedIds": ["BLG-001"],
     "excludedItems": [
       { "id": "BLG-002", "reason": "status_done" }
     ],
     "dependencyPolicy": "exclude_blocked",
     "promptPath": ".backlog/prompts/correction-BLG-001.md"
   }
   ```
7. **FileStorage** escribe el prompt en la ruta especificada y opcionalmente el manifiesto.
8. **CLI** retorna: `{ promptPath, manifestPath, selectedCount, excludedCount }`.
9. **Exit code:** `0`.

**Regla crítica:** El prompt solo incluye IDs seleccionados. No aparece ningún ID no autorizado en el contenido del prompt.

---

### CU-07 — Cerrar registro con evidencia

**Actor primario:** Reviewer externo

**Flujo paso a paso:**

1. El actor ejecuta `backlog close <path> <ID> --evidence "tests: npm test passed" [--evidence "coverage: 87%"]`.
2. **CLI** parsea el ID y la(s) evidencia(s).
3. **FileStorage** lee `backlog.md`, calcula hash.
4. **Parser** transforma a `BacklogDocument`.
5. **Validator** verifica documento actual válido.
6. **BacklogService** localiza el item por ID.
7. **BacklogService** verifica condiciones para `done`:
   - Todos los `acceptanceCriteria` deben tener `completed: true`.
   - Si hay criterios pendientes, retorna error: `MISSING_ACCEPTANCE_CRITERIA` con lista de criterios incompletos.
   - Debe haber al menos una evidencia no vacía.
   - Si no hay evidencia, retorna error: `MISSING_EVIDENCE`.
8. **BacklogService** aplica el cambio:
   - `status` → `done`.
   - `evidence` → se añaden las evidencias proporcionadas.
   - `updatedAt` → timestamp actual.
9. **Renderer** genera Markdown canónico.
10. **Parser** re-parsea y valida.
11. **FileStorage** escribe atómicamente.
12. **CLI** retorna: `{ id, status: "done", evidenceCount: N }`.
13. **Exit code:** `0` si éxito, `5` si no se cumplen las condiciones.

---

### CU-08 — Inicializar backlog

**Actor primario:** Humano operador

**Flujo paso a paso:**

1. El actor ejecuta `backlog init <path>` (con flag opcional `--force` para sobrescribir).
2. **CLI** verifica si el archivo ya existe:
   - Si existe y no se usó `--force`: aborta con error `FILE_ALREADY_EXISTS` y exit code 7.
   - Si existe y se usó `--force`: el archivo existente se respalda (renombra a `backlog.md.bak`) antes de continuar.
3. **CLI** pasa la solicitud a **BacklogService**.
4. **BacklogService** crea un `BacklogDocument` vacío:
   - `schemaVersion`: 1.
   - `backlogId`: UUID o hash corto generado automáticamente.
   - `updatedAt`: timestamp actual ISO 8601.
   - `items`: arreglo vacío.
5. **Renderer** genera el Markdown canónico del backlog vacío (frontmatter + encabezado raíz + sección de items vacía).
6. **Parser** re-parsea el Markdown generado para verificar round-trip.
7. **Validator** verifica que el documento generado es estructuralmente válido.
8. **FileStorage** escribe atómicamente el archivo `backlog.md`.
9. Se genera automáticamente una entrada en **CHANGELOG.md** con operación `create` y el nuevo `backlogId`.
10. **CLI** retorna: `{ backlogId, path, schemaVersion, status: "initialized" }`.
11. **Exit code:** `0` si éxito, `7` si el archivo ya existe sin `--force`.

**Postcondiciones:** Se crea un backlog.md válido y vacío, listo para agregar registros.

---

## Application States & Transitions

Por decisión del usuario, los estados operativos de la aplicación no se modelan en el MVP. Backlog Engine funciona como utilería determinista bajo demanda: recibe un comando, ejecuta la operación y termina. No mantiene estado entre invocaciones.

Los únicos estados modelados son los de los **BacklogItem** (`todo`, `ready`, `in_progress`, `blocked`, `done`, `cancelled`), cuyas transiciones están definidas en las reglas de negocio RN-003 a RN-006 y RN-020.

## Exceptions & Edge Cases

Las excepciones y edge cases están cubiertos por la tabla de códigos de error (sección 15 del documento de requerimientos). No se han identificado escenarios adicionales fuera de esa tabla.

| Código | Escenario | Acción |
|---|---|---|
| INVALID_FRONTMATTER | Frontmatter ausente o inválido | Rechazar operación |
| UNSUPPORTED_SCHEMA_VERSION | Versión no soportada | No intentar migración automática |
| DUPLICATE_ITEM_ID | ID repetido | Rechazar documento |
| UNKNOWN_FIELD | Campo no reconocido | Rechazar en modo estricto |
| INVALID_STATUS | Estado fuera del catálogo | Rechazar documento o patch |
| DEPENDENCY_NOT_FOUND | Dependencia inexistente | Rechazar documento |
| DEPENDENCY_CYCLE | Ciclo detectado | Rechazar documento |
| INVALID_TRANSITION | Cambio de estado no permitido | No escribir |
| MISSING_EVIDENCE | Cierre sin evidencia | No cambiar a `done` |
| SOURCE_CONFLICT | Hash fuente cambió | Solicitar relectura/reintento |
| ITEM_NOT_FOUND | ID solicitado no existe | Reportar sin inventar registro |

---

> **Checklist:** ✅ Actores identificados. ✅ Journeys mapeados (8 casos de uso con flujo paso a paso). ✅ Excepciones cubiertas.
