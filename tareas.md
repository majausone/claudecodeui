# Tareas - Sistema de Claude Teams en Claude Code UI

## 1. Investigación previa
- [x] 1.1. Explorar la estructura actual de paneles/vistas de la aplicación (Settings, Chat, etc.)
- [x] 1.2. Investigar el sistema de archivos que crea Claude para los teams (`~/.claude/teams/`, `~/.claude/tasks/`)
- [x] 1.3. Investigar el sistema de archivos de agentes (`~/.claude/agents/`)
- [x] 1.4. Crear un par de agentes de prueba con la herramienta TeamCreate para ver qué archivos y estructura genera
- [x] 1.5. Investigar la API del SDK (`@anthropic-ai/claude-agent-sdk`) relacionada con teams y agentes

## 2. UI - Icono y panel de Teams
- [x] 2.1. Añadir un icono de Teams a la derecha de Settings en la barra de navegación
- [x] 2.2. Crear un nuevo panel/vista de Teams (igual que el panel de Settings o Chat)
- [x] 2.3. Integrar el panel en el sistema de navegación existente de la app

## 3. Gestión de equipos (Teams)
- [x] 3.1. Listar equipos existentes en el panel
- [x] 3.2. Crear equipos nuevos desde el panel
- [x] 3.3. Eliminar equipos desde el panel
- [x] 3.4. Mostrar el estado de cada equipo (activo, miembros, tareas pendientes)

## 4. Gestión de agentes dentro de cada equipo
- [x] 4.1. Listar los agentes de un equipo
- [x] 4.2. Editar el prompt/configuración de cada agente desde el panel
- [x] 4.3. Asociar un archivo de tareas propio a cada agente (que el agente pueda leer y editar)
- [x] 4.4. Crear nuevos agentes dentro de un equipo
- [x] 4.5. Eliminar agentes de un equipo

## 5. Control y supervisión de agentes
- [ ] 5.1. Ver qué está haciendo cada agente en tiempo real (estado, última actividad)
- [ ] 5.2. Detener un agente manualmente desde el panel
- [ ] 5.3. Sistema de timeout configurable (ej: cada X minutos el jefe revisa qué hace cada agente)
  - [ ] 5.3.1. Implementar el timeout con funciones de Node.js (setInterval/setTimeout)
  - [ ] 5.3.2. Al cumplirse el timeout, el jefe revisa la actividad del agente
  - [ ] 5.3.3. Si el agente se ha desviado, el jefe lo detiene y le da nuevas indicaciones
- [ ] 5.4. El agente "jefe" puede enviar mensajes/indicaciones a los agentes del equipo
- [ ] 5.5. El agente "jefe" puede reiniciar un agente con nuevas instrucciones

## 6. Selector de agentes en el chat
- [x] 6.1. Añadir un selector de agentes debajo del icono de subir imágenes en la zona de escritura del chat
- [x] 6.2. El selector muestra los jefes (team-leads) de cada equipo existente
- [ ] 6.3. Al seleccionar un jefe, los mensajes del usuario se envían a ese agente jefe
- [x] 6.4. Indicador visual de qué agente jefe está seleccionado actualmente

## 7. Sistema de tareas por agente
- [x] 7.1. Cada agente tiene un archivo de tareas asociado (configurable desde el panel)
- [ ] 7.2. El agente puede leer y editar su propio archivo de tareas
- [x] 7.3. Desde el panel se puede ver y editar el archivo de tareas de cada agente
- [ ] 7.4. Las tareas se sincronizan entre el panel y el archivo del agente
