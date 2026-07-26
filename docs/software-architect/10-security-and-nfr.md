# 10. Security & NFR

## Rendimiento

| Métrica | Objetivo | Medicición |
|---|---|---|
| Validación completa | < 2 segundos para backlog de 5,000 registros | `backlog validate --json` incluye `durationMs` |
| Parseo | < 500 ms para 5,000 registros | Prueba de carga unitaria |
| Renderizado | < 500 ms para 5,000 registros | Prueba de carga unitaria |
| Mutación (add, update, close) | < 1 segundo incluyendo validación + render + escritura atómica | Medición CLI |
| Consulta (get, list) | < 200 ms | Medición CLI |
| Concurrencia | 1 operación a la vez (sin concurrencia en MVP) | La verificación de hash (SOURCE_CONFLICT) detecta cambios concurrentes |

**Estrategia:** Sin optimización distribuida en el MVP. Si el backlog supera 10,000 registros, evaluar carga diferida o paginación en consultas.

## Disponibilidad

| Aspecto | Definición |
|---|---|
| **SLA** | No aplica. Herramienta de desarrollo local sin servicio remoto |
| **Modo de operación** | Bajo demanda (CLI). No hay servicio permanente |
| **Ventanas de mantenimiento** | No aplica |
| **Estrategia de recuperación** | La escritura atómica garantiza que el archivo original nunca se corrompe. CHANGELOG.md permite reconstruir el historial |
| **Punto único de fallo** | El archivo `backlog.md`. Si se corrompe por causas externas (edición manual, fallo de disco), el validator lo detecta |

## Seguridad

### Autenticación y autorización
- **No aplica en el MVP.** Backlog Engine opera en entornos de desarrollo local sin autenticación multiusuario.
- RN-019: El actor debe identificarse en cada mutación (`agent:build`, `human:yoab`), pero no hay verificación de identidad.

### Path traversal
- Las rutas de entrada y salida se normalizan y validan.
- No se siguen enlaces simbólicos fuera del directorio autorizado sin configuración explícita.

### Ejecución de contenido
- La herramienta **no ejecuta** comandos incluidos en descripciones, notas o criterios de aceptación.
- El comando `prompt` **no ejecuta** el prompt ni invoca un modelo de lenguaje.
- No se permiten plantillas que interpolen contenido sin escape cuando el destino pueda interpretarlo como comando.

### Archivos temporales
- Los archivos `.tmp` se crean con permisos equivalentes o más restrictivos que el archivo original.
- Los temporales se limpian siempre, incluso en caso de error.

### Logs y secretos
- Los logs estructurados usan IDs y códigos de error, no contenido del backlog.
- No se exponen secretos que pudieran estar accidentalmente en el backlog.
- Priorizan IDs y códigos de error sobre valores de campo.

### Cifrado
- No aplica en el MVP. Los archivos Markdown se almacenan en texto plano en el sistema de archivos local.
- No hay transmisión de datos por red.

## Privacidad

| Aspecto | Definición |
|---|---|
| **Datos personales** | No se espera que el backlog contenga PII. El contenido es técnico (features, bugs, tareas) |
| **Consentimiento** | No aplica. No se recopilan datos de usuarios |
| **Retención** | Los archivos `backlog.md` y `CHANGELOG.md` se conservan mientras existan en el sistema de archivos. No hay política de expiración automática |
| **Eliminación** | Eliminar los archivos del sistema de archivos. No hay almacenamiento externo |
| **Regulaciones** | Sin requisitos regulatorios identificados (GDPR, HIPAA, etc.) |

## Respaldo y recuperación

| Aspecto | Definición |
|---|---|
| **Estrategia** | Sin backups automáticos en el MVP. La escritura atómica es la única garantía de integridad |
| **RPO (Recovery Point Objective)** | No definido. Depende de la frecuencia con que el usuario respalde manualmente |
| **RTO (Recovery Time Objective)** | No definido. Recuperación manual del archivo desde backup |
| **CHANGELOG.md** | Funciona como historial de cambios, no como backup completo. No permite reconstruir el backlog desde cero |

## Mantenibilidad

| Aspecto | Definición |
|---|---|
| **Estándares de código** | ESLint con reglas TypeScript estrictas + Prettier para formato |
| **Estructura** | Separación por responsabilidad (RNF-005): domain/, parser/, validator/, renderer/, services/, storage/, cli/ |
| **Documentación** | README con instalación, ejemplos, esquema y códigos de error. Código autodocumentado con tipos TypeScript |
| **Pruebas** | Unitarias (parser, validator, renderer, reglas), round-trip (parse/render/parse), integración CLI, snapshots de prompts |
| **CI/CD** | Por definir en fase de implementación. Se recomienda GitHub Actions con lint + test + build |
| **Monitoreo** | Logs estructurados opcionales (eventos: validation.completed, mutation.rejected, mutation.completed, selection.completed, prompt.generated, write.conflict) |

### Eventos de observabilidad

| Evento | Datos mínimos |
|---|---|
| `backlog.validation.completed` | path, valid, errorCount, durationMs |
| `backlog.mutation.rejected` | operation, itemId, errorCode |
| `backlog.mutation.completed` | operation, itemId, sourceHash, resultHash |
| `backlog.selection.completed` | requestedCount, selectedCount, excludedCount |
| `backlog.prompt.generated` | selectedIds, sourceHash, promptPath |
| `backlog.write.conflict` | expectedHash, actualHash |

---

> **Checklist:** ✅ NFR por categoría (rendimiento, disponibilidad, seguridad, privacidad, respaldo, mantenibilidad). ✅ Métricas definidas. ✅ Mecanismos asignados.
