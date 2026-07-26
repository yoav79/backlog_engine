# 12. Delivery Roadmap

## MVP

Entrega única que incluye todo el alcance definido en Fase 2 y Fase 6:

- Un archivo `backlog.md` como fuente persistente de verdad.
- Parser Markdown hacia un modelo interno tipado (BacklogDocument, BacklogItem).
- Validador estructural, semántico y de transiciones.
- Renderer canónico de Markdown.
- Operaciones: `validate`, `list`/`get`, `add`, `update`, `select`, `prompt` y `close`.
- IDs automáticos y estables (formato BLG-XXX).
- Changelog en archivo separado `CHANGELOG.md`.
- Escritura atómica con rollback ante error y verificación hash.
- Salida humana y salida JSON para integración.
- Suite de pruebas: unitarias, round-trip, integración CLI y snapshots.
- Documentación: README con instalación, ejemplos, esquema de datos y códigos de error.

## Épicas y entregas

Una sola entrega (MVP completo). No hay cortes incrementales ni entregas parciales.

### Secuencia de construcción recomendada

| Orden | Módulo | Depende de | Justificación |
|---|---|---|---|
| 1 | **Domain** (tipos, interfaces, constantes) | — | Base de todo el modelo: BacklogItem, BacklogStatus, ChangeOperation, interfaces de puertos |
| 2 | **Parser** | Domain | Convierte Markdown → modelo interno. Necesario para cualquier operación de lectura |
| 3 | **Renderer** | Domain | Convierte modelo interno → Markdown canónico. Necesario para cualquier escritura |
| 4 | **Validator** | Domain, Parser | Valida estructura, semántica y transiciones. Depende del parser para obtener el modelo |
| 5 | **FileStorage** | Domain | Lectura/escritura atómica con hash verification. Depende de Domain (interfaces) |
| 6 | **BacklogService** | Parser, Validator, Renderer, FileStorage | Orquesta add, update, close con changelog. Núcleo de la lógica de aplicación |
| 7 | **SelectionService** | BacklogService | Filtra IDs, evalúa dependencias, construye alcance de trabajo |
| 8 | **ChangelogService** | Domain | Genera entradas de changelog, calcula field changes, gestiona commandId |
| 9 | **PromptBuilder** | SelectionService, Renderer | Construye prompt acotado con manifiesto JSON |
| 10 | **CLI** | Todos los servicios | Adaptador de entrada: procesa argumentos, invoca servicios, formatea salida |
| 11 | **Pruebas de integración y round-trip** | Todos los módulos | Validación integral del sistema |
| 12 | **Documentación y empaquetado** | Todo | README, licencia, configuración npm, CI/CD |

## Dependencias

| Dependencia | Tipo | Impacto |
|---|---|---|
| Node.js LTS (22.x, mín. 18+) | Runtime | Sin releases específicas. Usar la versión LTS vigente |
| TypeScript 5.x | Build | Sin restricción de versión |
| `unified` + `remark-parse` + `remark-stringify` | Librería parser/renderer | Dependencia crítica: el AST CommonMark/GFM es la base del parser y renderer |
| `commander` | Librería CLI | Opcional: puede sustituirse por parseo manual de argumentos |
| `vitest` | Testing | Sin restricción |
| GitHub Actions | CI/CD | Sin restricción de infraestructura |
| npm registry | Publicación | Cuenta npm requerida para publicación |

No hay dependencias externas con otros proyectos (DevFlow, OpenCode) ni con releases específicas de Node.js.

## Fases

| Fase | Actividad | Criterio de salida | Duración estimada |
|---|---|---|---|
| **F-01** | Domain + Parser + Renderer | Pruebas unitarias pasando, round-trip parse/render/parse OK | 1 semana |
| **F-02** | Validator (reglas estructurales, semánticas, transiciones) | Validación de backlog de ejemplo con 0 errores y detección de todos los casos de error | 4 días |
| **F-03** | FileStorage + BacklogService | Operaciones add, update, close funcionales con escritura atómica y changelog | 1 semana |
| **F-04** | SelectionService + PromptBuilder | Select excluye done/cancelled, prompt produce manifiesto JSON verificable | 3 días |
| **F-05** | CLI (todos los comandos) | Todos los comandos operativos: validate, list, get, add, update, select, prompt, close | 4 días |
| **F-06** | Pruebas de integración + round-trip + CI/CD | Suite completa pasando en CI, round-trip determinista verificado | 4 días |
| **F-07** | Documentación + empaquetado + release | README completo, npm publish, release en GitHub | 2 días |

**Duración total estimada:** ~4 semanas.

## Ambientes

| Ambiente | Propósito | Configuración |
|---|---|---|
| **Desarrollo local** | Desarrollo y pruebas | Node.js LTS local, `npm link` o `tsx` para ejecución directa |
| **CI (GitHub Actions)** | Pruebas automatizadas | lint → test → build en PRs y pushes a main |
| **Producción (npm)** | Distribución a usuarios | `npm publish` con versionado semántico |

No hay ambientes staging ni pre-producción. La herramienta es una CLI local que no requiere infraestructura remota.

## Estrategia de despliegue

1. El desarrollo se realiza en ramas feature con base en `main`.
2. Cada PR ejecuta CI: lint → test (Vitest) → build (tsc).
3. Al mergear a `main`, se ejecuta CI completo incluyendo pruebas de integración.
4. Para release:
   - Se actualiza versión en `package.json` (semver).
   - Se genera entry en CHANGELOG.md del proyecto.
   - Se crea tag y release en GitHub.
   - Se publica a npm registry con `npm publish`.
5. Solo releases estables. No hay canal `next` ni pre-releases.

## Criterios de go/no-go

Para liberar la entrega MVP deben cumplirse **todas** las condiciones siguientes:

| # | Criterio | Verificación |
|---|---|---|
| 1 | **Todas las pruebas pasando** | Suite completa (unitarias + integración + CLI) ejecutada en CI sin fallos |
| 2 | **Round-trip determinista** | `parse → render → parse` produce el mismo AST. Documentado como prueba automatizada |
| 3 | **Validación de backlog** | `backlog validate` detecta todas las reglas críticas definidas (estructurales, semánticas, transiciones) |
| 4 | **Operaciones sin corrupción** | `add`, `update`, `close` no alteran IDs ni producen documentos inválidos. Fail closed ante error |
| 5 | **Select correcto** | `select` nunca autoriza ítems done, cancelled o no solicitados |
| 6 | **Prompt con manifiesto** | `prompt` genera manifiesto JSON verificable con sourceHash |
| 7 | **Escritura atómica** | Fallo durante escritura no corrompe el backlog original. Verificado con prueba de interrupción |
| 8 | **Cobertura de tests** | Mínimo 80% de cobertura en módulos core (domain, parser, validator, renderer, services) |
| 9 | **README completo** | Incluye instalación, ejemplos de uso, esquema de backlog y códigos de error |

---

> **Checklist:** ✅ MVP definido (alcance completo de una entrega). ✅ Épicas ordenadas (secuencia de construcción recomendada). ✅ Dependencias mapeadas (internas y externas).
