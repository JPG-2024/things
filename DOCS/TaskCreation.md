# Creación de Tareas

## Flujo general

1. Se define una **definición** (`IaTaskDef` o `ScriptTaskDef`) usando una factory function
2. Se construye un objeto `Task` con `buildTask(def, id)` o `buildRecursiveTask(id, opts)`
3. Se añade al workflow con `workflowManager.addTask(runId, task)`
4. Se ejecuta con `workflowManager.rerunTask(runId, taskId)`

## Tipos de tareas

| Tipo | Factory | Subtype | Qué hace |
|---|---|---|---|
| **IA (custom)** | `createIaTask()` | — | Tarea genérica: envía system+user message a un modelo y devuelve la respuesta |
| **Extraction** | `createExtractionTask()` | `extraction` | Extrae N items (strings) del contenido. Devuelve `string[]` |
| **Category** | `createCategoryTask()` | `category` | Subtipo de extraction: clasifica en categorías predefinidas usando grammar GBNF |
| **Title** | `createTitleTask()` | `title` | Genera un título corto con emoji a partir de un resumen |
| **Summary** | `createSummaryTask()` | — | Resume el contenido de una dependencia |
| **Recursive** | `createRecursiveContentTask()` / `buildRecursiveTask()` | `recursive` | Divide el contenido en chunks, procesa cada uno (resumen o extracción), y combina los resultados |

## Diferencias clave

- **IA tasks** usan `chatCompletions` con options del modelo. Son la base de todo.
- **Extraction** agrega `extractorConfig` (count + description) y parsea arrays estructurados del output.
- **Category** es extraction restringida a nombres de categorías válidos, con grammar GBNF para forzar output válido.
- **Recursive** es un `scriptTask` (no IA task): ejecuta lógica custom que procesa chunks secuencialmente con `update()` para streaming de progreso.
- **Title/Summary** son cases simples de IA task con system messages predefinidos.

## EditTaskComponent

El componente `EditTaskComponent.svelte` detecta el tipo de tarea existente y muestra tabs con configuración específica para cada tipo. Crear una nueva tarea desde el editor usa `createIaTask` directamente (tab "custom"). Los tabs extraction/category/recursive usan sus factories correspondientes.
