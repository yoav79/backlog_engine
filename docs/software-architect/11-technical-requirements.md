# 11. Technical Requirements

## Performance

| Requisito | Objetivo | Medición |
|---|---|---|
| Validación completa de backlog | < 2 s para 5,000 registros | `backlog validate --json` incluye `durationMs` |
| Parseo de backlog | < 500 ms para 5,000 registros | Prueba de carga unitaria |
| Renderizado a Markdown canónico | < 500 ms para 5,000 registros | Prueba de carga unitaria |
| Mutación (add, update, close) | < 1 s incluyendo validación + render + escritura atómica | Medición CLI |
| Consulta (get, list) | < 200 ms | Medición CLI |
| Selección y generación de prompt | < 500 ms para selecciones de hasta 100 IDs | Medición CLI |
| CLI startup (cold start Node.js) | < 300 ms desde invocación hasta primer output | `time backlog --help` |
| Concurrencia | 1 operación a la vez (MVP). Verificación de hash detecta cambios concurrentes (SOURCE_CONFLICT) | Prueba de escritura concurrente |

> Estrategia de degradación: sin optimización distribuida en el MVP. Si el backlog supera 10,000 registros, evaluar carga diferida o paginación en consultas.

## Scalability

| Dimensión | Límite esperado | Estrategia |
|---|---|---|
| Items por backlog | 10 – 5,000 (MVP target) | Estructura plana; si >10k, paginación |
| Crecimiento mensual | ~50–200 items/proyecto | Sin escalamiento especial |
| Tamaño backlog.md | ~500 KB (5,000 items) | Validación y parse en memoria |
| Tamaño CHANGELOG.md | ~10–50 MB (10,000+ cambios) | Append-only; lectura diferida para consultas de rango |
| Entradas de changelog por item | 3–20 durante su ciclo de vida | Sin límite duro |
| Frecuencia de mutaciones | ~10–50/día (uso con agentes) | Sin contención (operación única) |
| Número de agentes concurrentes | 1 (escritor único) | `commandId` + hash verification previenen duplicados |
| Escalabilidad horizontal | No aplica en MVP | Herramienta local, no es servicio remoto |
| Escalabilidad vertical | Node.js single-thread; operaciones síncronas sobre archivos | No requiere paralelismo en MVP |

## Availability & SLA

| Aspecto | Definición |
|---|---|
| **SLA** | No aplica. Herramienta de desarrollo local, sin servicio remoto |
| **Modo de operación** | Bajo demanda (CLI). No hay proceso daemon |
| **Ventanas de mantenimiento** | No aplica |
| **Punto único de fallo** | El archivo `backlog.md`. Validación estructural detecta corrupción externa |
| **Estrategia de recuperación** | Escritura atómica (temp file + rename) garantiza que el original nunca se corrompe. Ante fallo, los temporales se eliminan sin afectar el estado previo |
| **RPO (Recovery Point Objective)** | No definido. Depende de backup manual del usuario |
| **RTO (Recovery Time Objective)** | No definido. Recuperación manual del archivo desde backup |
| **Disponibilidad del changelog** | CHANGELOG.md permite reconstruir el historial de cambios, pero no el backlog completo desde cero |

## Compliance

| Requisito | Estado |
|---|---|
| **Datos personales (PII)** | No se espera que el backlog contenga PII. El contenido es técnico (features, bugs, tareas de desarrollo) |
| **GDPR / HIPAA / SOC2** | Sin requisitos regulatorios identificados |
| **Consentimiento** | No aplica. No se recopilan datos de usuarios |
| **Retención** | Los archivos `backlog.md` y `CHANGELOG.md` se conservan mientras existan en el sistema de archivos local. Sin política de expiración automática |
| **Eliminación** | Eliminar los archivos del sistema de archivos. No hay almacenamiento externo ni copias remotas |
| **Regulaciones de exportación** | Sin restricciones identificadas (herramienta de desarrollo local) |

## Security

| Control | Requisito | Verificación |
|---|---|---|
| **Autenticación** | No aplica en MVP. Backlog Engine opera en entornos de desarrollo local sin autenticación multiusuario | — |
| **Identificación de actor** | RN-019: toda mutación debe registrar el actor (`agent:build`, `human:yoab`). Sin verificación de identidad | Validación de campo `actor` en changelog |
| **Path traversal** | Normalizar y validar rutas de entrada/salida. No seguir enlaces simbólicos fuera del directorio autorizado sin configuración explícita | Prueba de path traversal con `../`, symlinks |
| **Ejecución de contenido** | No ejecutar comandos incrustados en descripciones, notas o criterios. El comando `prompt` no invoca un modelo de lenguaje | Revisión de seguridad en pipeline de CI |
| **Archivos temporales** | Archivos `.tmp` con permisos equivalentes o más restrictivos que el original. Limpieza garantizada incluso en error | Prueba de fallo en medio de escritura |
| **Cifrado en reposo** | No aplica en MVP. Archivos Markdown en texto plano en sistema de archivos local | — |
| **Cifrado en tránsito** | No aplica. No hay transmisión de datos por red | — |
| **Logs y secretos** | Logs estructurados usan IDs y códigos de error, no contenido del backlog. No exponer secretos accidentales | Auditoría de campos en eventos de log |
| **Command injection** | No interpolar contenido no escapado en plantillas cuyo destino pueda interpretarse como comando | Prueba de inyección en pipeline |

## Monitoring & Observability

| Aspecto | Requisito |
|---|---|
| **Logs estructurados** | Opcionales, activables vía flag `--log`. Formato JSON, rotación por tamaño |
| **Eventos mínimos** | `backlog.validation.completed`, `backlog.mutation.rejected`, `backlog.mutation.completed`, `backlog.selection.completed`, `backlog.prompt.generated`, `backlog.write.conflict` |
| **Datos en eventos** | Solo IDs y códigos de error. No se incluye contenido del backlog ni valores de campo |
| **Métricas de rendimiento** | `durationMs` en cada evento de operación completada |
| **Códigos de error** | Estables y versionados en salida JSON. Códigos: 0 (éxito), 1 (error operativo), 2 (argumentos inválidos), 3 (backlog inválido), 4 (no encontrado), 5 (transición rechazada), 6 (conflicto de hash), 7 (commandId duplicado) |
| **Alertas** | No aplica en MVP. Herramienta local sin monitoreo remoto |
| **Salida JSON** | Esquema versionado para todas las operaciones que soporten `--json`. Contrato estable entre versiones |

## Deployment Requirements

| Aspecto | Requisito |
|---|---|
| **Runtime** | Node.js LTS (22.x). Mínimo 18+ |
| **Instalación** | vía npm (público o privado). Comando: `npm install -g backlog-engine` |
| **Build** | Compilación con `tsc` (TypeScript compiler 5.x). Sin bundler |
| **Desarrollo** | Ejecución directa con `tsx` 4.x |
| **CI/CD** | GitHub Actions con pipeline: lint (ESLint + Prettier) → test (Vitest) → build (tsc) |
| **Artefacto de release** | Paquete npm. Versionado semántico (semver) |
| **Testing** | Unitarias (parser, validator, renderer, reglas), round-trip (parse/render/parse), integración CLI, snapshots de prompts, path traversal, inyección |
| **Documentación** | README con instalación, ejemplos, esquema de datos y códigos de error |
| **Estructura de proyecto** | `/src/domain/`, `/src/parser/`, `/src/validator/`, `/src/renderer/`, `/src/services/`, `/src/storage/`, `/src/cli/` |
| **Plataformas target** | Linux (x64, ARM64), macOS (x64, ARM64). Windows no es target primario (sin garantías) |
| **Estrategia de release** | releases semanales/quincenales durante MVP. Changelog mantenido manualmente |

---

> Checklist: requisitos medibles, consistentes con arquitectura (hexagonal, CLI tool, sin DB) y NFR (documento 10).
