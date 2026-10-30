# Directrices Locales del Proyecto: Empy-Bot

## Uso de Graphify y Ahorro de Tokens
- **Análisis de Dependencias e Impacto:** Antes de refactorizar o modificar funciones, servicios o comandos interconectados en `src/`, consultar el grafo local mediante `graphify explain <nodo>`, `graphify path <nodoA> <nodoB>` o `graphify query <término>`.
- **Prohibido el escaneo ciego:** No realizar búsquedas recursivas (`grep`, `Get-ChildItem`) ni leer archivos adyacentes completos cuando la relación de dependencias ya esté mapeada en el grafo.
- **Sincronización Automática:** Si se crean, eliminan o renombran módulos en `src/`, ejecutar `graphify . --code-only` para mantener el grafo sincronizado antes de dar por completada la tarea.
