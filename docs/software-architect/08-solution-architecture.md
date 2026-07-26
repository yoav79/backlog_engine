# 8. Solution Architecture

## Alternativas consideradas

### Alternativa A — Arquitectura Hexagonal (Puertos y Adaptadores)

**Descripción:** El dominio central (Parser, Validator, Renderer, Services) no depende de infraestructura externa. Los adaptadores (CLI, FileStorage) se conectan mediante interfaces. La lógica de negocio es testeable sin archivos ni CLI.

| Aspecto | Evaluación |
|---|---|
| **Ventajas** | Separación clara de responsabilidades; dominio testeable sin IO; fácil añadir nuevos adaptadores (API HTTP en futuro); alineado con principios de diseño (RNF-005 mantenibilidad) |
| **Desventajas** | Mayor número de archivos/módulos inicial; requiere disciplina para mantener las fronteras |
| **Riesgos** | Bajo: la separación es natural dada la arquitectura propuesta en el documento de requerimientos |
| **Complejidad** | Media-baja. La estructura de carpetas (`domain/`, `parser/`, `validator/`, `renderer/`, `services/`, `storage/`, `cli/`) es clara y cada módulo tiene una responsabilidad única |

### Alternativa B — Script Monolítico

**Descripción:** Toda la lógica en un único archivo (o pocos archivos) sin separación formal entre dominio e infraestructura. Parser, validator, renderer y CLI coexisten en el mismo ámbito.

| Aspecto | Evaluación |
|---|---|
| **Ventajas** | Máxima simplicidad inicial; menor número de archivos; prototipado rápido |
| **Desventajas** | Difícil de testear por separado; acoplamiento entre IO y lógica; cualquier cambio en formato de salida puede afectar el parser; viola RNF-005 (mantenibilidad) y RNF-004 (compatibilidad como librería) |
| **Riesgos** | Alto: la falta de separación dificulta pruebas unitarias, round-trip y la reutilización como librería; cualquier cambio estructural tiene efecto dominó |
| **Complejidad** | Baja inicial, pero crece exponencialmente con cada nuevo comando |

### Alternativa C — Servicio Backend con API HTTP

**Descripción:** Backlog Engine se ejecuta como un proceso servidor (daemon) con API REST. La CLI es solo un cliente HTTP. El almacenamiento sigue siendo archivos Markdown.

| Aspecto | Evaluación |
|---|---|
| **Ventajas** | Permite concurrencia real; múltiples agentes pueden conectarse remotamente; separación física entre cliente y servidor |
| **Desventajas** | Infraestructura adicional (servicio, puerto, autenticación); complejidad operativa; contradice el principio de "sin base de datos" y la simplicidad del MVP |
| **Riesgos** | Alto: sobreingeniería para el MVP; introduce necesidad de gestión de procesos, autenticación, concurrencia; fuera del alcance definido |
| **Complejidad** | Alta. Requiere manejo de conexiones, estados, locking, autenticación |

## Estilo seleccionado

**Arquitectura Hexagonal (Puertos y Adaptadores)** — Alternativa A.

### Justificación

1. **Alineación con principios de diseño:** El documento de requerimientos establece "determinismo", "escritor único", "fail closed" y "sin inteligencia oculta". La arquitectura hexagonal permite verificar cada principio en aislamiento.

2. **RNF-005 Mantenibilidad:** El esquema, reglas, parser, renderer y servicios están separados por responsabilidad, como exige el requisito.

3. **RNF-004 Compatibilidad como librería:** La lógica central (`domain/`, `parser/`, `validator/`, `renderer/`, `services/`) no depende de `cli/` ni `storage/`. Puede importarse como librería desde OpenCode, DevFlow u otros runtimes.

4. **Testabilidad:** El dominio se prueba sin IO. Parser y Renderer se prueban con strings. Las reglas de negocio se prueban sin archivos.

5. **Evolución:** Añadir un adaptador HTTP en el futuro no requiere modificar el núcleo. Coincide con la exclusión de "interfaz web o móvil" del MVP pero no la imposibilita.

## Diagrama de contexto

```
+-------------------+
|   Agente de IA    |
| (solicitante)     |
+---------+---------+
          |
          | Llamadas a CLI o API interna
          v
+-------------------+     +-------------------+
|   Backlog Engine  |---->|   Sistema de      |
|   (utilería CLI)  |     |   Archivos Local   |
+-------------------+     +-------------------+
          |                        |
          |                        v
          |               +-------------------+
          |               |   backlog.md      |
          |               |   CHANGELOG.md    |
          |               +-------------------+
          |
          v
+-------------------+
|   Humano operador |
| (revisa, opera)   |
+-------------------+
```

**Relaciones externas:**
- **Agente de IA:** Consume la utilería vía CLI (subproceso) o vía API interna (librería). Nunca escribe directamente los archivos.
- **Humano operador:** Ejecuta comandos directamente, revisa salidas, resuelve conflictos manualmente.
- **Sistema de archivos:** Único medio de persistencia. Archivos `backlog.md` y `CHANGELOG.md` son la fuente de verdad.

## Diagrama de contenedores

```
+--------------------------------------------------+
|                 Backlog Engine                     |
|                                                    |
|  +--------+  +----------+  +------------+         |
|  |  CLI   |  | Backlog  |  | Changelog  |         |
|  | (adap.)|  | Service  |  | Service    |         |
|  +--------+  +----------+  +------------+         |
|       |            |              |                |
|       v            v              v                |
|  +--------+  +----------+  +------------+         |
|  | Parser |  |Validator |  |  Renderer  |         |
|  +--------+  +----------+  +------------+         |
|       |            |              |                |
|       +-----+------+------+------+                |
|             |             |                        |
|             v             v                        |
|     +-------------+  +-------------+              |
|     | FileStorage |  | PromptBuild |              |
|     | (adap.)     |  | (adap.)     |              |
|     +-------------+  +-------------+              |
|             |                                      |
|             v                                      |
|     +-------------+  +-------------+              |
|     | backlog.md  |  | CHANGELOG.md|              |
|     +-------------+  +-------------+              |
+--------------------------------------------------+
```

**Contenedores:**

| Contenedor | Tipo | Responsabilidad |
|---|---|---|
| **CLI** | Adaptador de entrada | Procesa argumentos, invoca servicios, formatea salida |
| **Parser** | Núcleo | Markdown → BacklogDocument |
| **Validator** | Núcleo | Valida estructura, semántica y transiciones |
| **Renderer** | Núcleo | BacklogDocument → Markdown canónico |
| **BacklogService** | Servicio de aplicación | Orquesta add, update, close (con changelog) |
| **SelectionService** | Servicio de aplicación | Filtra IDs, evalúa dependencias |
| **ChangelogService** | Servicio de aplicación | Genera changelog, calcula field changes, gestiona commandId |
| **PromptBuilder** | Servicio de aplicación | Construye prompt acotado y manifiesto |
| **FileStorage** | Adaptador de salida | Lectura/escritura atómica con hash verification |
| **Domain** | Capa de tipos | BacklogItem, BacklogChange, interfaces, constantes |

## Principios arquitectónicos

| Principio | Implicación arquitectónica |
|---|---|
| **Dependencias hacia adentro** | El núcleo (domain, parser, validator, renderer) no conoce la existencia de CLI ni FileStorage |
| **Inversión de dependencias** | BacklogService depende de interfaces (Parser, Validator, Renderer, FileStorage), no de implementaciones concretas |
| **Transaccionalidad** | Toda mutación es una transacción: backlog.md + CHANGELOG.md se escriben juntos o no se escribe ninguno |
| **Inmutabilidad del histórico** | Changelog es append-only. Las entradas no se modifican ni eliminan |
| **Idempotencia** | commandId garantiza que una misma solicitud no se aplique dos veces |
| **Canonicidad** | El renderer produce siempre el mismo Markdown para la misma representación interna. No hay "estilos de formato" |

## Decisiones y justificación

| Decisión | Opción seleccionada | Alternativas | Justificación |
|---|---|---|---|
| **Estilo arquitectónico** | Hexagonal (Puertos y Adaptadores) | Monolito, Servicio HTTP | Testabilidad, mantenibilidad, reutilización como librería |
| **Parser** | AST CommonMark/GFM (librería) | Regex como mecanismo principal | Robustez para multilínea, checkboxes, edge cases; RNF-001 determinismo |
| **Persistencia** | Archivos Markdown planos | Base de datos (SQLite, JSON) | Sin infraestructura, legible por humanos, alineado con el propósito |
| **IDs** | Auto-incrementales numéricos (`BLG-001`) | UUID, hash-based, slug-based | Legibles, orden natural, predecibles |
| **IDs changelog** | Auto-incrementales (`CHG-000001`) | UUID | Misma razón: legibles, orden natural |
| **Formato frontmatter** | YAML en Markdown | JSON en Markdown, solo Markdown | Estándar en herramientas estáticas, legible, parseable |
| **Transaccionalidad** | Archivos temporales + rename atómico | Lock file + escritura directa | Portable (rename es atómico en POSIX), sin necesidad de lock |
| **Salida JSON** | Esquema versionado con códigos de error estables | JSON sin versionar | Evolución del esquema sin romper consumidores |
| **Changelog** | Archivo separado (`CHANGELOG.md`) | Misma sección en backlog.md | Separación de concerns, el backlog no debe mezclar historial con estado actual |
| **commandId** | Obligatorio en toda mutación | Opcional, confiar en hash | Idempotencia garantizada, evita duplicados por reintentos |

---

> **Checklist:** ✅ Mínimo 2 alternativas (3 presentadas). ✅ Estilo definido y justificado (Hexagonal). ✅ Principios documentados (6 principios). ✅ Decisiones documentadas (10 decisiones).
