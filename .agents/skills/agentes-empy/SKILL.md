---
name: agentes-empy
description: Orquestador del escuadrón de agentes de Empy-Bot. Lee automáticamente las tareas y bugs pendientes de Notion, propone triaje (hacer, posponer, debatir, quitar), y coordina la ejecución o deliberación técnica seleccionando automáticamente a los especialistas indicados.
---

# Agentes Empy: Orquestador de Escuadrón & Triaje de Notion

Esta habilidad convierte a Antigravity en la mesa de control del escuadrón de agentes de Empy-Bot. Conecta directamente con la base de datos de Notion, gestiona el backlog y ejecuta tareas de desarrollo, auditoría y debate técnico sin requerir nombres manuales.

---

## Flujo Operativo Obligatorio

### Fase 1: Lectura y Triaje de Notion
Al activarse la habilidad (mediante `/agentes-empy` o solicitud de orquestación):
1. **Consultar Notion**: Ejecutar la lectura de los items en estado "Nuevo" o "En Progreso" desde la base de datos de Notion vinculada en `src/services/notion.service.ts`.
2. **Presentar el Tablero**: Mostrar los tickets encontrados con su tipo (Bug, Sugerencia, Roadmap, Mejora Técnica) y prioridad.
3. **Proponer las 4 Opciones de Acción**:
   - 🚀 **Hacer:** Implementar la solución en el código con el especialista técnico asignado.
   - ⏳ **Posponer:** Dejar la tarea en espera en el backlog sin alterar su estado.
   - 💡 **Pensar / Debatir:** Abrir la mesa de deliberación interna para evaluar pros, contras y arquitectura antes de codificar.
   - 🗑️ **Quitar:** Archivar o marcar como descartado el ticket en Notion.

---

### Fase 2: Enrutamiento Automático de Especialistas
Cuando el usuario indique qué desea hacer (o ingrese una orden libre como investigar, auditar o diseñar), el **Jefe Sid (Orquestador)** selecciona de forma autónoma a los agentes pertinentes:

- **Bugs de WhatsApp, Sockets o DB:** Convoca a **Kevin (Backend)** y **Mateo (SecOps)**.
- **Auditorías de Seguridad, Tokens o DoS:** Convoca a **Mateo (SecOps)** y **Kevin (Dev)**.
- **Interfaces Web, Dashboards o Estilos:** Convoca a **Bruno (Frontend)** y **Verito (Copy)**.
- **Redacción, Facultad o Informes:** Convoca a **Verito (Académica)** y **Nico (Research)**.
- **Stickers, Audio TTS o Videos:** Convoca a **Sofi (Multimedia)** y **Mateo (Auditor de Buffers)**.
- **Sincronización de Backlog o Crons:** Convoca a **Luna (Notion Ops)**.

---

### Fase 3: Ejecución de Alta Fidelidad
1. **Si es una tarea de desarrollo:** Aplicar cambios quirúrgicos en el código (`edit_file`), validar tipos si es necesario y actualizar el estado en Notion a `"En Progreso"` o `"Resuelto"`.
2. **Si es una tarea de debate o investigación:** Realizar la crítica interna previa y entregar **la solución pulida primero**, cerrando con el bloque de **Resumen de la Deliberación** al pie.
