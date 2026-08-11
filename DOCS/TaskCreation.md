# Creación de Tareas

## Flujo general

1. Se define una **definición** (`IaTaskDef` o `ScriptTaskDef`) usando una factory function
2. Se construye un objeto `Task` con `buildTask(def, id)` o `buildRecursiveTask(id, opts)`
3. Se añade al workflow con `workflowManager.addTask(runId, task)`
4. Se ejecuta con `workflowManager.rerunTask(runId, taskId)`

## Tipos de tareas

| Tipo            | Factory                                                 | Subtype      | Qué hace                                                                                                 |
| --------------- | ------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| **IA (custom)** | `createIaTask()`                                        | —            | Tarea genérica: envía system+user message a un modelo y devuelve la respuesta                            |
| **Extraction**  | `createExtractionTask()`                                | `extraction` | Extrae N items (strings) del contenido. Devuelve `string[]`                                              |
| **Category**    | `createCategoryTask()`                                  | `category`   | Subtipo de extraction: clasifica en categorías predefinidas usando grammar GBNF                          |
| **Title**       | `createTitleTask()`                                     | `title`      | Genera un título corto con emoji a partir de un resumen                                                  |
| **Summary**     | `createSummaryTask()`                                   | —            | Resume el contenido de una dependencia                                                                   |
| **Recursive**   | `createRecursiveContentTask()` / `buildRecursiveTask()` | `recursive`  | Divide el contenido en chunks, procesa cada uno con un processor seleccionable, y combina los resultados |

## ChunkProcessors

La tarea recursive usa un sistema de **processors** para procesar chunks. Cada processor define cómo procesar cada chunk y cómo combinar los resultados.

### Processor Types

| Type         | Descripción                                           |
| ------------ | ----------------------------------------------------- |
| `summarize`  | Resume cada chunk y combina los resúmenes             |
| `extraction` | Extrae items de cada chunk y combina los resultados   |
| `translate`  | Traduce cada chunk a un idioma objetivo               |
| `custom`     | USA system message personalizado para procesar chunks |

### Registry

Los processors se registran en `src/runners/shared/processors/index.ts`:

```ts
import { getProcessor, getProcessorTypes } from '@/runners/shared/processors';

// Obtener un processor
const processor = getProcessor('summarize');
const instance = processor.build({ model: 'llama-server' });

// Listar tipos disponibles
const types = getProcessorTypes(); // ['summarize', 'extraction', 'translate', 'custom']
```

### Agregar un nuevo processor

1. Crear archivo en `src/runners/shared/processors/mi-processor.ts`
2. Implementar `ProcessorDef` interface
3. Registrar en `src/runners/shared/processors/index.ts`

```ts
import type { ProcessorDef } from './types';

export const miProcessor: ProcessorDef = {
	type: 'mi-processor',
	defaults: { userMessage: '...' },
	build: (config) => ({
		processChunk: async (chunk, index) => {
			/* ... */
		},
		combineChunks: async (results, rawChunks) => {
			/* ... */
		}
	})
};
```

## EditTaskComponent

El componente `EditTaskComponent.svelte` detecta el tipo de tarea existente y muestra tabs con configuración específica para cada tipo. Crear una nueva tarea desde el editor usa `createIaTask` directamente (tab "custom"). Los tabs extraction/category/recursive usan sus factories correspondientes.

El tab **recursive** muestra un selector de processor type con campos específicos para cada tipo.
