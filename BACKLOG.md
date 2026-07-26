---
schemaVersion: 1
backlogId: backlog-engine
updatedAt: 2026-07-26T05:00:49.679Z
---

# Backlog

## BLG-003: Hacer el changelog mas descriptivo y entendible

- Status: todo
- Priority: high
- Type: improvement
- Scope: format
- Owner: unassigned
- Created: 2026-07-26T05:04:15.311Z
- Updated: 2026-07-26T05:04:15.311Z

### Description

El changelog actual muestra cambios pero no se entiende bien que paso en cada evento. Mejorar las entradas para que describan claramente: que cambio, de que a que, quien lo hizo y porque. Usar lenguaje natural en lugar de solo nombres de campos.

## BLG-001: Renombrar backlog.md a BACKLOG.md

- Status: done
- Priority: high
- Type: feature
- Scope: format
- Owner: unassigned
- Created: 2026-07-26T05:00:54.183Z
- Updated: 2026-07-26T17:48:45.933Z

### Description

Renombrar el archivo backlog.md a BACKLOG.md para que siga el estandar de nomenclatura. Ademas, actualizar todas las referencias internas (CLI, changelog path, etc.) para que apunten al nuevo nombre.

### Acceptance Criteria

- [x] backlog.md renombrado a BACKLOG.md
- [x] Referencia en changelog-validate.ts actualizada a BACKLOG.md
- [x] Regex en cli/index.ts hecha case-insensitive
- [x] Tests: 89/89 pasan

### Evidence

- backlog.md renombrado a BACKLOG.md
- src/cli/commands/changelog-validate.ts: referencia actualizada
- src/cli/index.ts: regex case-insensitive /backlog\\.md$/i
- Tests: 89/89 pasan

## BLG-002: Hacer el formato de los documentos mas humano y menos maquinito

- Status: done
- Priority: high
- Type: improvement
- Scope: format
- Owner: unassigned
- Created: 2026-07-26T05:00:59.931Z
- Updated: 2026-07-26T17:44:45.576Z

### Description

Mejorar el formato del backlog.md y CHANGELOG.md para que sea mas legible por humanos. Sin romper el parseo.

### Acceptance Criteria

- [x] Metadata labels sin bold en backlog renderer
- [x] Entradas de changelog sin bold
- [x] Round-trip parse→render→parse funciona
- [x] Tests: 89/89 pasan

### Evidence

- src/renderer/index.ts: metadata labels sin bold
- src/services/changelog.ts: entries sin bold
- BACKLOG.md y CHANGELOG.md regenerados con formato limpio
- Tests: 89/89 pasan, round-trip verificado
