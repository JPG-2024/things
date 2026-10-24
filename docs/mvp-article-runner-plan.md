# Plan — MVP Article Runner (circulación de tareas → scripts por artículo)

Fecha: 2026-10-24 · Scope: frontend SvelteKit/Svelte 5 + Tauri v2 (Rust) · Estado: **plan aprobado, pendiente de implementación**

> Este documento reemplaza la arquitectura de **Task Runner + Workflow Manager + Templates**
> por un pipeline lineal y asíncrono por artículo. Ataca **dos** problemas a la vez:
> la **complejidad** del modelo (13 capas de orquestación para sostener una sola
> analítica) y el **overhead** de abrir un artículo (fetch de red + reconstrucción
> del grafo de tareas en cada visita).
>
> Complementa `docs/perf-analysis.md` y `docs/perf-plan-bottlenecks.md` (que
> describen el estado *anterior* del sistema de tareas) y sustituye
> `DOCS/RunnerDoc.md`, `DOCS/TemplateRunnerAssembly.md`, `DOCS/SchemaDrivenWorkflows.md`,
> `DOCS/TaskCreation.md` y `DOCS/YouTubeRunnerFlow.md`.

---

## 1. Motivación

Hay **dos** problemas independientes, y este plan los ataca a los dos. No son el
mismo problema, y ninguno es subordinado al otro.

### 1.1 Complejidad — el modelo es desproporcionado para lo que hace

La app tiene **una** analítica: resumir el artículo por ventanas. Para sostener
esa única analítica hay hoy **13 capas de orquestación encadenadas**:

```
taskSchema → taskBuilder → taskRunner → DependencyGraph → workflowManager
           → workflowStore → templateStore → templateBuilder → templateRunner
           → sharedTasks → taskFactories → recursiveTask → processors
```

Sobre esa cadena se apilan:

- **Dos vocabularios de estado que se solapan**: `TaskStatus` (7 valores:
  `pending | running | done | failed | blocked | editing | new`) y
  `WorkflowRunStatus` (6 valores: `idle | pending | running | done | failed | blocked`).
  El pipeline lineal necesita **uno** con 5.
- **Dos taxonomías de tipo de tarea**: `TaskType` (`script | ia`) e
  `IaTaskSubtype` (9 valores: `extraction | summary | title | translation |
  categorization | category | generation | custom | recursive`). Con un solo
  processor, **0**.
- **7 processors** (`windowSummary`, `multi`, `analysisTopic`, `summarize`,
  `extraction`, `translate`, `custom`) más 4 parsers, cuando solo se usa uno.
- **3 tablas SQL** que existen solo para el modelo de tareas
  (`web_tasks`, `web_templates`, `web_profile_templates`) + la columna
  `web_articles.template_id`.
- **11 comandos Tauri** de tasks y templates, sobre 79 registrados.

El coste de esa complejidad no es solo el tamaño del código: es que **cada
decisión de producto tiene que atravesar las 13 capas**. Añadir un tipo de task,
cambiar el nivel de análisis o permitir un rerun no es "escribir una función" —
es tocar el DSL, el builder, el scheduler, el grafo, el gestor de workflows, el
store, la capa de templates, los tipos y los 4 comandos de persistencia. Ese es
el coste que hace inviable este repo como base de un MVP.

### 1.2 Overhead — abrir un artículo es caro por construcción

Abrir un artículo ya analizado hoy cuesta, por artículo:

1. **Un fetch de red completo de la página** (`extract_blog`), porque `webRunner`
   construye las tasks iniciales *antes* de aplicar el estado cacheado. El prune
   de `templateRunner` solo evita las llamadas al LLM, **no** el fetch.
2. **Re-construcción de todo el grafo de tareas en memoria**: `TaskRunnerStore` +
   `DependencyGraph` + `WorkflowManager` + `WorkflowStore` + `templateRunner`,
   con su validación de ciclos y su búsqueda de descendientes.
3. **Re-lectura y parse del blob JSON `web_tasks`** para reconstruir el estado.
4. Un modelo de datos (tasks, dependencias, estados, reruns, branches, templates,
   DAG) que sostiene **una sola analítica**: el resumen por ventanas.

### 1.3 Tamaño del recorte

| Métrica | Antes | Después | Δ |
|---|---|---|---|
| Archivos frontend (`src/**`, `.ts` + `.svelte`) | 308 | ~237 | **−71** |
| Líneas de código frontend | 48.602 | ~35.500 | **−13.100 (−27%)** |
| Capas de orquestación | 13 | 1 (el pipeline) | **−12** |
| Vocabularios de estado | 2 (7 + 6 valores) | 1 (5 valores) | **−1 / −8** |
| Taxonomías de tipo de tarea | 2 (2 + 9 valores) | 0 | **−2 / −11** |
| Processors de análisis | 7 + 4 parsers | 1 | **−6 / −4** |
| Comandos Tauri | 79 | 70 | **−9** |
| Tablas SQL | 10 | 7 | **−3** |

Medido sobre el repo en el momento de escribir este plan: **78 archivos**
(62 de la sección 6 + 16 de podcast) y **13.129 líneas** se eliminan; 7 archivos
nuevos (~600 líneas) entran; 37 archivos se reescriben (3 de ellos renombrados:
`TasksRender.svelte` → `ArticleLayout.svelte`, `WindowSummaryComponent.svelte` →
`AnalysisPanel.svelte`, `recursiveTask.ts` → `windowAnalysis.ts`) y se reducen a
un pipeline lineal. **Ninguna feature de usuario se pierde** en el recorte: lo
que sale es todo el machinery de componer tareas, no ninguna capacidad.

---

## 2. Objetivos y no-objetivos

### Objetivos

**Complejidad**
- **Un único pipeline lineal** por artículo: `source → raw → article → analysis → title → category → embeddings`. Cero capas de orquestación intermedias.
- **Una sola forma de persistir el resultado del análisis**: la tabla `article_windows` + `web_articles.summary`. Fuera el blob `web_tasks`, los templates y la noción de "task".
- **Un vocabulario de estado**: `status` + `step` + `progress`.
- **Un knob** (`viewState.windowLevel`), no un modelo de "profundidad de análisis" con rungs, topic counts y keyword counts.
- **Una noción de "perfil"**: se resuelve una vez, se persiste, y la vista lo lee del registro del artículo.

**Rendimiento**
- Abrir un artículo cacheado = **2 lecturas locales de DB, 0 red, 0 LLM**.
- El cuerpo del artículo **nunca** se mantiene en memoria: se reconstruye desde `raw_content/<sha256(url)>.txt` a demanda.
- Cola secuencial de artículos (concurrencia 1) gestionada por un *manager*: una sola analítica en vuelo contra el `llama-server` local.
- El nivel de ventanas se guarda **explícito** (`analysis_divisor`), nunca deducido.
- Cada paso del pipeline comprueba **«¿ya tengo esto?»** antes de gastarlo (D24).

**Alcance**
- El análisis de ventanas (summaries) es la **única** analítica.
- El pipeline tiene **dos modos** (`full` / `metadata`) para distinguir "procesado" de "capturado y pendiente".

### No-objetivos (fuera de esta versión)
- **Templates** (`web_templates`, `web_profile_templates`, `TemplateManager`).
- **Workflows** (`WorkflowManager`, `WorkflowStore`, runs nombrados, pila de runs).
- **TaskRunner** completo (DAG, dependencias, concurrencia, rerun por task, branches).
- **Editores de tareas** (`EditTaskComponent`, `TaskRerunEditor`, `TaskWorkflowEditor`, `CreateTaskForm`).
- **Podcast** (`src/features/podcast/**`) — se refactoriza más adelante.
- **Topics / keywords / multi / analysisTopic / extracción / traducción como tasks.**
- **TTS sobre tareas** (hotkeys `S` / `Shift+S` y `viewState.selectedTaskId`).
- **YouTube social** (TikTok / Instagram).

---

## 3. Decisiones tomadas

| # | Decisión |
|---|----------|
| D1 | Se eliminan workflows, TaskRunner y templates. Se conservan las fuentes **web**, **raw** y **YouTube**. |
| D2 | La vista conserva su layout actual (thumbnail, title, category editor, analysis, content). El slot de análisis se cablea al componente de ventanas. |
| D3 | `currentArticle` tiene campos planos (`title`, `category`) y `analysis` anidado. Lo que depende del análisis se **deriva reactivamente** en cada componente. |
| D4 | El rerun del topbar = artículo fresco (borra, re-fetch source, re-descarga thumbnail, re-analiza). El componente de análisis tiene su **propio** rerun (solo ventanas + title). |
| D5 | La categoría solo se autocalcula si el artículo **no tiene** categorías. Un icono refresh en `CategoryEditor` fuerza el recálculo. |
| D6 | DB: `web_articles.summary` + `web_articles.analysis_divisor` + tabla `article_windows` con `payload` JSON. `web_tasks` se borra **sin migración de datos**. |
| D7 | `web_articles.analysis_divisor` es **nullable**: `NULL` = dividido por cabeceras (web). Ver §6.4. |
| D8 | Un solo knob: `viewState.windowLevel` (índice en `WINDOW_DIVISOR_LADDER`). Vive en `SettingsModal` (sección *Analysis*). |
| D9 | El knob aplica a **raw** y **YouTube**. **Web** divide por cabeceras markdown (sin knob, sin clamp) — igual que hoy. |
| D10 | `viewState.embeddingFields: string[]` (por defecto `['summary']`). Cada campo se embebe en una tabla LanceDB con el **mismo nombre**. |
| D11 | Helper `embedAnalysis(article, fields)`. Se borran el resto de helpers de embeddings innecesarios. |
| D12 | `viewState` = preferencias/flags. `articleStore` = datos y progreso del artículo abierto. |
| D13 | El cuerpo nunca está en el store. Se lee del raw file a demanda (`read_raw_content_by_url`). |
| D14 | Podcast se elimina de esta versión. |
| D15 | Abrir un artículo cacheado **no** re-fetchea el source: reutiliza el raw file y el thumbnail ya descargados. |
| D16 | El runner es un **manager** con cola secuencial (concurrencia 1). `open()` pinta lo cacheado y encola; `refresh()` salta la cola. |
| D17 | Una corrida que termina después de navegar **persiste** en DB, pero solo escribe en el store si la URL sigue coincidiendo. |
| D18 | Del toolbar se quitan el toggle *show all tasks* y el icono de templates. |
| D19 | `web_articles.template_id` → **`web_articles.mode TEXT`** (`'full'` \| `'metadata'`). `mode='metadata'` = artículo capturado y **pendiente de análisis**. El toggle "initial articles" pasa a filtrar por `mode`. |
| D20 | El perfil de YouTube se resuelve en el paso **SOURCE**: primero la fila de `web_profiles` (0 red), si no existe el scraper externo. Se persiste al instante. `scrapStore.currentYoutubeProfile` **desaparece**; la vista lee `article.profile` / `article.profilePictureSrc`. |
| D21 | La ruta `youtube.com/@canal/videos` dispara `scrapStore.fetchMissingProfileVideos` → encola en modo `metadata`. `profileVideosRunner` se elimina y `ProfileWidget.handleRefresh` llama al mismo sitio (arregla un botón hoy roto). |
| D22 | `mode='metadata'` captura la **tarjeta** (título, thumbnail, dominio, perfil) + el cuerpo **solo si la fuente ya lo tenía gratis**: web y raw sí, YouTube no (el transcript es una petición aparte y cara). |
| D23 | `viewState.captureOnlyOnPaste: boolean` (por defecto `false`) en el toolbar del dashboard. Activo + en la ruta `/` + URL http(s) → **no navegar**: encola en modo `metadata`, corre en background e invalida el `articleCacheStore` al terminar. Texto raw y el resto de rutas conservan el comportamiento actual. |
| D24 | Cada paso del pipeline comprueba **«¿ya tengo esto?»** antes de gastarlo: raw file → no re-fetch; thumbnail → no re-descargar; análisis existente → no re-analizar. |
| D25 | Abrir un artículo con `mode='metadata'` **encola el run completo**: el artículo queda pendiente y se completa solo. No contradice D15 (que aplica a artículos ya analizados). |

---

## 4. Arquitectura objetivo

### 4.1 Pipeline por artículo

```
articleManager.open(url)
  ├─ (cache) SELECT web_articles + article_windows  →  pinta currentArticle   [0 red, 0 LLM]
  └─ (mode='metadata' o sin análisis) encola en la cola
        │
        ▼  articleRunner.run(url, { mode: 'full' | 'metadata' })
  1. SOURCE     fetch de texto + thumbnail (en paralelo)
                 · ¿ya existe el raw file?      → no re-fetchear          [D24]
                 · ¿ya existe el thumbnail?      → no re-descargar         [D24]
                 · web   → invoke('extract_blog') → compactMarkdown  (markdown gratis)
                 · yt    → invoke('get_youtube_transcript_timed') → captions unidos
                          (solo en 'full'; el transcript es una petición aparte y cara)
                 · raw   → texto ya en memoria
                 · perfil YouTube  → ¿article.profile ya existe?  → leer web_profiles (0 red)
                                    si no → scraper externo → persistir
                                            web_profiles + web_articles.profile   [D20]
  2. RAW        write_raw_content(url, text) → raw_content/<sha256(url)>.txt
                 (solo si la fuente lo dio gratis)                                [D22]
  3. ARTICLE    upsert web_articles (thumbnail, domain, profile, media dir, color,
                 date, mode)                                                      [D19]
  4. ANALYSIS   [solo 'full']  split en WINDOW_DIVISOR_LADDER[windowLevel] ventanas
                → 1 llamada LLM por ventana
                → 1 llamada LLM de combine final
                → guarda article_windows + web_articles.summary + analysis_divisor
                (si el contexto desborda → sube por WINDOW_DIVISOR_LADDER; el nivel
                 ejecutado se guarda en analysis_divisor)
  5. TITLE      [solo 'full']  1 llamada LLM sembrada con summary → web_articles.title
  6. CATEGORY   [solo 'full']  embed("title + summary") → NN vs category_exemplars
                → article_category  (solo si el artículo no tiene categorías)    [D5]
  7. EMBED      [solo 'full' y si viewState.embeddingsEnabled]
                embedAnalysis(article, viewState.embeddingFields)
```

Los pasos 4→5→6 son **estrictamente secuenciales** (dependencia real de datos).
El paso 1 es paralelo internamente (texto y thumbnail son I/O de red).

### 4.2 El manager (`src/runners/articleManager.svelte.ts`)

```ts
class ArticleManager {
    queue  = $state<string[]>([]);
    active = $state<{ url: string; step: string; done: number; total: number } | null>(null);

    open(url: string, options?: { mode?: 'full' | 'metadata' }): Promise<void>
    refresh(url: string): void            // destructive: frente de la cola, force: true
    enqueue(url: string, options?: { mode?: 'full' | 'metadata' }): void
    private async drain(): Promise<void>  // un artículo a la vez
}
```

- **Concurrencia 1**: el `llama-server` es local y de un solo hilo; paralelizar
  solo destroza su cache de contexto y duplica el pico de memoria.
- `open()` carga el artículo cacheado y lo pinta **de inmediato**; solo encola si
  le falta el análisis (D25).
- Reemplaza a `viewState.urlQueue` + `pasteUrl.processQueue` (una sola noción de cola).
- Es dueño del guard de D17 (una corrida solo escribe en el store si su URL sigue vigente).

### 4.3 El store (`src/stores/articleStore.svelte.ts`)

```ts
interface ArticleWindow {
    index: number;          // 0-based
    start: number;          // offset de caracteres en el cuerpo crudo
    end: number;
    data: WindowPayload;    // { summary: string; [key: string]: unknown }
}

interface ArticleAnalysis {
    windows: ArticleWindow[];
    summary: string;        // resumen combinado
    divisor: number | null; // nivel ejecutado; null = dividido por cabeceras
}

interface CurrentArticle {
    url: string;
    status: 'idle' | 'loading' | 'running' | 'done' | 'error';
    step: string | null;    // 'source' | 'analysis' | 'title' | 'category' | ...
    progress: { done: number; total: number } | null;
    title: string | null;
    categories: string[];
    analysis: ArticleAnalysis | null;
    error: string | null;
}

export const articleState = new ArticleState();  // articleState.currentArticle
```

- **Sin** campo `content`: el cuerpo se lee del raw file a demanda.
- `title` / `categories` son **hermanos** de `analysis` (no hijos): son
  propiedades del artículo, no partes del análisis.

### 4.4 Esquema de base de datos

```sql
-- web_articles: dos columnas nuevas
ALTER TABLE web_articles ADD COLUMN summary TEXT;
ALTER TABLE web_articles ADD COLUMN analysis_divisor INTEGER;   -- NULL = por cabeceras
ALTER TABLE web_articles ADD COLUMN mode TEXT;                  -- 'full' | 'metadata'

-- tabla nueva
CREATE TABLE IF NOT EXISTS article_windows (
    id TEXT PRIMARY KEY,
    article_url TEXT NOT NULL,
    window_index INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    payload TEXT NOT NULL,        -- JSON: { "summary": "...", "topics": [...] }
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(article_url, window_index)
);
CREATE INDEX IF NOT EXISTS idx_article_windows_article_url ON article_windows(article_url);
```

`payload` es un **objeto con claves** para que `embedAnalysis` pueda elegir
campos (`summary`, `topics`, …) sin cambios de esquema. Es la ranura de
extensión para futuras analíticas: añadir `topics` es **una clave más**, no un
`ALTER TABLE`.

`mode` reemplaza a `web_articles.template_id` (D19). `mode='metadata'` significa
"capturado, pendiente de análisis"; el filtro del toggle "initial articles" pasa
de `template_id = 'initial'` a `mode = 'metadata'`. Es una **columna explícita** y
no una deducción ("no tiene ventanas") por dos razones: la query de lista es hot
(un `NOT EXISTS` correlacionado por fila no es gratis) y la deducción confunde
"aún sin analizar" con "el análisis falló".

Se **eliminan** las tablas `web_tasks`, `web_templates` y `web_profile_templates`
(sin migración de datos — D6). También se elimina la columna
`web_articles.template_id` y los filtros `template_id` / `include_initial` de
`list_articles_without_profile`.

### 4.5 Embeddings

```ts
// src/lib/utils/embeddingAnalysis.ts
export async function embedAnalysis(
    article: { url: string; windows: ArticleWindow[]; categories?: string[] },
    fields: string[] = viewState.embeddingFields
): Promise<void>
```

- Por cada campo: se recogen sus valores en todas las ventanas (`summary` → 1
  valor/ventana; una clave tipo lista → N valores/ventana), se embeben en **una
  sola llamada por campo** y se indexan en la tabla LanceDB **con el mismo nombre
  que el campo**.
- Las filas de LanceDB conservan `article_url`, `start_offset`, `end_offset`
  (y `chunk_text` si `viewState.embeddingStoreChunkText`).
- La tabla por defecto es `summary` (nombre fijo, constante) → **los vectores
  existentes siguen siendo direccionables** y no hay que reindexar.

### 4.6 El toggle de captura del dashboard (D23)

`routes/+page.svelte` → `toolbar-actions`, junto a los toggles existentes:

```svelte
<button type="button" class="settings-trigger" aria-label="Toggle capture only on paste">
	<ToggleIcon
		name="File"
		bind:checked={viewState.captureOnlyOnPaste}
		tooltipProps={{ content: 'capture only (no analysis)' }}
	/>
</button>
```

- **Activo** + ruta actual `/` (dashboard) + contenido http(s) →
  `handlePasteUrl` **no navega**: encola la URL en el manager con
  `mode: 'metadata'`, corre en background y, al terminar, llama
  `articleCacheStore.invalidate()` para que el `ArticleList` refleje el artículo
  nuevo.
- **Activo** pero la ruta no es `/`, o el contenido es texto raw → comportamiento
  actual (navegar + `full`).
- **Inactivo** (por defecto) → comportamiento actual: navegar al postview y
  procesar allí.

El flag es una **preferencia de comportamiento** → se persiste en `settingsStore`
(como `autoSpeechEnabled` / `embeddingsEnabled`), a diferencia de
`showOnlyRawArticles` / `showOnlyImportedArticles`, que son filtros de vista.

---

## 5. Archivos a AGREGAR

| Ruta | Utilidad |
|------|----------|
| `src/types/articleAnalysis.types.ts` | Tipos de dominio: `ArticleWindow`, `WindowPayload`, `ArticleAnalysis`, `ArticleSource`, `ArticleMode`. Sustituye a `taskRunner.types.ts`. |
| `src/stores/articleStore.svelte.ts` | Estado runes del artículo abierto (`currentArticle`): status, paso, progreso, title, categories, analysis, error. Sin preferencias. |
| `src/runners/articleManager.svelte.ts` | Cola secuencial de artículos. `open()` / `refresh()` / `enqueue()` / `drain()`. Un artículo a la vez. |
| `src/runners/articleRunner.ts` | Pipeline lineal: source → raw → article → analysis → title → category → embeddings. Es el único orquestador. |
| `src/runners/articleSources.ts` | Los tres extractores (`web`, `youtube`, `raw`). Cada uno devuelve `{ text, thumbnail, domain, profile, date, ... }`. Reemplaza a los 4 runners por fuente. |
| `src/lib/utils/embeddingAnalysis.ts` | `embedAnalysis(article, fields)`: itera ventanas, embebe por clave, indexa en LanceDB. |
| `src/lib/utils/rawContent.ts` | Lectura del raw file a demanda: `readRawContent(url)`, `readRawWindow(url, start, end)`. Sustituye a la envoltura de refs `__rawContentRef__`. |

> `src/lib/utils/windowAnalysis.ts` **no** es un archivo nuevo: es el nombre nuevo de
> `src/runners/shared/recursiveTask.ts` (ver §7). Igual que `ArticleLayout.svelte`
> ← `TasksRender.svelte` y `AnalysisPanel.svelte` ← `WindowSummaryComponent.svelte`.

---

## 6. Archivos a ELIMINAR

### 6.1 Orquestación de tareas (el núcleo que desaparece)

| Ruta | Por qué |
|------|---------|
| `src/runners/taskRunner.svelte.ts` | El scheduler DAG (690 líneas): grafo, cola, grupos de concurrencia, `run`/`rerunTask`. |
| `src/runners/DependencyGraph.ts` | Grafo de dependencias (`forward`/`reverse`, ciclos, descendientes). |
| `src/runners/workflowManager.svelte.ts` | Runs nombrados, pila de runs, dependencias entre runs, foco. |
| `src/stores/workflowStore.svelte.ts` | `SvelteMap` de runs + estado derivado (`stackedTasks`, `focusedRunTasks`). |
| `src/runners/templateRunner.ts` | Merge de templates + prune de tasks + aplicación de estado cacheado. |
| `src/runners/templateBuilder.ts` | Construcción de tasks a partir de una definición de template. |
| `src/runners/templateConstants.ts` | Constantes de templates (`DEFAULT_TEMPLATE_ID`, `INITIAL_TEMPLATE_ID`). |
| `src/runners/taskBuilder.ts` | Mapeo entre estado persistido de tasks y `Task`. |
| `src/runners/taskSchema.ts` | DSL de tasks: `script`/`ia`, `Resolvable`, `TaskDefCtx`, `runtime`. |
| `src/types/taskRunner.types.ts` | Tipos `Task`, `IaTask`, `ScriptTask`, `TaskRuntime`, `WorkflowRun*`. |
| `src/types/template.types.ts` | Tipos de template. |
| `src/stores/templateStore.ts` | CRUD de templates vía Tauri. |
| `src/lib/utils/tasks/taskStats.ts` | Stats y formato de tasks (solo los editores los usaban). |
| `src/lib/utils/tasks/topologicalSortTasks.ts` | Orden topológico (solo lo usaba `TaskWorkflowEditor`). |

### 6.2 Runners por fuente

| Ruta | Por qué |
|------|---------|
| `src/runners/web/webRunner.ts` | Sustituido por `articleRunner` + `articleSources`. |
| `src/runners/youtube/youTubeRunner.ts` | Ídem. |
| `src/runners/raw/rawRunner.ts` | Ídem. |
| `src/runners/socialMedia/socialMediaRunner.ts` | TikTok / Instagram: fuera de alcance (D1). |
| `src/runners/youtube/profileVideosRunner.ts` | Era un stub inerte (creaba una task y guardaba un blob; no scrapeaba nada). **Se reemplaza** por la ruta `youtube.com/@canal/videos` → `scrapStore.fetchMissingProfileVideos` (D21). |
| `src/runners/youtube/tasks/youtubeTasks.shared.ts` | Enum `TaskNames` + contextos de tasks. |
| `src/runners/youtube/tasks/youtubeTasks.ts` | Barrel vacío, nunca importado. |

### 6.3 Processors (solo sobreviven los summaries)

| Ruta | Por qué |
|------|---------|
| `src/runners/shared/processors/multi.ts` | Keywords + topics. |
| `src/runners/shared/processors/multiParse.ts` (+ `.test.ts`) | Parser de `multi`. |
| `src/runners/shared/processors/analysisTopic.ts` | Topics por ventana. |
| `src/runners/shared/processors/analysisTopicSplit.ts` | Sub-divisionado de topics. |
| `src/runners/shared/processors/analysisTopicSplitParse.ts` (+ `.test.ts`) | Parser del split. |
| `src/runners/shared/processors/analysisParse.ts` (+ `.test.ts`) | Parser de analysis. |
| `src/runners/shared/processors/extraction.ts` | Extracción de keywords. |
| `src/runners/shared/processors/translate.ts` | Traducción como task. |
| `src/runners/shared/processors/custom.ts` | Tasks personalizadas (requiere editor de tasks). |
| `src/runners/shared/processors/summarize.ts` | Processor de resumen plano, no usado por el pipeline. |
| `src/runners/shared/processors/combineHelpers.ts` | Helpers de combine de `multi`. |

### 6.4 Editores de tasks y vista de tasks

| Ruta | Por qué |
|------|---------|
| `src/components/Tasks/EditTaskComponent.svelte` | Editor de tasks (D2). |
| `src/components/Tasks/TaskRerunEditor.svelte` | Rerun con parámetros por task. |
| `src/components/Tasks/TaskWorkflowEditor.svelte` | Editor de workflows. |
| `src/components/Tasks/CreateTaskForm.svelte` | Alta de tasks. |
| `src/components/Tasks/baseTaskComponent.svelte` | Wrapper con botones de edición/rerun/delete. |
| `src/components/Tasks/TasksStatusBar.svelte` | Píldoras de estado por task → se reemplaza por una línea de progreso. |
| `src/components/Tasks/LoadingTask.svelte` | Píldora de carga por task. |
| `src/components/Tasks/RecursiveTaskComponent.svelte` | Vista de tasks recursivas genéricas. |
| `src/components/Tasks/MultiAnalysisTaskComponent.svelte` | Vista de `multi`. |
| `src/components/Tasks/AnalysisTopicComponent.svelte` | Vista de `analysisTopic`. |
| `src/components/Tasks/ProfileTaskComponent.svelte` | Vista de task de perfil. |
| `src/components/Tasks/markdownTaskComponent.svelte` | Vista markdown genérica. |
| `src/components/Tasks/TaskTitleComponent.svelte` | Vista de task de title. |
| `src/components/Tasks/taskRenderRegistry.ts` | Registro `nombre → componente`; con un solo análisis el layout es fijo. |
| `src/components/TemplateManager.svelte` | Gestión de templates (fuera de alcance). |

### 6.5 Podcast

`src/features/podcast/**` — 16 archivos (`podcastStore.svelte.ts`, `PodcastMode.svelte`,
`PodcastMini.svelte`, `PodcastSettings.svelte`, `topicExtractor.ts`, `scriptGenerator.ts`,
`summaryGenerator.ts`, `hookGenerator.ts`, `prompts/*`, `types.ts`, `host-personas.md`,
`podcast-flow.md`). Depende de `workflowStore.stackedTasks` y de los topics del análisis.

### 6.6 Embeddings, prompts y código muerto

| Ruta | Por qué |
|------|---------|
| `src/lib/utils/embeddingTasks.ts` | `generateEmbeddingsFromTasks`, `collectEmbeddableItems`, `extractQueryChunks`, `extractCategoryFromTasks` → los reemplaza `embedAnalysis`. |
| `src/lib/utils/inference/prompts/analysisTopic.ts` | Prompt de topics. |
| `src/lib/utils/inference/prompts/multi.ts` (+ `.test.ts`) | Prompt multi. |
| `src/lib/utils/inference/prompts/custom.ts` | Prompt de task personalizada. |
| `src/lib/utils/inference/prompts/translate.ts` | `translation.ts` (TTS) construye su propio system message; este archivo solo lo usaba el processor. |
| `src/lib/utils/inference/prompts/emoji.ts` | Solo lo usaba la task de emojis (muerta). `EmojiString` (el componente) sobrevive: se usa en categorías y entidades. |
| `src/lib/utils/inference/prompts/extraction.ts` | Solo extracción. |
| `src/lib/utils/inference/extraction-helper.ts` | Solo extracción. |
| `src/lib/utils/inference/index.ts` | Barrel sin ningún import (verificado). Sus exports (`iaCategorizer`, `inferenceTitle`, `extractionHelper`) quedan huérfanos. |
| `src/lib/utils/inference/helpers/categorizer.ts` | Solo alcanzable desde el barrel muerto. |
| `src/lib/utils/inference/helpers/inferenceTitle.ts` | Ídem. |
| `src/runners/shared/analysisConstants.ts` (+ `.test.ts`) | `ANALYSIS_DEPTH_LEVELS`, `nearestAnalysisDepth`, `effectiveAnalysisDepth` → reemplazados por el knob único. |
| `src/runners/shared/sharedTasks.ts` | `createDefaultTasks` + `generateEmojiForText` → reemplazados por el pipeline. |
| `src/types/article.types.ts` | Interfaz `Article` sin ningún import. |
| `src/components/ArticleItem/ArticleTopics.svelte` | Píldoras de topics en las cards: **código muerto** (las listas nunca hidratan `persistedTasks`, así que nunca se renderizaron). |

> `scrapStore.svelte.ts` **no se elimina**: conserva `fetchMissingProfileVideos`,
> `getYoutubeProfile`, `getYoutubeVideoInfo` y `getProfileInfoFromVideo`. Solo
> desaparece el campo `currentYoutubeProfile` (D20).

---

## 7. Archivos a REESCRIBIR

| Ruta | Cambio |
|------|--------|
| `src/stores/webStore.ts` | Quitar la capa de tasks (`saveTasks`, `toStoredTask`, `mergeStoredTasks`, `getStoredTaskData`, `parsePersistedTaskStates`, `wrapRawContentRef`, `buildUpsertInput` basado en tasks). Añadir `saveArticleAnalysis()` / `getArticleAnalysis()` / `getArticleWindows()`. `upsert` de artículo pasa a tomar campos sueltos. |
| `src/lib/urlRouter/urlRouter.ts` | Delega en `articleManager.open()`. Detección de fuente → `web` / `youtube` / `raw` / `youtubeChannel`. Sin `workflowManager.clearStack()`. La ruta `youtube.com/@canal/videos` → `scrapStore.fetchMissingProfileVideos(handle)` (D21). |
| `src/lib/utils/pasteUrl.ts` | Encola en `articleManager` en vez de su propia cola (`viewState.urlQueue` + `processQueue` desaparecen). Rama de captura en background cuando `viewState.captureOnlyOnPaste` + ruta `/` + URL http(s) (D23). |
| `src/lib/utils/clipboard.ts` | Igual que `pasteUrl.ts`: la rama de background vive en `handlePasteUrl`, que es el único punto de entrada. |
| `src/stores/scrapStore.svelte.ts` | Eliminar el campo `currentYoutubeProfile` (D20). `fetchMissingProfileVideos` → `articleManager.enqueue(url, { mode: 'metadata' })` en vez de `urlRouter` + `skipTaskIds` + `templateId: 'initial'` (D21, D22). |
| `src/components/PostView.svelte` | Toolbar sin el toggle *show all tasks* ni el icono de templates (D18). Lee de `articleStore`. |
| `src/components/Tasks/TasksRender.svelte` → `src/components/ArticleLayout.svelte` | **Layout fijo**: header (thumbnail + title + category editor) → panel de análisis → content. Sin bucle genérico sobre tasks, sin `taskRenderRegistry`. El `ProfileThumb` usa `article.profilePictureSrc` y el enlace "ir al perfil" usa `article.profileId` (D20). |
| `src/components/Tasks/WindowSummaryComponent.svelte` → `src/components/AnalysisPanel.svelte` | Lista de ventanas + slider de nivel + botón de rerun (solo ventanas + title) + modal de texto crudo (lee el raw file a demanda). |
| `src/components/AskComponent.svelte` | Deja de usar `task.data`: pide el cuerpo al raw file bajo demanda y lo usa como contexto del LLM. |
| `src/components/CategoryEditor.svelte` | Lee/escribe `article_category` + el estado del store. Nuevo **icono refresh** para forzar el recálculo (D5). |
| `src/components/Tasks/SimilarEmbeddingsComponent.svelte` | Recibe `windows` + `field` en vez de un `Task`. |
| `src/components/ProfileWidget.svelte` | `handleRefresh` → `scrapStore.fetchMissingProfileVideos(profileId)` (D21, arregla el botón hoy roto, que solo borraba la fila del canal y guardaba un blob inútil). El estado "corriendo" pasa a ser el de la cola del manager. |
| `src/components/ArticleItem/ArticleItem.svelte` | Borrar las derivaciones muertas de `categories` y `someTopics`. |
| `src/components/InitialArticlesToggle.svelte` | El flag pasa de `showOnlyInitialArticles` a `showOnlyImportedArticles` y filtra por `mode = 'metadata'` (D19). El tooltip deja de hablar de "initial" (vocabulario de template). |
| `src/routes/+page.svelte` | Añadir el toggle de captura (D23, §4.6). |
| `src/routes/+layout.svelte` | Quitar `TaskWorkflowEditor` y el hotkey `Shift+S`. |
| `src/routes/raw/[id]/+page.svelte` | Usa `ArticleLayout`. |
| `src/routes/youtube/[url]/+page.svelte` | Usa `ArticleLayout`. |
| `src/stores/viewStore.svelte.ts` | Fuera: `analysisKind`, `analysisDepth`, `selectedTaskId`, `showAllTasks`, `embeddingTable`, `embeddingField`, `urlQueue`, `maxUrlQueueSize`. Dentro: `windowLevel`, `embeddingFields`, `captureOnlyOnPaste`. `showOnlyInitialArticles` → `showOnlyImportedArticles`. |
| `src/stores/settingsStore.svelte.ts` | Persistir `windowLevel`, `embeddingFields` y `captureOnlyOnPaste`. |
| `src/components/modals/SettingsModal.svelte` | Sección *Analysis*: solo el nivel de ventanas (`windowLevel`). Sección *Embeddings*: solo `embeddingFields` (array de strings) + `embeddingStoreChunkText`. |
| `src/lib/utils/categoryText.ts` | Quitar el fallback `topics + keywords`. `buildCategoryText` pasa a consumir `summary` + `title`. |
| `src/lib/utils/categoryEmbeddings.ts` | `classifyByEmbedding(windows, { title, summary })` en vez de `taskData`. |
| `src/lib/utils/embeddingSearch.ts` | Quitar `taskEmbeddingTable`. Conservar `mergeSearchResults`. |
| `src/lib/utils/inference/profileSummary.ts` | Leer `article.title` + `article.summary` en vez de `persistedTasks`. |
| `src/lib/utils/tts.ts` | Dejaba de leer `persistedTasks['title-summary']`; usar `article.summary`. |
| `src/lib/utils/helpers/tasks.ts` | Slim: solo lo que quede en uso (p. ej. extracción de texto desde un payload). |
| `src/runners/shared/recursiveTask.ts` → `src/lib/utils/windowAnalysis.ts` | **Adelgazar**: un solo processor (window summary), sin `Task`, sin `componentProps`, sin `embeddings`/`embedField`, sin `visible`/`gridSpan`/`renderOrder`. Conserva: split, `WINDOW_DIVISOR_LADDER`, overlap, clamp por contexto (`contextSizeError`), `reconstructChunks`. |
| `src/runners/shared/taskFactories.ts` | Reescribir: solo los pasos `title` y `category` (no como `Task`, sino como funciones del pipeline). |
| `src/runners/shared/processors/types.ts` | Solo el contrato de `windowSummary`. |
| `src/runners/shared/processors/index.ts` | Registro de un solo processor. |
| `src/runners/shared/processors/windowSummary.ts` | Slim: sin `viewState` por imported, sin `combineMode` genérico. |
| `src/lib/utils/inference/constants.ts` | Quitar `MULTI_FIELD_COMPLETION_OPTIONS`, `DEFAULT_EMOJI_COMPLETION_OPTIONS` y las opciones de completions sin uso. |
| `src/lib/utils/inference/prompts/index.ts` | Actualizar el barrel. |

---

## 8. Cambios en Rust (`src-tauri/src/`)

### 8.1 `web_store.rs`

**Nuevo DDL** (en `init_schema`):

```sql
ALTER TABLE web_articles ADD COLUMN summary TEXT;
ALTER TABLE web_articles ADD COLUMN analysis_divisor INTEGER;
ALTER TABLE web_articles ADD COLUMN mode TEXT;

CREATE TABLE IF NOT EXISTS article_windows (
    id TEXT PRIMARY KEY,
    article_url TEXT NOT NULL,
    window_index INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(article_url, window_index)
);
CREATE INDEX IF NOT EXISTS idx_article_windows_article_url ON article_windows(article_url);
```

Usar el helper existente `ensure_column(conn, table, column, ddl)` para las tres columnas.

**Borrado de tablas** (sin migración de datos, D6): `web_tasks`, `web_templates`,
`web_profile_templates`. Como el `DROP TABLE` no es idempotente por sí solo,
envolverlo con el chequeo `table_has_column` / `sqlite_master` o hacerlo dentro de
una migración versionada con `PRAGMA user_version`.

**Comandos nuevos**:

| Comando | Firma | Nota |
|---------|-------|------|
| `get_article_analysis` | `(app, url) -> Option<ArticleAnalysisRecord>` | `summary` + `analysis_divisor` + `windows[]` en una sola llamada. |
| `save_article_analysis` | `(app, input: SaveArticleAnalysisInput) -> ()` | Una transacción: `DELETE FROM article_windows WHERE article_url = ?` + inserts + `UPDATE web_articles SET summary = ?, analysis_divisor = ?, mode = 'full'`. |

`SaveArticleAnalysisInput`:
```rust
pub struct SaveArticleAnalysisInput {
    pub url: String,
    pub summary: Option<String>,
    pub divisor: Option<i64>,
    pub windows: Vec<ArticleWindowInput>,
}
pub struct ArticleWindowInput {
    pub window_index: i64,
    pub start_offset: i64,
    pub end_offset: i64,
    pub payload: String,   // JSON
}
```

**Comandos a eliminar**:
`upsert_web_store_tasks`, `get_web_store_tasks_by_url`, `get_web_store_task_chunks`,
`update_web_store_task_data`, `list_web_store_templates`, `get_web_store_template`,
`upsert_web_store_template`, `delete_web_store_template`, `get_web_profile_template`,
`upsert_web_profile_template`, `delete_web_profile_template`.

**Limpieza adicional**:
- `delete_bucket_rows` deja de borrar filas de `web_tasks` y pasa a borrar `article_windows`.
- `list_articles_without_profile`: fuera los parámetros `template_id` e `include_initial`; el filtro de "initial articles" pasa a ser `mode = 'metadata'` (D19).
- `WebStoreArticleRecord`: fuera `template_id`; dentro `summary`, `analysis_divisor` y `mode`.
- `ARTICLE_COLUMNS` / `ARTICLE_LIST_COLUMNS`: `summary` va en el set de detalle (no en el de lista, para no arrastrar el blob en cada fila). `mode` va en **ambos** (el filtro del toggle lo necesita en la lista).
- `web_articles.content` queda sin uso (el `upsert` nunca lo escribe) → se puede dejar como está o dropearse en la misma migración.

### 8.2 `lib.rs`
Actualizar el `tauri::generate_handler![...]`: quitar los 11 comandos de tasks/templates y registrar los 2 nuevos.

### 8.3 Tests
- `web_store::tests`: añadir test de round-trip de `save_article_analysis` / `get_article_analysis` (incluye que un segundo guardado **reemplaza** las ventanas).
- Test del filtro por `mode` en `list_articles_without_profile` (equivalente al de `template_id`).
- Borrar / reescribir los tests que dependan de `web_tasks` o de templates.

---

## 9. Fases de implementación

Orden **aditivo → cambio → borrado**: en cada fase el repo compila y la app arranca.

| Fase | Contenido | Verificación |
|------|-----------|-------------|
| **F1 — DB** | DDL nuevo (`summary`, `analysis_divisor`, `mode`, `article_windows`), comandos Rust nuevos, `ArticleWindowRecord` / `ArticleAnalysisRecord`, tests de round-trip. **No se borra nada todavía.** | `cargo test --manifest-path src-tauri/Cargo.toml` |
| **F2 — Núcleo de análisis** | `src/types/articleAnalysis.types.ts`, `src/lib/utils/windowAnalysis.ts` (split + LLM + combine + clamp), `src/lib/utils/rawContent.ts`. | `bunx svelte-check --tsconfig ./tsconfig.json src/lib/utils/windowAnalysis.ts` + `bun run test` |
| **F3 — Estado y orquestación** | `src/stores/articleStore.svelte.ts`, `src/runners/articleManager.svelte.ts`, `src/runners/articleRunner.ts`, `src/runners/articleSources.ts` (incl. la resolución de perfil de YouTube, D20, y los modos `full`/`metadata`, D22). Reescritura de `webStore.ts` y de `scrapStore.ts`. | `bun run check` |
| **F4 — Vistas** | `ArticleLayout.svelte`, `AnalysisPanel.svelte`, `AskComponent`, `CategoryEditor`, `PostView`, `ArticleItem`, `InitialArticlesToggle`, rutas `raw/[id]` y `youtube/[url]`. | `bun run check` + smoke manual: abrir artículo cacheado (0 red), abrir artículo nuevo, mover el slider, rerun del topbar. |
| **F5 — Embeddings** | `embedAnalysis`, `viewState.embeddingFields`, sección *Embeddings* de `SettingsModal`, limpieza de `embeddingTasks.ts` / `embeddingSearch.ts` / `categoryText.ts` / `categoryEmbeddings.ts`. | Smoke: indexar y buscar; `chatSearchTables` sigue apuntando a `summary`. |
| **F6 — Ajustes y captura** | `SettingsModal` sección *Analysis* (nivel), `settingsStore` (persistencia de `windowLevel` / `embeddingFields` / `captureOnlyOnPaste`), `viewStore` (limpieza de flags), toggle de captura en `routes/+page.svelte` + rama de background en `handlePasteUrl` (D23), `ProfileWidget.handleRefresh` → `fetchMissingProfileVideos` (D21). | Smoke: activar el toggle, pegar una URL en el dashboard → no navega, la card aparece en la lista; el refresh de la card de perfil descarga vídeos. |
| **F7 — Borrado** | Eliminar todo §6 (frontend + Rust). Actualizar `lib.rs`, `web_store.rs`, `DEAD_CODE.md`, `DOCS/`. | `bun run lint`, `bun run check`, `cargo test`, `bun run build` |

---

## 10. Verificación global

```bash
bun run check                                   # svelte-check
bun run lint                                    # prettier + eslint
bun run test                                    # bun test
bun run build                                   # build del frontend
cargo test --manifest-path src-tauri/Cargo.toml # tests Rust
```

**Smoke manual mínimo**:
1. Abrir un artículo ya analizado → **0 peticiones de red** (verificable en la pestaña Network) y se ve el análisis al instante.
2. Abrir un artículo nuevo → se ve la barra de progreso y las ventanas apareciendo.
3. Mover el slider de nivel (raw / YouTube) → rerun solo del análisis; el título se regenera; la categoría **no** se sobrescribe.
4. Botón refresh del `CategoryEditor` → recalcula y reemplaza las categorías.
5. Refresh del topbar → borra y re-procesa el artículo completo (red + thumbnail + análisis).
6. Pegar varias URLs → se procesan **en secuencia**, una detrás de otra.
7. Navegar away durante un análisis → al volver, el artículo está analizado; la vista actual no se contamina.
8. **Toggle de captura activo** + pegar una URL en el dashboard → **no navega**; la card aparece en el `ArticleList` al terminar la captura; al abrir ese artículo → se dispara el análisis completo.
9. **Toggle "imported articles"** → solo muestra los artículos con `mode='metadata'`.
10. Pegar `youtube.com/@canal/videos` → scrapea el canal y encola sus vídeos en modo `metadata`; el refresh de la card de perfil hace lo mismo.
11. Abrir un vídeo de YouTube → el `ProfileThumb` del header muestra la imagen del canal **sin** una llamada extra al scraper.

---

## 11. Riesgos y puntos abiertos

| Riesgo | Mitigación |
|--------|------------|
| `splitByLevels` produce `N` o `N-1` ventanas (§ Discovery 2) | El nivel ejecutado se guarda explícito en `analysis_divisor`; nunca se deduce de `windows.length`. |
| El nivel **pedido** y el **ejecutado** difieren cuando salta el clamp | La UI muestra siempre el ejecutado (`analysis_divisor`); el clamp queda registrado en el log de la corrida. |
| La web sigue dividiendo por cabeceras y **no** tiene knob ni clamp | Es el comportamiento de hoy (D9). Si más adelante se quiere unificar, es un cambio de una línea en `articleSources.ts` + el `windowAnalysis`. |
| `article_windows` sin FK a `web_articles` | Consistente con `category_exemplars` y `article_category`, que también usan `article_url` como soft link. El borrado de artículo borra sus ventanas explícitamente. |
| El `payload` JSON obliga a un `JSON.parse` por ventana al leer | ≤16 objetos pequeños → ruido. A cambio, añadir una clave nueva no requiere `ALTER TABLE`. |
| Se borra el historial de análisis ya calculado | Aceptado explícitamente (D6). Los artículos conservados mantienen title, thumbnail y body. |
| El podcast se elimina | Aceptado (D14). `src/features/podcast/` está autocontenido y se puede re-enganchar contra `articleState.currentArticle.analysis.windows` + el raw file. |
| El modo `metadata` deja artículos a medias si el usuario nunca los abre | Es intencional: "capturar ahora, analizar al abrir". El toggle "imported articles" los hace visibles, así que no quedan escondidos. |
| El scrape del canal dependía de un stub inerte | **Resuelto** (D21): `profileVideosRunner` se reemplaza por la ruta real `youtube.com/@canal/videos` → `fetchMissingProfileVideos`, y el refresh de la card de perfil pasa a llamar al mismo sitio. |
| El perfil se resolvía en una promesa en background awaited al final del run | **Resuelto** (D20): se resuelve en SOURCE y se persiste al instante; el header lee el registro del artículo. |

---

## 12. Documentación a actualizar al final

- `DOCS/RunnerDoc.md`, `DOCS/TemplateRunnerAssembly.md`, `DOCS/SchemaDrivenWorkflows.md`,
  `DOCS/TaskCreation.md`, `DOCS/YouTubeRunnerFlow.md` → **borrar o reescribir** como
  `DOCS/ArticleRunner.md`.
- `DEAD_CODE.md` → regenerar (el análisis de código muerto cambia radicalmente).
- `AGENTS.md` → actualizar la sección "Test Status" y la lista de tests conocidos.
- `docs/perf-plan-bottlenecks.md` → añadir una nota de cierre indicando que el sistema
  de tareas fue reemplazado (los items `IPC-*` quedan obsoletos en su parte de tasks).
