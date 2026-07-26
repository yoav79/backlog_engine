# 1. Descubrimiento

## Problema

Los agentes de IA no tienen una forma determinista de gestionar backlogs: cuando múltiples agentes o un mismo agente en distintas ejecuciones intentan administrar una lista de tareas pendientes, producen formatos inconsistentes (encabezados, campos, estados y formatos diferentes para el mismo concepto), ediciones que dañan secciones existentes o modifican tareas no autorizadas, sin garantía de IDs únicos, dependencias válidas o transiciones de estado coherentes.

Además, no existe un mecanismo que limite a un agente a trabajar exclusivamente sobre los registros que se le asignaron, ni que exija criterios completos y evidencia para marcar una tarea como terminada.

## Contexto actual

Actualmente no existe una herramienta específica para este propósito. Los agentes de IA trabajan con edición textual libre sobre archivos Markdown, lo que genera:

- Variaciones arbitrarias en la estructura del backlog.
- Imposibilidad de validar consistencia antes de ejecutar tareas.
- Riesgo de corrupción de secciones no autorizadas.
- Dependencia de la disciplina del agente para mantener el formato.

El proyecto nace en el contexto de DevFlow/OpenCode, donde agentes de IA necesitan consumir y modificar backlogs de forma controlada.

## Usuarios target

| Actor | Responsabilidad |
|---|---|
| **Agente consumidor** | Solicita consultas, mutaciones o un prompt de trabajo. |
| **Humano operador** | Revisa el backlog, ejecuta comandos y resuelve errores o conflictos. |
| **Orquestador** | Invoca la API/CLI y entrega el prompt a un agente ejecutor. |
| **Reviewer externo** | Produce evidencia para solicitar cierre de tareas. |

## Buyer y beneficiarios

- **Buyer:** CTO (Chief Technology Officer).
- **Beneficiarios:** CTO, equipo de desarrollo, agentes consumidores de IA.

## Operación actual

Edición textual libre. Los agentes crean encabezados, campos y estados diferentes para el mismo concepto. No hay validación de estructura, semántica, dependencias ni transiciones de estado. No existe garantía de IDs únicos, de que un agente se limite a los registros asignados, ni de que el cierre de una tarea tenga criterios completos y evidencia.

## Restricciones

### Técnicas
- Sin base de datos. El almacenamiento es un único archivo Markdown.
- Portable: debe funcionar en Linux y macOS; Windows es deseable si la tecnología lo permite.
- Determinista: la misma entrada y configuración deben producir la misma salida.
- Escritura atómica con rollback ante error.
- Markdown canónico: el documento se regenera siempre con el mismo orden, encabezados y formato.
- Fail closed: ante documento inválido, conflicto o transición no permitida, no se escribe ningún cambio.
- Sin dependencia de LLM en el MVP.

### De negocio
- Entrega ASAP, sin fecha límite fija.
- Licencia MIT.
- Repositorio oficial: `backlog_engine` (este repositorio).

### Tecnológicas
- Lenguaje: TypeScript/Node.js.

### De diseño
- Escritor único: solo la utilería modifica `backlog.md`. Los agentes solicitan operaciones.
- IDs sobre posiciones: toda referencia usa IDs estables; nunca índices visuales.
- Alcance mínimo: una asignación incluye únicamente los registros seleccionados y prohíbe modificar otros.
- Sin inteligencia oculta: la validación y selección del MVP son reglas explícitas, no decisiones de un LLM.

## Criterios de éxito

1. Existe un contrato Markdown v1 documentado y probado.
2. El parser y renderer superan round-trip determinista.
3. `validate` detecta todas las reglas críticas definidas.
4. `add` y `update` no permiten alterar IDs ni producir documentos inválidos.
5. `select` nunca autoriza tareas `done`, `cancelled` o no solicitadas.
6. `prompt` incluye solo IDs seleccionados y produce manifiesto verificable.
7. Las escrituras son atómicas y detectan conflictos de hash.
8. La API y la CLI comparten la misma lógica de dominio.
9. La suite incluye los escenarios críticos AT-01 a AT-10.
10. El README incluye instalación, ejemplos, esquema y códigos de error.

## Preguntas abiertas

No quedan preguntas abiertas para la fase de Discovery. Toda la información ha sido confirmada mediante el documento de requerimientos proporcionado por el usuario y las respuestas a las preguntas de la entrevista.

---

> **Checklist:** ✅ Problema definido. ✅ Usuarios identificados. ✅ Criterios de éxito medibles.
