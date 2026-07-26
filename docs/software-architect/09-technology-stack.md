# 9. Technology Stack

## Stack seleccionado

| Capa | Tecnología | Versión | Justificación |
|---|---|---|---|
| **Runtime** | Node.js | LTS (22.x) | Confirmado por el CTO. Ecosistema maduro, portabilidad Linux/macOS, ideal para herramientas CLI y librerías reutilizables desde OpenCode/DevFlow |
| **Lenguaje** | TypeScript | 5.x | Tipado estático para el modelo de dominio (`BacklogItem`, `BacklogChange`, `BacklogStatus`), contratos de API detectables en tiempo de compilación, documentación auto-contenida |
| **Parser Markdown** | unified + remark-parse | 11.x / 11.x | Estándar de facto para parseo AST de Markdown en Node.js. Soporta GFM, produce AST estructurado, extensible vía plugins. Más robusto que regex para contenido multilínea y checkboxes |
| **Renderer Markdown** | unified + remark-stringify | 11.x / 11.x | Mismo ecosistema que el parser. Produce Markdown canónico determinista. Compatible con el AST de remark-parse garantizando round-trip estable |
| **CLI framework** | commander | 12.x | CLI framework más popular de Node.js. Manejo de subcomandos, flags, `--help` autogenerado, validación de argumentos y tipos TypeScript |
| **Testing** | Vitest | 2.x | Nativo TypeScript, rápido (esbuild), compatible con Jest API, ideal para pruebas unitarias de parser, validator y renderer |
| **Linting** | ESLint + Prettier | 9.x / 3.x | ESLint con reglas TypeScript estrictas; Prettier para formato consistente |
| **Build** | TypeScript compiler (tsc) | 5.x | Compilación estándar TypeScript. Sin necesidad de bundler al ser una herramienta Node.js |
| **Ejecución en desarrollo** | tsx | 4.x | Ejecución TypeScript sin compilación previa para desarrollo rápido |
| **Gestor de paquetes** | npm | 10.x | Confirmado por el usuario |

## Alternativas descartadas

| Tecnología | Alternativa | Razón del descarte |
|---|---|---|
| **Parser** | `marked` | Librería enfocada en renderizado HTML, no en transformación estructurada. Su AST es menos detallado que remark para extraer metadatos, secciones y checkboxes |
| **Parser** | Regex manual | El documento de requerimientos lo descarta explícitamente: "evitar regex como mecanismo principal". Frágil para contenido multilínea, checkboxes y edge cases |
| **CLI** | `yargs` | Similar a commander pero con API menos idiomática en TypeScript. Commander tiene mejor soporte de subcomandos y generación de help |
| **CLI** | `process.argv` nativo | Demasiado trabajo manual para parseo de flags, validación, errores, `--help`. Commander aporta valor sin overhead significativo |
| **Testing** | Jest | Excelente pero más lento que Vitest en modo watch. Vitest es compatible con la API de Jest y tiene mejor integración con TypeScript y esbuild |
| **Build** | `esbuild` | Rápido pero no type-checkea. tsc es la opción estándar para TypeScript. tsx se usa solo en desarrollo |
| **Build** | `ts-node` | Más lento que tsx para desarrollo. tsx usa esbuild para transformación rápida |

## Riesgos del stack

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Versiones de Node.js en máquinas target** | Si el equipo target usa Node.js < 18, algunas APIs modernas no están disponibles | Target Node.js 18+ (LTS activo). Documentar versión mínima en README |
| **remark-stringify no preserve exactamente el formato de entrada** | El round-trip parse(render(x)) podría alterar whitespace o detalles cosméticos | remark-stringify produce Markdown canónico. Verificar con pruebas de round-trip que el contenido semántico se preserva byte-a-byte |
| **commander versión mayor cambie API** | Migración forzada de la CLI | commander tiene historial de retrocompatibilidad. Fijar versión en package.json |
| **Vitest ecosistema menos maduro que Jest** | Posible falta de ciertos matchers o plugins | Vitest es compatible con API de Jest. La mayoría de plugins de Jest funcionan. En caso extremo, se puede migrar a Jest sin cambiar las pruebas |
| **Dependencia de npm para instalación** | Usuarios sin npm/node no pueden usar la herramienta | Backlog Engine está diseñado para entornos de desarrollo Node.js. Documentar pre-requisito |

---

> **Checklist:** ✅ Cada capa tiene tecnología asignada. ✅ Justificaciones documentadas. ✅ Alternativas descartadas con razones. ✅ Riesgos identificados.
