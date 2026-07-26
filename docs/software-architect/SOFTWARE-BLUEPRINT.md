# Software Blueprint — Backlog Engine

> Documento consolidado. No introduce información nueva.

## 1. Discovery

Backlog Engine nace de un problema concreto: los agentes de IA no tienen una forma determinista de gestionar backlogs. Cuando múltiples agentes — o un mismo agente en distintas ejecuciones — intentan administrar una lista de tareas pendientes, producen formatos inconsistentes (encabezados, campos, estados y formatos diferentes para el mismo concepto), ediciones que dañan secciones existentes o modifican tareas no autorizadas, sin garantía de IDs únicos, dependencias válidas o transiciones de estado coherentes.

Actualmente la operación se realiza mediante edición textual libre sobre archivos Markdown, generando variaciones arbitrarias en la estructura, imposibilidad de validar consistencia, riesgo de corrupción de secciones no autorizadas y dependencia de la disciplina del agente para mantener el formato. El proyecto nace en el contexto de DevFlow/OpenCode.

Se identifican cinco actores: **agente consumidor** (solicita consultas/mutaciones), **humano operador** (revisa y ejecuta comandos), **orquestador** (invoca la API/CLI y entrega el prompt), **reviewer externo** (produce evidencia para cierre), **Backlog Engine** (ejecuta las operaciones). El buyer es el CTO. Las restricciones técnicas clave incluyen: sin base de datos (un único archivo Markdown), portable (Linux/macOS), determinista, escritura atómica con rollback, Markdown canónico, fail closed, y sin dependencia de LLM en el MVP. La licencia es MIT y el lenguaje es TypeScript/Node.js. Diez criterios de éxito medibles definen la meta del MVP.

(ver [`01-discovery.md`](01-discovery.md))

## 2. Product Requirements

La visión del producto es ser una utilería determinista, pequeña y sin base de datos, que permita a agentes de IA consultar y modificar un backlog almacenado en un único archivo Markdown, actuando como capa de integridad y acceso sin ser un agente autónomo ni un orquestador.

La propuesta de valor es convertir un archivo Markdown en un registro controlado, auditable y compatible con agentes, eliminando la corrupción estructural, los cambios fuera de alcance y los estados inconsistentes. Los objetivos específicos incluyen: definir un contrato Markdown versionado, impedir escrituras inválidas, permitir altas y actualizaciones parciales sin edición libre, seleccionar registros por IDs estables excluyendo terminados/cancelados, generar prompts con alcance positivo y prohibiciones explícitas, guardar cambios atómicamente y ofrecer lógica central reutilizable desde CLI y código.

Los KPIs miden round-trip determinista, validación completa (100% reglas), escritura atómica (sin archivos parciales), alcance de selección (zero falsos positivos) y cobertura de pruebas (escenarios AT-01 a AT-10). El MVP incluye parser, validador, renderer, operaciones CRUD + select + prompt + close, IDs automáticos BLG-XXX, escritura atómica, salida humana/JSON y pruebas. Quedan fuera del alcance (permanente): interfaz web/móvil, base de datos, ejecución del agente, planificación inteligente mediante LLM, autenticación multiusuario y múltiples formatos.

(ver [`02-product-requirements.md`](02-product-requirements.md))

## 3. Application Flow

Se definen cinco actores: agente consumidor, humano operador, orquestador, backlog engine y reviewer externo. Ocho casos de uso detallan el flujo completo del sistema:

- **CU-01 (Validar):** Lee backlog.md, parsea, valida estructura y semántica, produce resultado humano o JSON. Exit code 0 si válido, 3 si inválido.
- **CU-02 (Agregar):** Genera ID autoincremental (BLG-XXX), crea item con valores por defecto, renderiza Markdown canónico, valida round-trip, escribe atómicamente con verificación de hash.
- **CU-03 (Actualizar):** Aplica patch parcial respetando campos permitidos, valida transiciones de estado (in_progress requiere owner, blocked requiere nota, done requiere criterios y evidencia), escribe atómicamente.
- **CU-04 (Consultar):** get por ID(s) o list con filtro opcional por estado. Solo lectura.
- **CU-05 (Seleccionar):** Filtra IDs excluyendo done/cancelled, evalúa dependencias (dependency_blocked en modo strict), nunca autoriza IDs no solicitados.
- **CU-06 (Generar prompt):** Construye prompt canónico con IDs autorizados, prohibiciones explícitas y manifiesto JSON verificable con sourceHash.
- **CU-07 (Cerrar con evidencia):** Exige todos los acceptanceCriteria completos y al menos una evidencia para transitar a done.
- **CU-08 (Inicializar):** Crea backlog.md vacío con frontmatter canónico, valida round-trip, genera CHANGELOG.md con operación create. Rechaza sobrescritura sin flag --force.

Los estados de BacklogItem son: todo, ready, in_progress, blocked, done, cancelled. La aplicación no mantiene estado entre invocaciones. Once códigos de error documentan las excepciones y edge cases.

(ver [`03-application-flow.md`](03-application-flow.md))

## 4. UI/UX Brief

Backlog Engine es una herramienta de línea de comandos sin interfaz gráfica. La estructura de comandos sigue el patrón `backlog <verbo> [<path>] [<args>] [--flags]`. Los verbos principales son cortos: `init`, `validate`, `list`, `get`, `add`, `update`, `select`, `prompt`, `close`. Los flags usan `--` con nombres largos y valores separados por espacio o `=`.

La paleta de colores ANSI define: verde para éxito, rojo para error, amarillo para advertencia, cian para IDs, negrita para etiquetas, gris para metadatos secundarios. El color nunca es el único diferenciador; siempre hay un indicador textual. El tono de mensajes es claro y directo, con errores en formato `[CÓDIGO] Mensaje descriptivo`.

Nueve plantillas de salida documentan el aspecto de cada comando: help, validate, list, get, add, update, select, prompt y close. Los principios UX incluyen determinismo, predictibilidad, progressive disclosure, feedback claro, silencio productivo, modo JSON siempre disponible y consistencia cromática. Los dispositivos target son terminales Linux/macOS, CI/CD y OpenCode/DevFlow.

(ver [`04-uiux-brief.md`](04-uiux-brief.md))

## 5. Module Catalog

Diez módulos conforman la arquitectura, todos con prioridad MVP entre crítica y alta:

| Módulo | Prioridad | Responsabilidad |
|---|---|---|
| **CLI** | Alta | Adaptar argumentos CLI a llamadas de API interna y formatear salida |
| **Parser** | Crítica | Transformar Markdown en `BacklogDocument` tipado |
| **Validator** | Crítica | Verificar reglas estructurales, semánticas y de transición |
| **Renderer** | Crítica | Convertir `BacklogDocument` en Markdown canónico |
| **BacklogService** | Alta | Orquestar add, update, close con changelog |
| **SelectionService** | Alta | Filtrar IDs, evaluar dependencias, construir alcance |
| **PromptBuilder** | Alta | Generar prompt acotado y manifiesto JSON |
| **ChangelogService** | Alta | Registrar mutaciones, calcular field changes, gestionar commandId |
| **FileStorage** | Crítica | Lectura/escritura atómica con hash verification |
| **Domain** | Crítica | Tipos, interfaces y constantes compartidas |

Cada módulo tiene entradas, salidas, dependencias y reglas de negocio documentadas. El sistema no genera notificaciones push; toda salida es bajo demanda.

(ver [`05-module-catalog.md`](05-module-catalog.md))

## 6. Functional Requirements

Veintiséis requisitos funcionales (RF-001 a RF-026) cubren todo el sistema, cada uno con ID, descripción, módulo responsable, prioridad, criterios de aceptación binarios y trazabilidad a casos de uso. Los requisitos abarcan: inicialización, parseo, validación estructural y semántica, agregar/actualizar/consultar elementos, selección de pendientes, validación de dependencias, generación de prompt y manifiesto, renderizado canónico, guardado atómico, salida estructurada, modo dry-run, cierre con evidencia, y todo el subsistema de changelog (registro automático, formato canónico, field changes, commandId único, historial por registro, validación de changelog, transacción atómica dual, no registro de fallos, razón opcional/requerida).

Veintiuna reglas de negocio (RN-001 a RN-021) complementan los requisitos, cubriendo: formato de IDs e inmutabilidad, condiciones de estado (in_progress requiere owner, blocked requiere nota, done requiere criterios y evidencia), dependencias (sin auto-referencia, existentes, sin ciclos), selección (nunca done/cancelled, solo IDs solicitados), mutación atómica, esquema estricto, fechas, orden de render, y reglas de changelog (1:1 entrada-cambio, inmutabilidad, commandId único, actor obligatorio, registro de transiciones).

Diez escenarios de prueba de aceptación (AT-01 a AT-10) definen la suite de verificación del MVP, cubriendo validación, mutaciones, selección, prompt, cierre y escritura atómica.

(ver [`06-functional-requirements.md`](06-functional-requirements.md))

## 7. Backend Schema

El modelo de datos comprende dos documentos principales:

- **BacklogDocument** (backlog.md): schemaVersion, backlogId, updatedAt, items (BacklogItem[]). Cada BacklogItem tiene id (BLG-[0-9]{3,6}), title, status (todo/ready/in_progress/blocked/done/cancelled), priority, type, owner, dependsOn (IDs), scope, createdAt/updatedAt (ISO 8601), description, acceptanceCriteria (text + completed), evidence y notes.
- **ChangelogDocument** (CHANGELOG.md): schemaVersion, changelogId, lastChangeId, updatedAt, entries (BacklogChange[]). Cada BacklogChange tiene changeId (CHG-[0-9]{6}), timestamp, actor, operation (create/update/status_transition/delete/restore/bulk_update), itemIds, reason, changes (FieldChange[] con field, previousValue, currentValue) y commandId.

La API interna (BacklogEngine interface) expone métodos para validación, mutaciones (init, add, update, close — todos reciben backlog + changelog y retornan ambos actualizados), consultas, selección y prompts, historial y diff de changelog, y render. Los comandos CLI (13 en total) mapean a esta API. Ocho códigos de exit code (0-7) cubren todos los estados operativos.

El flujo de mutación con changelog sigue: leer ambos archivos → validar → verificar commandId → aplicar mutación → calcular field changes → renderizar → generar entrada → validar ambos → transacción atómica dual (backlog.md.tmp + CHANGELOG.md.tmp → rename). El flujo de consulta es solo lectura. Tamaño estimado: ~500 KB para 5,000 items; CHANGELOG.md puede alcanzar 10-50 MB.

(ver [`07-backend-schema.md`](07-backend-schema.md))

## 8. Solution Architecture

Tres alternativas fueron evaluadas: **Arquitectura Hexagonal (Puertos y Adaptadores)**, **Script Monolítico** y **Servicio Backend con API HTTP**. Se seleccionó la **Arquitectura Hexagonal** (Alternativa A) por su alineación con los principios de determinismo, testabilidad, mantenibilidad (RNF-005) y compatibilidad como librería (RNF-004).

El diagrama de contexto muestra al agente de IA y al humano operador como consumidores de Backlog Engine, que persiste en backlog.md y CHANGELOG.md en el sistema de archivos local. El diagrama de contenedores despliega CLI (adaptador de entrada), Parser, Validator, Renderer (núcleo), BacklogService, SelectionService, ChangelogService, PromptBuilder (servicios de aplicación), FileStorage (adaptador de salida) y Domain (capa de tipos).

Seis principios arquitectónicos guían el diseño: dependencias hacia adentro, inversión de dependencias, transaccionalidad (backlog + changelog se escriben juntos o ninguno), inmutabilidad del histórico (changelog append-only), idempotencia (vía commandId) y canonicidad (render siempre produce el mismo Markdown). Diez decisiones arquitectónicas documentan las opciones seleccionadas y su justificación.

(ver [`08-solution-architecture.md`](08-solution-architecture.md))

## 9. Technology Stack

El stack seleccionado es completamente TypeScript/Node.js. Las tecnologías principales son:

| Capa | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | LTS (22.x, mín. 18+) |
| Lenguaje | TypeScript | 5.x |
| Parser Markdown | unified + remark-parse | 11.x |
| Renderer Markdown | unified + remark-stringify | 11.x |
| CLI framework | commander | 12.x |
| Testing | Vitest | 2.x |
| Linting | ESLint + Prettier | 9.x / 3.x |
| Build | TypeScript compiler (tsc) | 5.x |
| Ejecución desarrollo | tsx | 4.x |
| Gestor paquetes | npm | 10.x |

Alternativas descartadas incluyen: `marked` (AST menos detallado), regex manual (frágil), `yargs` (menos idiomático), `process.argv` nativo (demasiado manual), Jest (más lento), esbuild (sin type-check), ts-node (más lento). Los riesgos identificados incluyen versión de Node.js target, preservación de formato en remark-stringify, cambios de API en commander y dependencia de npm.

(ver [`09-technology-stack.md`](09-technology-stack.md))

## 10. Security & NFR

**Rendimiento:** Validación completa < 2s (5,000 registros), parseo < 500ms, renderizado < 500ms, mutación < 1s, consulta < 200ms, sin concurrencia en MVP (hash verification detecta cambios concurrentes).

**Disponibilidad:** SLA no aplica (herramienta local). Modo bajo demanda. La escritura atómica garantiza que el original nunca se corrompe. CHANGELOG.md permite reconstruir el historial.

**Seguridad:** Sin autenticación en MVP. Las rutas se normalizan (path traversal mitigado). La herramienta no ejecuta comandos incrustados. Archivos temporales con permisos restrictivos. Logs con IDs y códigos de error, no contenido del backlog. Sin cifrado en reposo ni en tránsito. Sin datos personales esperados (PII). Sin requisitos regulatorios (GDPR, HIPAA, SOC2).

**Respaldos:** Sin backups automáticos en MVP. RPO/RTO no definidos. CHANGELOG.md es historial, no backup completo.

**Mantenibilidad:** ESLint + Prettier, estructura por carpetas (domain/, parser/, validator/, renderer/, services/, storage/, cli/), pruebas unitarias + round-trip + integración + snapshots. Seis eventos de observabilidad opcionales con formato JSON (validation.completed, mutation.rejected, mutation.completed, selection.completed, prompt.generated, write.conflict).

(ver [`10-security-and-nfr.md`](10-security-and-nfr.md))

## 11. Technical Requirements

Los requisitos técnicos cubren siete dimensiones:

- **Performance:** Límites específicos para cada operación (validación < 2s, parseo < 500ms, render < 500ms, mutación < 1s, consulta < 200ms, selección/prompt < 500ms, startup CLI < 300ms).
- **Scalability:** Target 10-5,000 items por backlog, crecimiento ~50-200 items/mes, backlog.md ~500 KB, CHANGELOG.md hasta 10-50 MB, 1 operación concurrente.
- **Availability & SLA:** Herramienta local sin SLA, sin daemon, escritura atómica como estrategia de recuperación, RPO/RTO no definidos.
- **Compliance:** Sin PII esperado, sin requisitos regulatorios, retención mientras existan los archivos, eliminación manual.
- **Security:** Sin autenticación, identificación de actor obligatoria (RN-019), mitigación de path traversal, sin ejecución de contenido, limpieza de temporales, sin cifrado, logs sin secretos, mitigación de command injection.
- **Monitoring & Observability:** Logs estructurados opcionales (flag `--log`), seis eventos mínimos, solo IDs y códigos de error en eventos, códigos de error estables (0-7), salida JSON versionada.
- **Deployment:** Node.js 18+, instalación vía npm, build con tsc, CI/CD con GitHub Actions, versionado semántico, estructura de proyecto `/src/{domain,parser,validator,renderer,services,storage,cli}/`, plataformas Linux y macOS.

(ver [`11-technical-requirements.md`](11-technical-requirements.md))

## 12. Delivery Roadmap

El MVP es una entrega única que incluye todo el alcance: backlog.md, parser, validador, renderer, operaciones (validate, list/get, add, update, select, prompt, close), IDs BLG-XXX, changelog en CHANGELOG.md, escritura atómica, salida humano/JSON, suite de pruebas y documentación.

La secuencia de construcción recomendada en 11 pasos (con dependencias explícitas) comienza por Domain → Parser → Renderer → Validator → FileStorage → BacklogService → SelectionService → ChangelogService → PromptBuilder → CLI → pruebas de integración → documentación. Siete fases con duración estimada total de ~4 semanas.

Los ambientes son desarrollo local, CI (GitHub Actions) y producción (npm). La estrategia de despliegue usa ramas feature, PRs con CI, releases estables con semver. Nueve criterios de go/no-go definen las condiciones de liberación: todas las pruebas pasando, round-trip determinista, validación completa, operaciones sin corrupción, select correcto, prompt con manifiesto, escritura atómica, cobertura de tests ≥80% y README completo.

(ver [`12-delivery-roadmap.md`](12-delivery-roadmap.md))

## Decisiones arquitectónicas

Las siguientes decisiones se derivan de los documentos fuente (principalmente 08-solution-architecture.md). Cada una referencia un ADR propuesto para documentación futura:

| ID | Título | Decisión | Fuente |
|---|---|---|---|
| ADR-001 | Estilo arquitectónico | Hexagonal (Puertos y Adaptadores). El núcleo no depende de infraestructura. | `08-solution-architecture.md` |
| ADR-002 | Estrategia de persistencia | Archivos Markdown planos (backlog.md + CHANGELOG.md). Sin base de datos. | `08-solution-architecture.md`, `01-discovery.md` |
| ADR-003 | Formato de IDs | Auto-incrementales (BLG-XXX para items, CHG-000001 para changelog). | `08-solution-architecture.md` |
| ADR-004 | Mecanismo de parser | AST CommonMark/GFM vía unified + remark-parse. Sin regex. | `08-solution-architecture.md`, `09-technology-stack.md` |
| ADR-005 | Transaccionalidad | Archivos temporales + rename atómico (transacción dual backlog + changelog). | `08-solution-architecture.md` |
| ADR-006 | Garantía de idempotencia | commandId obligatorio en toda mutación. | `08-solution-architecture.md` |
| ADR-007 | Separación de changelog | Archivo separado CHANGELOG.md (no sección dentro de backlog.md). | `08-solution-architecture.md` |
| ADR-008 | Formato de frontmatter | YAML en Markdown. | `08-solution-architecture.md` |
| ADR-009 | Salida estructurada | JSON versionado con códigos de error estables para todas las operaciones. | `08-solution-architecture.md` |
| ADR-010 | CLI framework | commander 12.x para parseo de argumentos y generación de help. | `09-technology-stack.md` |
| ADR-011 | Framework de testing | Vitest 2.x (compatible con Jest API). | `09-technology-stack.md` |
| ADR-012 | Inmutabilidad del histórico | Changelog es append-only. Las entradas no se modifican ni eliminan. | `08-solution-architecture.md`, `06-functional-requirements.md` |

> **Nota:** Los archivos ADR no existen aún. Se listan aquí como referencias a crear en `.devflow/software-architect/decisions/`.

---

> Checklist: todos los documentos fuente referenciados, sin información nueva.
