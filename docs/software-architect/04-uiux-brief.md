# 4. UI/UX Brief

## Design System

Backlog Engine es una herramienta de línea de comandos. No existe interfaz gráfica. El sistema de diseño se define por las convenciones de la CLI:

### Estructura de comandos

```
backlog <verbo> [<path>] [<args>] [--flags]
```

- **Verbos** con guiones cuando son multi-palabra (ej: `list-pending`, `check-deps`).
- Verbos cortos para operaciones principales: `init`, `validate`, `list`, `get`, `add`, `update`, `select`, `prompt`, `close`.
- **Path** es siempre el primer argumento posicional (ruta al `backlog.md`).
- **Flags** usan `--` para nombres largos (`--json`, `--status`, `--ids`).
- **Valores** se pasan con espacio o `=` (`--status done` o `--status=done`).
- **Múltiples valores** separados por coma (`--ids BLG-001,BLG-002`).

### Convenciones de nomenclatura

- Comandos en minúsculas con guiones (`backlog init`, `backlog list-pending`).
- IDs en formato `BLG-XXX` (mayúsculas, guión, número de 3-6 dígitos).
- Estados en minúsculas con guiones bajos en el modelo interno, pero en la CLI se aceptan en minúsculas simples (`done`, `in-progress` como alternativa a `in_progress`).
- Archivos: `backlog.md` como nombre canónico del archivo de backlog.

## Brand Elements

- **Nombre del producto:** Backlog Engine
- **Comando raíz:** `backlog`
- **Prompt/identidad visual:** Sin logo ni marca visual. La identidad es puramente textual.

### Paleta de colores ANSI (terminal)

| Elemento | Color ANSI | Uso |
|---|---|---|
| Éxito | Verde (`\x1b[32m`) | `✔ done`, `✔ valid`, `✔ created` |
| Error | Rojo (`\x1b[31m`) | `✖ error`, `✖ invalid` |
| Advertencia | Amarillo (`\x1b[33m`) | `⚠ dependency_blocked`, `⚠ warning` |
| ID | Cian (`\x1b[36m`) | `BLG-001`, `BLG-042` |
| Campo/etiqueta | Negrita (`\x1b[1m`) | `**Title:**`, `**Status:**` |
| Título de sección | Blanco + Negrita | Encabezados en salida list |
| Valor normal | Blanco (`\x1b[37m`) | Contenido de campos |
| Atenuado | Gris (`\x1b[90m`) | Metadatos secundarios, timestamps |

**Regla:** El color nunca es el único diferenciador. Siempre hay un indicador textual además del color.

### Tono de los mensajes

- **Informativo:** Claro, directo, sin jerga innecesaria.
- **Errores:** `[CÓDIGO] Mensaje descriptivo.` con el error code estable primero.
- **Éxito:** Confirmación breve del resultado.
- **CLI:** Sigue la filosofía de "no news is good news" pero con resumen de la operación.

## Target Devices

| Entorno | Soporte | Prioridad |
|---|---|---|
| Terminal Linux (bash, zsh) | Completo | MVP |
| Terminal macOS (zsh, bash) | Completo | MVP |
| Terminal Windows (PowerShell, WSL) | Deseable | Post-MVP |
| CI/CD (GitHub Actions, etc.) | Completo (vía salida JSON) | MVP |
| OpenCode / DevFlow | Completo (vía API interna) | MVP |

No aplican resoluciones de pantalla, ni dispositivos móviles.

## Accessibility Requirements

Al ser una herramienta CLI, los requisitos de accesibilidad se centran en:

1. **Independencia del color:** El color ANSI es decorativo y de refuerzo. Toda la información se comunica textualmente.
2. **Salida estructurada:** El flag `--json` permite consumo programático sin depender de formato visual.
3. **Mensajes de error claros:** Cada error incluye un código único (`DEPENDENCY_CYCLE`, `INVALID_STATUS`, etc.) y un mensaje descriptivo.
4. **Contraste:** Los colores ANSI usados tienen suficiente contraste sobre fondo oscuro y claro.
5. **Lectores de pantalla:** La salida de texto plano es compatible con lectores de pantalla de terminal.

## Key Screens

### Salidas de comando

Dado que no hay pantallas gráficas, se documentan las **plantillas de salida** de cada comando:

### 1. Salida `backlog help`

```
Backlog Engine v1.0 — Utilería determinista de backlog en Markdown

USO:
  backlog <comando> [<path>] [<args>] [--flags]

COMANDOS:
  init      Inicializar un backlog vacío
  validate  Validar estructura y semántica del backlog
  list      Listar registros con filtros opcionales
  get       Obtener uno o más registros por ID
  add       Agregar un nuevo registro
  update    Actualizar campos de un registro
  select    Seleccionar IDs pendientes para asignación
  prompt    Generar prompt de trabajo para un agente
  close     Cerrar un registro con evidencia

FLAGS GLOBALES:
  --json    Salida en formato JSON
  --help    Mostrar ayuda
  --version Mostrar versión

EJEMPLOS:
  backlog init backlog.md --id BACKLOG-DEVFLOW
  backlog validate backlog.md
  backlog add backlog.md --title "Crear parser" --type feature
  backlog select backlog.md --ids BLG-001,BLG-002

Ejecute 'backlog <comando> --help' para ayuda detallada de cada comando.
```

### 2. Salida `backlog validate` (modo humano)

```
✔ backlog.md es válido
  - Registros: 12
  - Errores: 0
  - Hash: sha256:a1b2c3...
```

O en caso de error:

```
✖ backlog.md tiene 3 errores

  1. [DUPLICATE_ITEM_ID] ID duplicado: BLG-005 aparece 2 veces
     → Línea 42, 78

  2. [DEPENDENCY_NOT_FOUND] BLG-003 depende de BLG-999 (no existe)
     → Item: BLG-003

  3. [INVALID_TRANSITION] BLG-007: estado 'finished' no válido
     → Valores permitidos: todo, ready, in_progress, blocked, done, cancelled
```

### 3. Salida `backlog list` (modo humano)

```
Backlog: backlog.md (12 registros)

  • BLG-001 — Crear parser Markdown
    Status:  ✔ done     Priority: high     Type: feature
    
  • BLG-002 — Implementar validador
    Status:  ● in_progress  Priority: high     Owner: build-agent
    
  • BLG-003 — Documentar API
    Status:  ○ todo         Priority: medium   Owner: unassigned
```

### 4. Salida `backlog get BLG-001` (modo humano)

```
BLG-001 — Crear parser Markdown
────────────────────────────────
  Status:     ✔ done
  Priority:   high
  Type:       feature
  Owner:      build-agent
  Scope:      backlog-engine
  DependsOn:  (ninguna)
  Created:    2026-07-25
  Updated:    2026-07-25

  Description:
  Crear un parser que convierta backlog.md al modelo interno.

  Acceptance Criteria:
  ✔ Lee frontmatter.
  ✔ Reconoce registros por ID.

  Evidence:
  • tests: npm test passed
  • PR: #42

  Notes:
  • No modificar otros módulos.
```

### 5. Salida `backlog add` (modo humano)

```
✔ Registro creado: BLG-013
```

### 6. Salida `backlog update` (modo humano)

```
✔ BLG-002 actualizado
  - Status: in_progress → done
  - Evidence: +1
```

### 7. Salida `backlog select` (modo humano)

```
Selección completada
  Solicitados:  5
  Seleccionados: 3
  Excluidos:    2

  Excluidos:
  • BLG-002 → status: done
  • BLG-005 → status: cancelled

  Dependencias:
  • BLG-003 → dependencia BLG-001: ok (done)
```

### 8. Salida `backlog prompt` (modo humano)

```
✔ Prompt generado
  Archivo:  .backlog/prompts/correction-BLG-001-BLG-003.md
  IDs:      2 seleccionados de 2 solicitados
  Hash:     sha256:a1b2c3...

  Manifiesto: .backlog/prompts/correction-BLG-001-BLG-003.manifest.json
```

### 9. Salida `backlog close` (modo humano)

```
✔ BLG-007 cerrado (done)
  - Acceptance criteria: 3/3 completados
  - Evidence: 2 registradas
```

## UX Principles

| Principio | Implicación |
|---|---|
| **Determinismo** | La misma entrada produce exactamente la misma salida. Sin sorpresas. |
| **Predictibilidad** | Los comandos siguen el patrón `backlog <verbo> <path> [args]`. Un usuario que conoce `add` puede deducir `update`. |
| **Progressive disclosure** | `--help` muestra lo esencial. `backlog <comando> --help` muestra detalles y ejemplos. |
| **Feedback claro** | Toda operación confirma el resultado. Los errores incluyen código, mensaje y contexto. |
| **Silencio productivo** | En éxito, la salida es mínima pero informativa. En error, la salida es detallada. |
| **Modo JSON siempre disponible** | Toda operación soporta `--json` para consumo por agentes y automatizaciones. |
| **Consistencia cromática** | Los colores ANSI siguen la paleta definida y son siempre redundantes con texto. |

---

> **Checklist adaptado para CLI:** ✅ Convención de comandos definida. ✅ Salidas clave documentadas (9 templates). ✅ Accesibilidad considerada. ✅ Principios UX definidos.
