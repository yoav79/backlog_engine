# 2. Product Requirements

## Product Vision

Backlog Engine será una utilería determinista, pequeña y sin base de datos, que permita a agentes de IA consultar y modificar un backlog almacenado en un único archivo Markdown, actuando como capa de integridad y acceso sin ser un agente autónomo ni un orquestador.

## Value Proposition

Convertir un archivo Markdown en un registro controlado, auditable y compatible con agentes, eliminando la corrupción estructural, los cambios fuera de alcance y los estados inconsistentes que produce la edición textual libre.

## Objectives & KPIs

### Objetivo general

Proporcionar una interfaz determinista para crear, consultar, actualizar, validar y seleccionar elementos de backlog, preservando permanentemente un formato Markdown canónico y generando asignaciones de trabajo estrictamente acotadas.

### Objetivos específicos

1. Definir un contrato Markdown versionado y único.
2. Impedir escrituras que produzcan una estructura inválida.
3. Permitir altas y actualizaciones parciales sin edición libre del documento.
4. Seleccionar registros por IDs estables y excluir automáticamente los ya terminados o cancelados.
5. Generar prompts con alcance positivo y prohibiciones explícitas.
6. Guardar cambios de forma atómica y mantener evidencia suficiente para diagnóstico.
7. Ofrecer una lógica central reutilizable desde CLI y desde código.

### KPIs

| KPI | Métrica | Criterio de éxito |
|---|---|---|
| Round-trip determinista | parse(render(parse(md))) produce el mismo resultado semántico | Sin pérdida de información |
| Validación completa | validate detecta todas las reglas críticas (IDs duplicados, dependencias rotas, ciclos, transiciones inválidas) | 100% de reglas cubiertas |
| Escritura atómica | Fallo en medio de una escritura no corrompe el archivo original | Sin archivos parciales |
| Alcance de selección | select nunca autoriza IDs no solicitados o con estado final | Zero falsos positivos |
| Cobertura de pruebas | Escenarios AT-01 a AT-10 pasan | Suite completa verde |

## MVP Scope

1. Un archivo `backlog.md` como fuente persistente de verdad.
2. Parser Markdown hacia un modelo interno tipado.
3. Validador estructural, semántico y de transiciones.
4. Renderer canónico de Markdown.
5. Operaciones: validate, list/get, add, update, select, prompt y close.
6. IDs automáticos y estables (formato BLG-XXX).
7. Escritura atómica con rollback ante error.
8. Salida humana y salida JSON para integración.
9. Pruebas unitarias, de round-trip e integración CLI.

## Post-MVP Scope

No hay funcionalidades diferidas identificadas. Todos los items fuera del alcance del MVP son exclusiones permanentes (ver Out of Scope).

## Out of Scope

Son exclusiones permanentes, no funcionalidades diferidas:

- Interfaz web o móvil.
- Base de datos, sincronización distribuida o edición colaborativa en tiempo real.
- Ejecución del agente que recibe el prompt.
- Revisión automática del código producido.
- Planificación inteligente, estimación o priorización mediante LLM.
- Autenticación multiusuario y permisos remotos.
- Soporte simultáneo para múltiples formatos de documento.

## Key Assumptions

1. **Los agentes consumidores respetarán el contrato de la API.** Backlog Engine proporciona la interfaz; los agentes deben usarla en lugar de editar el Markdown directamente. Si un agente evade la API y edita el archivo, la herramienta no puede garantizar integridad (aunque validate lo detectará).

2. **El formato Markdown canónico es adecuado para humanos y máquinas.** Se asume que un archivo Markdown bien estructurado, con frontmatter y secciones predecibles, es legible para desarrolladores y procesable por parsers deterministas sin necesidad de una base de datos.

3. **El entorno de ejecución es una estación de desarrollo controlada.** No se requiere autenticación multiusuario, permisos remotos ni alta disponibilidad en el MVP. La herramienta opera sobre el sistema de archivos local con un único usuario/agente a la vez.

4. **El volumen de trabajo cabe en un único archivo Markdown.** Se asume un backlog de hasta ~5,000 registros, manejable en memoria sin necesidad de streaming ni paginación.

---

> **Checklist:** ✅ Visión clara. ✅ MVP delimitado. ✅ Exclusiones explícitas.
