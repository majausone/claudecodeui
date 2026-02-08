# Tareas - Sistema de Claude Teams en Claude Code UI

## 1. Sistema de pre-prompt automático (config.json)
- [x] 1.1. Añadir campo `preprompt` al config del team, que se auto-genera cada vez que se crea/edita un agente o se cambia el nombre del equipo
- [x] 1.2. El preprompt indica al agente: "Perteneces al equipo X, tus agentes son: agente-1 (rol), agente-2 (rol)..."
- [x] 1.3. El preprompt se concatena ANTES del prompt del usuario (preprompt + prompt)
- [x] 1.4. El preprompt es editable desde el panel (pero se regenera automáticamente si cambias agentes/nombres)
- [x] 1.5. El prompt también sigue siendo editable (por defecto vacío)
- [x] 1.6. El preprompt incluye instrucciones de leer task file, leer human-tasks.md (líder), limpiar basura de sesiones anteriores, apuntar progreso

## 2. Carpeta de tareas local por equipo (dentro del proyecto)
- [x] 2.1. Al crear un team, se crea automáticamente una carpeta `.teams/{nombre-equipo}/` en la raíz del proyecto
- [x] 2.2. Dentro de esa carpeta se crea un archivo `.md` por cada agente (ej: `team-lead.md`, `agente-1.md`)
- [x] 2.3. Al crear un nuevo agente, se crea automáticamente su archivo `.md` en esa carpeta
- [x] 2.4. Al eliminar un agente, se elimina su archivo `.md`
- [x] 2.5. Los task files se asignan automáticamente al agente en config (sin rutas manuales)
- [x] 2.6. No depende de la sesión: la carpeta es por equipo

## 3. Documento "Human Tasks" (solo para el team-lead)
- [x] 3.1. Al crear un team, se crea `human-tasks.md` dentro de `.teams/{nombre-equipo}/`
- [x] 3.2. Este archivo es la FUENTE DE VERDAD del humano
- [x] 3.3. El team-lead SOLO puede LEER este archivo (indicado en su preprompt)
- [x] 3.4. El humano puede escribir/editar desde el panel (pestaña "Human Tasks")
- [x] 3.5. En el preprompt del líder se le indica que lea siempre este archivo
- [x] 3.6. El líder tiene su propio task file (`team-lead.md`) para sus tareas internas

## 4. Pestañas en el panel de detalle de agente
- [x] 4.1. Para agentes normales: pestaña "Tasks" con su archivo `.md`
- [x] 4.2. Para el team-lead: dos pestañas — "Human Tasks" + "Tasks"
- [x] 4.3. En ambas pestañas se muestra la ruta del archivo
- [x] 4.4. El editor permite editar el contenido y guardarlo

## 5. Edición de nombre y modelo desde el panel
- [x] 5.1. El nombre del agente es editable desde el panel
- [x] 5.2. El modelo del agente es editable desde el panel
- [x] 5.3. Al cambiar el nombre de un agente, se regenera el preprompt de todos los miembros
- [x] 5.4. Al cambiar el nombre del equipo, se regenera el preprompt de todos los miembros

## 6. Cosas ya hechas (de iteraciones anteriores)
- [x] 6.1. Icono de Teams en Sidebar (mobile + desktop + collapsed)
- [x] 6.2. Panel TeamsPanel.jsx con gestión de equipos y agentes
- [x] 6.3. Backend API (server/routes/teams.js) — CRUD completo
- [x] 6.4. Selector de agentes (AgentSelector.jsx) en el chat input con portal
- [x] 6.5. API client (src/utils/api.js) con endpoints de teams + human-tasks
- [x] 6.6. Build compila sin errores
