# YouTube Runner — Flujo completo

## Visión general

El runner de YouTube es un pipeline de tareas en grafo dirigido acíclico (DAG) que, dado un URL de video, produce metadatos, transcripción, resúmenes e imágenes. Está compuesto por tres capas:

```
youTubeRunner()
    └─ WorkflowManager          (orquestador de workflows)
           └─ TaskRunnerStore   (scheduler de tareas en grafo)
                  └─ Task[]     (nodos del grafo: script | ia)
```

---

## 1. Punto de entrada — `youTubeRunner()`

**Archivo:** [src/runners/youtube/youTubeRunner.ts](../src/runners/youtube/youTubeRunner.ts)

```
youTubeRunner(url, cachedArticle?, options?)
```

### Pasos que ejecuta

| #   | Acción                                                                                        |
| --- | --------------------------------------------------------------------------------------------- |
| 1   | Construye el `runId` con `buildWorkflowRunId("youtube-video", url)` → `"youtube-video:<url>"` |
| 2   | Decide si es `freshRun` (`Rebuild === true` o no hay tareas persistidas)                      |
| 3   | Llama a `buildTaskSubroutine()` para crear el array de tareas                                 |
| 4   | Pasa las tareas a `workflowManager.run()`                                                     |
| 5   | Al terminar llama a `saveTasks(url, runResult.tasks)` para persistir resultados               |

### Rutinas disponibles

```ts
const routine = {
	videoPage: [THUMBNAIL, VIDEO_INFO, CHAPTERS_SUMMARY, KEYWORDS, KEYPOINTS, SUMMARY],
	videoItem: [THUMBNAIL, VIDEO_INFO, TITLE_SUMMARY]
};
```

La rutina por defecto es `videoPage`.

---

## 2. Construcción del grafo — `buildTaskSubroutine()`

**Archivo:** [src/runners/taskBuilder.ts](../src/runners/taskBuilder.ts)

Recibe los IDs de las tareas seleccionadas y un `taskRegistry`, y devuelve un array de tareas en orden topológico (las dependencias siempre preceden a quien las usa).

### Algoritmo

```
for each taskId in selectedTaskIds:
    visit(taskId)          ← DFS recursivo
        → visita dependencias primero
        → aplica estado persistido del DB (si existe)
        → aplica overrides opcionales
        → si status=="done" y !Rebuild → elimina dependencias (ya no necesita re-ejecutarse)
        → agrega al array ordenado
```

### Registros de tareas

El `youtubeTaskRegistry` agrupa sub-registros:

| Sub-registro          | Tareas que contiene                                             |
| --------------------- | --------------------------------------------------------------- |
| `contextTaskRegistry` | `init`, `thumbnail`, `main-color`                               |
| `crawlTaskRegistry`   | `video-info`, `chapters`, `timed-captions`, `content`           |
| `chapterTaskRegistry` | `chapters-summary` (+ genera `chapter-summary-N` dinámicamente) |
| `summaryTaskRegistry` | `summary`, `title-summary`, `keywords`, `key-points`            |
| `audioTaskRegistry`   | `tts`                                                           |
| `profileTaskRegistry` | `getting-channel-videos`, `extract-channel-videos`              |

---

## 3. Grafo de dependencias — Rutina `videoPage`

```
init
 ├── thumbnail
 ├── video-info
 ├── chapters ────────────────────────────────┐
 └── timed-captions ──── content              │
          │               │                   │
          └───────────────┴─── chapters-summary
                          │        │
                          │        └── chapter-summary-0
                          │                └── chapter-summary-1
                          │                        └── chapter-summary-N
                          │
                          ├── summary
                          ├── keywords
                          └── key-points
```

---

## 4. Orquestador de workflows — `WorkflowManager`

**Archivo:** [src/runners/workflowManager.svelte.ts](../src/runners/workflowManager.svelte.ts)

El `WorkflowManager` mantiene un `Map` de runs indexados por `runId`. Un run puede tener dependencias de otros runs (workflows encadenados).

### `workflowManager.run(id, tasks, options)`

```
1. ¿Ya existe un run con status "running"?
     → Devuelve la promise existente (deduplication)
2. Crea o reutiliza el registro de run (ensureRun)
3. Sincroniza el stack de runs activos (syncRunStack)
4. Configura el runner → setTasks(tasks)
5. Llama executeRun() → devuelve Promise<TaskRunSummary>
```

### `executeRun()`

```
1. Espera dependencias de otros workflows (waitForDependencies)
2. status = "running"
3. Delega al TaskRunnerStore → runner.run()
4. Al terminar:
     - si failed===0 && blocked===0 → status = "done"
     - de lo contrario             → status = "failed"
5. Guarda summary y endedAt
```

---

## 5. Scheduler de tareas — `TaskRunnerStore`

**Archivo:** [src/runners/taskRunner.svelte.ts](../src/runners/taskRunner.svelte.ts)

Es el motor central. Usa estado reactivo Svelte 5 (`$state`).

### `runner.run(options?)`

```
1. Valida tareas (ids únicos, dependencias existentes, sin ciclos)
2. Resetea statuses según Rebuild
3. Entra al executeRunLoop()
```

### `executeRunLoop()` — bucle principal

```
while (true):
  flushQueuedTasks()        ← incorpora tareas encoladas dinámicamente

  if restartRequested:
    resetStatuses({ Rebuild: true })
    continue

  ready = getReadyTasks()   ← pending + todas sus deps en "done"
  if ready.length === 0: break

  # Script tasks → se ejecutan en paralelo (Promise.allSettled)
  readyScripts = ready.filter(type === "script")
  if readyScripts.length > 0:
    await Promise.allSettled(readyScripts.map(executeTask))
    si alguno falla → markDescendantsBlocked(failedId) + break
    continue

  # IA tasks → una a la vez (secuencial)
  nextIa = ready.find(type === "ia")
  await executeTask(nextIa)
  si falla → markDescendantsBlocked(nextIa.id) + break
```

### `executeTask(task)`

```
1. status = "running", startedAt = now
2. if type === "ia"     → runIaTask()
   if type === "script" → runScriptTask()
3. En éxito: status = "done", endedAt = now
   En error:  status = "failed", error = mensaje, endedAt = now
              → relanza el error
```

---

## 6. Ejecución por tipo de tarea

### Script task

```ts
result = await task.run(runtime);
task.data = result;
```

Recibe el `runtime` que expone:

- `state` → snapshot de datos de todas las tareas hasta ese momento
- `update(patch)` → actualiza `data` o `debug` parcialmente
- `enqueueTasks(tasks)` → agrega nuevas tareas al pipeline en caliente
- `getTaskData(id)` → acceso tipado a datos de otra tarea

> Ejemplo: `chapters-summary` usa `enqueueTasks` para inyectar dinámicamente las tareas `chapter-summary-N` una vez obtenidos los capítulos del video.

### IA task

```
1. Ejecuta task.run(runtime) → string de contexto adicional (opcional)
2. Construye messages:
     system: task.systemMessage
     user:   "context: <run_result> <userMessage>"
3. Llama chatCompletions() con stream opcional
     - con stream: tokens escritos en task.data incrementalmente
4. task.data = texto final del assistant
```

---

## 7. TaskRuntime — interfaz del contexto de ejecución

```ts
interface TaskRuntime<TMap, TId> {
	runId: string; // ID del workflow
	taskId: TId; // ID de esta tarea
	state: TaskGlobalState; // datos de TODAS las tareas (snapshot)
	update(patch); // actualiza data/debug de esta tarea
	enqueueTasks(tasks); // añade tareas al pipeline en caliente
	getTaskData(taskId); // acceso tipado a datos de otra tarea
}
```

---

## 8. Ciclo de vida de una tarea

```
pending → running → done
                 ↘ failed → (descendants) blocked
```

- `blocked`: estatus propagado automáticamente a todos los descendientes de una tarea fallida mediante BFS.
- Las tareas `done` con `Rebuild: false` conservan su `data` y sus dependencias se eliminan del grafo (no se re-ejecutan).

---

## 9. Persistencia

Al finalizar el workflow:

```ts
await saveTasks(url, runResult.tasks);
```

Las tareas con `persist: true` (como `content`, `chapters-summary`) guardan su `data` en la base de datos local. En la próxima invocación, `buildTaskSubroutine` restaura el estado con `applyPersistedTaskState()`, permitiendo saltar tareas costosas como la descarga de transcripción.

---

## 10. Flujo completo de extremo a extremo

```
youTubeRunner(url)
│
├─ buildTaskSubroutine()
│    ├─ Visita DFS cada taskId de la rutina
│    ├─ Aplica estado persistido de DB
│    └─ Devuelve Task[] en orden topológico
│
├─ workflowManager.run(runId, tasks)
│    ├─ ensureRun() → crea TaskRunnerStore
│    ├─ setTasks(tasks)
│    └─ executeRun()
│         ├─ waitForDependencies() (otros workflows)
│         └─ runner.run()
│              ├─ validateTasks()  (ids, deps, ciclos)
│              ├─ resetStatuses()
│              └─ executeRunLoop()
│                   ├─ [paralelo]  script tasks listas
│                   ├─ [secuencial] ia tasks listas
│                   ├─ enqueueTasks dinámico (ej: chapter tasks)
│                   └─ markDescendantsBlocked() si hay fallo
│
└─ saveTasks(url, tasks)  → persiste resultados en DB
```
