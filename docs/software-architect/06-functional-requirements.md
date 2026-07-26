# 6. Functional Requirements

## Requisitos

| ID | Descripción | Módulo | Prioridad | Criterios de aceptación | Trazabilidad |
|---|---|---|---|---|---|
| RF-001 | **Inicializar backlog** — Crear un backlog vacío válido cuando el archivo no exista y el usuario lo solicite explícitamente | CLI, BacklogService, FileStorage | Alta | 1. Genera schemaVersion 1, backlogId válido y encabezado raíz<br>2. No sobrescribe un archivo existente sin bandera explícita<br>3. El archivo recién creado pasa validate | CU-01, Módulo CLI |
| RF-002 | **Parsear Markdown** — Transformar backlog.md en BacklogDocument sin depender de regex para edición | Parser | Alta | 1. Reconoce contenido multilínea y checkboxes<br>2. Reporta ubicación aproximada de errores<br>3. No ejecuta contenido incrustado | CU-01 a CU-07, Módulo Parser |
| RF-003 | **Validar estructura** — Validar frontmatter, encabezados, campos, tipos, orden y secciones obligatorias | Validator | Alta | 1. Devuelve valid=true únicamente sin errores<br>2. Cada error contiene code, message, path e itemId cuando aplique<br>3. No modifica el archivo durante validate | CU-01, Módulo Validator |
| RF-004 | **Validar semántica** — Validar IDs únicos, dependencias existentes, ausencia de ciclos y coherencia entre estado, owner, criterios y evidencia | Validator | Alta | 1. Detecta IDs duplicados y referencias inexistentes<br>2. Detecta dependencia propia y ciclos<br>3. Rechaza done sin criterios completos o sin evidencia | CU-01, Módulo Validator |
| RF-005 | **Agregar elemento** — Agregar un nuevo elemento a partir de datos estructurados y generar su ID automáticamente | BacklogService | Alta | 1. El ID no es elegido por el agente consumidor<br>2. El nuevo elemento contiene todos los campos requeridos<br>3. La operación es atómica | CU-02, Módulo BacklogService |
| RF-006 | **Actualizar elemento** — Actualizar solo campos expresamente proporcionados en un patch permitido | BacklogService | Alta | 1. No cambia campos omitidos<br>2. No permite modificar id o createdAt<br>3. Valida transición y documento completo antes de guardar | CU-03, Módulo BacklogService |
| RF-007 | **Consultar elementos** — Recuperar uno, varios o todos los registros sin alterar su contenido | BacklogService | Alta | 1. Permite selección por IDs<br>2. Distingue found y notFound<br>3. Puede devolver texto humano o JSON | CU-04, Módulo BacklogService |
| RF-008 | **Seleccionar pendientes** — Recibir una lista de IDs y devolver únicamente los registros existentes cuyo estado no sea done ni cancelled | SelectionService | Alta | 1. Conserva el orden solicitado, eliminando duplicados<br>2. Reporta por qué excluyó cada ID<br>3. No selecciona implícitamente registros adicionales | CU-05, Módulo SelectionService |
| RF-009 | **Validar dependencias para ejecución** — Evaluar dependencias antes de autorizar un registro | SelectionService | Alta | 1. Una dependencia done permite continuar<br>2. Una dependencia no terminada produce excluded o warning según modo<br>3. La política usada aparece en el manifiesto | CU-05, Módulo SelectionService |
| RF-010 | **Generar prompt acotado** — Crear un prompt de trabajo que incluya únicamente los registros seleccionados y restricciones explícitas | PromptBuilder | Alta | 1. Enumera IDs autorizados<br>2. Prohíbe modificar otros registros o cambiar el esquema<br>3. Incluye criterios de aceptación, alcance y formato de entrega | CU-06, Módulo PromptBuilder |
| RF-011 | **Generar manifiesto** — Emitir un manifiesto JSON procesable junto con el prompt | PromptBuilder | Alta | 1. Incluye requestedIds, selectedIds y excludedItems<br>2. Incluye hash o versión del backlog fuente<br>3. No contiene IDs no solicitados como autorizados | CU-06, Módulo PromptBuilder |
| RF-012 | **Renderizar formato canónico** — Regenerar el archivo completo con el orden oficial después de una mutación válida | Renderer | Alta | 1. La misma representación interna produce el mismo Markdown<br>2. Un segundo ciclo parse-render no cambia el resultado<br>3. No se pierden textos, criterios, evidencia o notas | CU-02, CU-03, CU-07, Módulo Renderer |
| RF-013 | **Guardar atómicamente** — Escribir mediante archivo temporal y reemplazo seguro | FileStorage | Alta | 1. Un fallo no deja un archivo parcial<br>2. El original permanece intacto ante validación fallida<br>3. El temporal se limpia o queda identificable para recuperación | CU-02, CU-03, CU-07, Módulo FileStorage |
| RF-014 | **Salida estructurada** — Todo comando debe soportar salida JSON estable para agentes y automatizaciones | CLI | Alta | 1. El esquema de salida tiene versión<br>2. Los errores usan códigos estables<br>3. El exit code refleja éxito, invalidez o error operativo | Todos los CU, Módulo CLI |
| RF-015 | **Modo dry-run** — Permitir simular el resultado de una mutación sin escribir | BacklogService | Media | 1. Devuelve diff o resumen de cambios<br>2. Aplica todas las validaciones<br>3. No cambia timestamps persistidos salvo en la vista simulada | CU-02, CU-03, CU-07, Módulo BacklogService |
| RF-016 | **Cierre con evidencia** — Exigir criterios completos y al menos una evidencia no vacía para la transición a done | BacklogService | Alta | 1. No basta con solicitar status=done<br>2. El error identifica criterios pendientes<br>3. La evidencia queda persistida antes del cierre | CU-07, Módulo BacklogService |
| RF-017 | **Registrar automáticamente toda mutación exitosa** — Cada operación de mutación (add, update, close) debe generar automáticamente una entrada en CHANGELOG.md sin intervención del agente | ChangelogService | Alta | 1. La entrada se genera automáticamente sin solicitud explícita<br>2. Captura actor, operación, items afectados y campos modificados<br>3. No requiere que el agente describa el cambio | RF-005, RF-006, RF-016 |
| RF-018 | **Mantener CHANGELOG.md en formato canónico** — El changelog debe seguir un formato Markdown canónico predecible, con frontmatter, encabezados, secciones y orden fijo | ChangelogService, Renderer | Alta | 1. El formato incluye schemaVersion, changelogId, lastChangeId, updatedAt en frontmatter<br>2. Cada entrada (CHG-XXXXXX) usa encabezado nivel 2<br>3. Las subsecciones Timestamp, Actor, Operation, Items, CommandId, Reason y Changes son obligatorias<br>4. El renderer produce el mismo changelog para la misma entrada | RF-012 |
| RF-019 | **Identificar actor, operación, fecha y registros afectados** — Toda entrada de changelog debe contener actor, operación, timestamp, itemIds, commandId y cambios | ChangelogService | Alta | 1. Actor es obligatorio (ej: `agent:build`, `human:yoab`)<br>2. Operation debe ser del catálogo: create, update, status_transition, delete, restore, bulk_update<br>3. itemIds lista todos los registros afectados<br>4. commandId identifica de forma única la solicitud | RF-017 |
| RF-020 | **Calcular diferencias de campos automáticamente** — El changelog debe calcular field changes por comparación entre el valor anterior y el nuevo, sin pedir al agente que describa el cambio | ChangelogService | Alta | 1. status_transition registra campo status con previousValue y currentValue<br>2. update registra solo los campos que cambiaron<br>3. create registra todos los campos como currentValue, previousValue=null | RF-017 |
| RF-021 | **Evitar entradas duplicadas mediante commandId** — Si el mismo commandId se recibe dos veces, la segunda operación debe detectarse como ya aplicada y rechazarse sin crear una nueva entrada | ChangelogService | Alta | 1. commandId debe ser único en el historial<br>2. Un commandId repetido responde con `{ applied: false, reason: "COMMAND_ALREADY_APPLIED" }`<br>3. No modifica backlog.md ni CHANGELOG.md | RF-017 |
| RF-022 | **Consultar historial por registro** — Permitir consultar el historial de cambios de un registro específico (comando `backlog history <path> <ID>`) | ChangelogService, CLI | Alta | 1. Retorna todos los cambios que afectaron al ID solicitado<br>2. Cada cambio incluye changeId, operation, actor, timestamp<br>3. Formato humano y JSON | RF-017 |
| RF-023 | **Validar la integridad estructural del changelog** — Comando `backlog changelog validate` para verificar que CHANGELOG.md cumple el formato canónico y sus reglas | ChangelogService, Validator | Alta | 1. IDs consecutivos sin saltos<br>2. Timestamps válidos<br>3. Actores con formato válido<br>4. Operaciones del catálogo<br>5. Referencias a registros existentes o eliminados<br>6. commandId único sin duplicados<br>7. Formato canónico<br>8. Ausencia de entradas duplicadas | RF-018 |
| RF-024 | **Guardar backlog y changelog como operación atómica** — Las mutaciones deben escribir ambos archivos (backlog.md + CHANGELOG.md) en una transacción: ambos se guardan o ninguno | FileStorage | Alta | 1. Genera backlog.md.tmp y CHANGELOG.md.tmp<br>2. Valida ambos temporales antes de renombrar<br>3. Renombra atómicamente: backlog.md.tmp → backlog.md y luego CHANGELOG.md.tmp → CHANGELOG.md<br>4. Si un paso falla, el estado original permanece intacto | RF-013 |
| RF-025 | **No registrar operaciones fallidas como cambios funcionales** — Si una mutación falla (validación, transición, conflicto de hash), no debe quedar ninguna entrada en CHANGELOG.md | ChangelogService | Alta | 1. La entrada de changelog solo se genera después de validar el backlog renderizado<br>2. Operaciones fallidas retornan error sin efecto secundario<br>3. No existen entradas huérfanas | RF-017 |
| RF-026 | **Permitir registrar una razón opcional o requerida según operación** — Las operaciones pueden incluir `reason`; es obligatoria para status_transition y bloqueos | ChangelogService | Media | 1. reason es opcional para create y update simples<br>2. reason es obligatoria para status_transition, block, close<br>3. La razón queda persistida en la entrada de changelog | RF-017 |

## Reglas de negocio

| ID | Área | Regla |
|---|---|---|
| RN-001 | ID | Debe cumplir `^BLG-[0-9]{3,6}$` y ser único |
| RN-002 | ID | No puede modificarse después de crearse |
| RN-003 | Estado | `in_progress` requiere owner distinto de `unassigned` |
| RN-004 | Estado | `blocked` requiere una nota o razón de bloqueo |
| RN-005 | Estado | `done` requiere todos los criterios completos |
| RN-006 | Estado | `done` requiere al menos una evidencia |
| RN-007 | Dependencias | Un elemento no puede depender de sí mismo |
| RN-008 | Dependencias | Todas las dependencias deben existir |
| RN-009 | Dependencias | El grafo no puede contener ciclos |
| RN-010 | Selección | `done` y `cancelled` nunca se autorizan para corrección |
| RN-011 | Selección | Solo pueden autorizarse IDs expresamente solicitados |
| RN-012 | Mutación | Una operación inválida no produce escritura parcial |
| RN-013 | Esquema | Campos o secciones desconocidas fallan en modo estricto |
| RN-014 | Fechas | `createdAt` es inmutable; `updatedAt` cambia en mutaciones reales |
| RN-015 | Orden | El renderer ordena registros por número de ID, salvo configuración futura |
| RN-016 | Changelog | Un cambio aplicado debe tener exactamente una entrada de changelog |
| RN-017 | Changelog | Una entrada del changelog no puede modificarse mediante comandos normales |
| RN-018 | Changelog | Un commandId no puede aplicarse más de una vez |
| RN-019 | Changelog | El actor es obligatorio en toda operación |
| RN-020 | Changelog | Las transiciones de estado deben registrar valor anterior y nuevo |
| RN-021 | Changelog | El changelog no sustituye los logs técnicos del sistema |

## Escenarios de prueba de aceptación (AT-01 a AT-10)

Los siguientes escenarios constituyen la suite de verificación del MVP. Cada escenario debe ejecutarse y pasar antes de considerar el producto listo para release.

| ID | Descripción | Cobertura |
|---|---|---|
| AT-01 | **Validar backlog válido** — Ejecutar `backlog validate` sobre un backlog.md canónico que cumple todas las reglas. Debe retornar `valid=true` con exit code 0. | RF-001, RF-002, RF-003, RF-004 |
| AT-02 | **Validar backlog inválido** — Ejecutar `backlog validate` sobre un backlog.md con IDs duplicados, dependencia inexistente y transición inválida. Debe detectar todos los errores. | RF-003, RF-004 |
| AT-03 | **Agregar registro** — Ejecutar `backlog add` con título, tipo y prioridad. Verificar que se genera un ID autoincremental BLG-XXX y que el round-trip produce el mismo AST. | RF-002, RF-005, RF-012, RF-013 |
| AT-04 | **Actualizar registro** — Ejecutar `backlog update` sobre un ID existente modificando solo el campo owner. Verificar que solo cambió owner y updatedAt. | RF-006, RF-012 |
| AT-05 | **Consultar registros** — Ejecutar `backlog get` con IDs existentes e inexistentes. Verificar found/notFound correctos. | RF-007 |
| AT-06 | **Seleccionar pendientes** — Ejecutar `backlog select` solicitando IDs que incluyen done, cancelled y disponibles. Verificar que solo se autorizan los disponibles. | RF-008, RN-010, RN-011 |
| AT-07 | **Seleccionar con dependencias** — Solicitar un ID que depende de otro no terminado en modo strict. Verificar que se excluye con razón `dependency_blocked`. | RF-009 |
| AT-08 | **Generar prompt y manifiesto** — Ejecutar `backlog prompt` con IDs seleccionados. Verificar que el manifiesto JSON contiene sourceHash, selectedIds correctos y excludedItems. | RF-010, RF-011 |
| AT-09 | **Cerrar registro con evidencia** — Ejecutar `backlog close` sobre un ID con todos los criterios completos y evidencia. Verificar status=done. | RF-016 |
| AT-10 | **Escritura atómica con fallo** — Simular un fallo durante la escritura (kill del proceso). Verificar que el backlog.md original permanece intacto. | RF-013, RF-024 |

---

> **Checklist:** ✅ IDs únicos (RF-001 a RF-026). ✅ Criterios de aceptación binarios. ✅ Trazables a módulo del catálogo. ✅ Reglas de negocio documentadas (RN-001 a RN-021).
