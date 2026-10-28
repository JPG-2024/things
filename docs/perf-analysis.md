# Análisis de rendimiento, peso y memoria

Fecha: 2026-10-21 · Scope: frontend SvelteKit/Svelte 5 + Tauri v2 · Verificado contra `build/` real y `src-tauri/`

> Este documento es solo análisis / referencia. No se implementó ningún cambio.

---

## 1. Montaje de componentes en el layout

Lo verificado en `src/routes/+layout.svelte`:

| Componente | Montaje | ¿Se desmonta al cerrar? |
|---|---|---|
| `PodcastMode`, `ConversationMode`, `ChatModal`, `DownloadModal` | `{#if ...}` | ✅ Sí, se destruyen |
| `SettingsModal`, `PodcastSettings` | dentro de `<Modal show={...}>` → internamente `{#if show}` | ✅ Sí |
| `ConversationSettings` | dentro de `<Drawer>` → `{#if isOpen}` | ✅ Sí |
| `TTSPlayer` | sin condición | ❌ Siempre montado (solo se oculta visualmente) |
| `FloatingYouTubePlayer` | sin condición | ❌ Siempre montado |
| `TaskWorkflowEditor` | sin condición | ❌ Siempre montado |

El problema real no es el DOM montado, es el **código**: el chunk del layout (`nodes/0…js`, 179 KB) incluye el código de *todos* estos componentes (podcast, conversación, chat, settings) porque los importa estáticamente, y todo a su vez arrastra el chunk monolítico.

---

## 2. Módulos más pesados

### Cliente (build/ = 9.7 MB; JS: 28 archivos, 5.1 MB raw / 437 KB gzip)

| Culpable | Peso | Causa |
|---|---|---|
| **`@lucide/svelte`** | **4.7 MB chunk (92% del JS)** | `import * as icons from '@lucide/svelte'` en `src/components/Icon.svelte:2` mata el tree-shaking: los 1,689 íconos van al bundle, todo eager en el arranque. El chunk (`BbFnvJV_.js`) es importado por el entry SPA y por todos los node chunks → el lazy-loading de rutas de SvelteKit queda anulado |
| `openai` SDK | ~300 KB | import estático en `src/lib/utils/inference/chat-completions-provider.ts:1` |
| `markdown-it` | 141 KB | import estático desde `MarkdownRenderer`, que importa el layout |
| Fuentes TTF | **4.3 MB** | `BetterVCR 25.09.ttf` (2.7 MB), `MonaspaceXenonFrozen-Light` (820 KB), `MonaspaceXenonFrozen-Bold` (817 KB — **ni siquiera se usa**, la var `--font-primary-bold` no se referencia en ningún lado) |

No hay `manualChunks` en `vite.config.js`. No se usan transformers.js/onnx/tensorflow/pdfjs: los embeddings corren en `llama-server` externo vía HTTP.

### Rust (src-tauri)

- `lancedb 0.31` → `lance` + `datafusion` (~45 crates) + `arrow 58` (15 crates) dominan el tamaño del binario.
- Otros pesados: `tauri 2` (+ GTK), `rusqlite` bundled, `reqwest 0.11` (→ openssl), `scraper 0.24` (→ html5ever), `tokio (full)`, `image 0.24`.
- **41 GB de artefactos de debug obsoletos** en `src-tauri/target` (un `cargo clean` los libera).

### Runtime (RAM)

- `src/stores/webStore.ts:182-214` — `_cachedTasksByUrl: Map<string, string>`: `list_web_store_tasks` carga el `tasksJson` completo de **todos** los artículos del workspace (TTL 30 s); los datos quedan duplicados (mapa crudo + filas parseadas).
- `src/stores/articleCacheStore.svelte.ts:163-186` — un `PaginationResource` por perfil visitado, nunca se evicta (el `delete` en línea 622 solo toca `categoryPages`).
- Blobs de TTS (`ttsStore.blobs`) y podcast (`podcastStore._blobs`, que `stop()` **no** limpia).
- `llama-server` arranca con `--ctx-size 32768 --cache-ram 1024` (1 GB de RAM por defecto, `viewStore.svelte.ts:151-152`).
- `playbackEngine` decodifica PCM (~10× el tamaño del blob) pero lo poda a 2 chunks detrás del playhead — correcto.
- Dead path: `webStore.ts:630 getArticles()` sin LIMIT (sin callers hoy).

---

## 3. Fugas de memoria

1. **`src/features/podcast/podcastStore.svelte.ts:852-879`** — `stop()` limpia `_preparePromises`/`_topicSummaries` pero **no `_blobs`** (MBs de audio + blob combinado del episodio). `PodcastMode` `onDestroy` (271-279) llama `stop()` y tampoco cierra el `AudioContext` → audio retenido tras cerrar el modo podcast.
2. **`src/stores/articleCacheStore.svelte.ts:163-186`** — `profileArticlesResources` crece sin eviction por perfil visitado; cada entrada arrastra `persistedTasks`.
3. **`src/stores/micStore.svelte.ts:104`** — `URL.createObjectURL` sobrescribe sin `revokeObjectURL`; `clearTestAudio` existe pero nadie lo llama → una URL/blob filtrado por cada re-grabación.
4. **`src/components/StringReveal.svelte:26-38`** — `revealInterval` se crea dentro de un `setTimeout` y el cleanup del `$effect` (52-55) nunca lo limpia → intervalo huérfano mutando estado muerto; con `loading=true` se auto-loopea para siempre.
5. **`src/stores/navigationHistory.svelte.ts:14,26-35`** — `stack: string[]` append-only sin tope.
6. **`src/stores/musicStore.svelte.ts:45,92`** — `submittedUrls` append-only; las URLs done/error nunca se liberan.
7. **`src/lib/utils/clipboard.ts:20-21`** — el límite de la cola (100) se bypasea cuando `forceLanguageEnabled` está activo.
8. **`src/components/LoadingStack.svelte:28-44`** — race en `listen()` async (menor: es dead code, ver §5).

OK verificado: listeners Tauri en `+layout.svelte` (con flag `disposed`), rAF de `WaveformCanvas` (gated por `shouldAnimate`), rAF/intervals de `MasonryGrid` (con `pendingCleanups`), listeners de ventana en `TTSPlayer`/`FloatingYouTubePlayer`, `micService`, `VoiceSettingsModal` (revoke correcto), health polls con stop function, efecto de persistencia de `settingsStore` (intencional, app-lifetime).

Menores: `coinSound.ts` (AudioContext por sonido, `onended` puede no dispararse si el ctx se suspende), timeouts one-shot de 1-4 s no limpiados (`DownloadModal`, `TemplateManager`, `PostView`), orphan rAF auto-limitante en `MasonryGrid:374-381`.

---

## 4. Bottlenecks

### IPC (el más grave)

- **N+1 en listas**: `parsePersistedTaskStates` (`webStore.ts:228-260` + `533-545`) emite `read_raw_content` **por artículo** al mapear cualquier lista — reintroduce en el webview el texto completo que el diseño de Rust deliberadamente omitió (`ARTICLE_LIST_COLUMNS`, `web_store.rs:995`). Corre en cada fetch de página / filtro / invalidación.
- `list_web_store_tasks` transfiere **toda la tabla** `web_tasks` (tasksJson de cada artículo) solo para pintar títulos/thumbnails; en Rust cada row se re-parsea + re-serializa (`strip_recursive_chunks`).
- `resolveMediaSrc`/`resolveMediaSrcBatch` (`webStore.ts:547-606`) = 2 IPC de path-join (`@tauri-apps/api/path join`) por artículo (thumbnail + profilePicture), sin cachear → ~200 IPC por 100 artículos.
- **`web_store.rs:256-320`**: `get_db()` abre conexión SQLite nueva (incluye PRAGMAs) + ejecuta `init_schema()` completo + 2 queries de migración **en cada invocación** de comando. Multiplica todo lo anterior.
- `deleteProfileById` (`webStore.ts:1017-1045`): trae todos los artículos para filtrar en cliente.
- `deleteSelected` (`selectedArticlesStore:37-55`): bucle serial de 5 IPC por artículo.
- `updateTaskDataById` (`webStore.ts:958-985`): read-modify-write del JSON completo de tasks por un solo cambio.

### Rendering

- **`src/components/MasonryGrid.svelte`**: sin virtualización — `{#each renderedItems}` (L399) pinta todo; cualquier cambio de items dispara `observeAll()` completo + ~4 pasadas O(N) de `getBoundingClientRect` por ciclo de resize (2×rAF + settle 250 ms + `fonts.ready`). Con scroll infinito (`LoadMoreSentinel`), el set renderizado crece sin límite. Resize de ventana = O(N)/frame.
- **Streaming O(n²)**: `onToken` re-renderiza el markdown completo por token (`taskRunner.svelte.ts:460-472` → `MarkdownRenderer` re-corre `md.render(fullText)`); `ChatModal.svelte:120-126` hace `scrollToBottom()` por token (tick + lectura de `scrollHeight` = forced layout por token).
- `ArticleThumbnail.svelte:35-40` ya lleva `loading="lazy"`/`decoding="async"` (corregido; esta línea estaba obsoleta).
- Búsqueda sin límite: `search_raw_content` (`web_store.rs:2311-2395`) lee cada archivo de `raw_content/` completo y devuelve todos los matches.
- Doble búsqueda: `handleSearchInContent()` (`+page.svelte:116-120`) corre la búsqueda y además flippea `unifiedFilter`, cuyo `$effect` re-corre la misma búsqueda 1 s después.

#### Wheel horizontal (tabs de entidades)

El scroll lateral de `ProfileList` perdía frames. Causas corregidas:

- **~120 `backdrop-filter` por pantalla**: `EntityCard` pasa `tooltip={article.title}` a cada artículo → `ArticleThumbnail` montaba un `Tooltip` por thumbnail → cada uno appendía a `document.body` un `<span position:fixed backdrop-filter:blur(8px)>` (invisible, `opacity:0`, pero sigue componiéndose) y registraba un listener de `mousemove` de window. El `backdrop-filter` es lo que forzaba el re-filtrado del fondo por frame. Ahora el tooltip no usa `backdrop-filter` y se marca `visibility:hidden` cuando no está visible (sigue en el DOM porque el portal a `body` depende de él).
- **Máscara en el scroller**: `.wheel-stage` usaba `mask-image` sobre el elemento que scrollea, con un track `width:max-content`. Ahora el fade de bordes son dos overlays `position:absolute` (capas estáticas).
- **`scroll-behavior: smooth` + `scrollLeft +=`**: cada tick de rueda re-apuntaba una animación de ~500px → el strip se movía a saltos. Ahora el scroll es instantáneo (`scrollBy`) y `smooth` solo se pide explícitamente.
- **`view-transition-name` por thumbnail**: inerte (`VIEW_TRANSITIONS_ENABLED = false`, el `startViewTransition` hace SIGSEGV en WebKitGTK) pero marcaba ~120 elementos. Ahora solo se aplica con el flag activo.
- **Virtualización por columnas**: `ProfileList` solo monta las columnas visibles (±1). El rango se calcula aritméticamente (`lib/utils/wheelLayout.ts`) porque las columnas miden siempre lo mismo, y la banda tiene altura fija (`entityCardBandHeight`) para que las filas del grid no cambien de alto al hacer scroll.

Pendiente: `MasonryGrid` (scroll vertical de la tab Articles) sigue sin virtualizar.

### Arranque

- `+layout.ts` bloquea el primer render con `loadSettings()`, que hace 4 `await store.get()` **en serie** (podrían ser paralelos/batch).
- `TTSPlayer` (siempre montado) lanza **dos** `fetchVoiceProfiles` concurrentes al boot + dos capas de estado de voz duplicadas (`useVoiceProfiles` y `mainVoiceState` ambas escribiendo en `ttsState`).
- `ensureLlamaServers` + health polls (llama ×4 + 6 servicios externos cada 15 s) arrancan con el primer mount.

---

## 5. Complejidad innecesaria / código muerto

**Archivos muertos (0 imports):**
- `src-tauri/src/chromadb.rs` (145 líneas; referencia módulos inexistentes — no compilaría si se declarara), `download_media copy.rs`.
- `src/lib/apiListeners.ts`, `src/lib/listeners/markdownListener.ts`, `metadataListener.ts`, `src/lib/types/flowStatus.ts`.
- Componentes: `TextNode.svelte`, `InstantResponse.svelte`, `LoadingStack.svelte`, `CategoryWidget.svelte`, `CompletionOptionsPanel.svelte`, `Tasks/TasksStatusBar.svelte`, `Tasks/CreateTaskForm.svelte`, `Tasks/TaskRerunEditor.svelte` (398 líneas), `inputs/fields/RangeField`, `TextareaField`.
- `src/routes/api/chunk/+server.ts` (server route en SPA estática), `src/lib/utils/LEGACY/*` (en el árbol de `src/**`, type-checked), `webStore.getArticles()`.

**Duplicación / sobre-abstracción:**
- Ladder de 5 estados de task duplicado ×2 en `TasksRender.svelte` (~120 líneas).
- Estado de voz triplicado: `ttsState.voiceChunks/config` + `useVoiceProfiles` + `mainVoiceState`.
- `workflowManager.svelte.ts`: ~9 pass-throughs 1:1 a `workflowStore`; `toErrorMessage` duplicado; tipo `WorkflowTaskStackEntry` duplicado.
- `new MarkdownIt()` por instancia de componente (`MarkdownRenderer.svelte:15` — chat, chunks, etc.).
- ~10 prompts/constantes muertas en `src/constants.ts`; `viewStore.messages` nunca leído; bloques comentados en `+layout.svelte`, `TasksRender`, `PostView`, `+page.svelte`, `Topbar`.

**Logs ruidosos:** `helpers/tasks.ts:43`, `embeddingTasks.ts:318,332`, `chat-completions-provider.ts:503` (loguea el mensaje del usuario), `AskComponent.svelte:173,176` (token por token), `micService.ts`, `recursiveTask.ts:366`.

**Anti-patrones Svelte 5:**
- `paginationResource.svelte.ts:13` — `items = $state<TItem[]>([])` (deep-proxy) sobre arrays que solo se reemplazan wholesale; `$state.raw` bastaría.
- `viewStore.svelte.ts:236` — `rawSearchResults = $state(null)` con deep-proxy sobre cada match.
- `workflowStore.svelte.ts:31` — `SvelteMap` deep-reactivo de runs con payloads grandes; cada mutación de task reconstruye 4 arrays derivados.
- `MasonryGrid:37` y `ProfileList:50-54` — arrays espejo `$state` de props (duplicación).

---

## 6. Plan de mejoras propuesto (por impacto/esfuerzo)

**Fase 1 — Bundle ligero (el 90% del peso):**
1. `Icon.svelte`: reemplazar `import *` por registro explícito de solo los íconos usados → **4.7 MB → ~30 KB**.
2. Fuentes: convertir TTF → WOFF2 subset y borrar la Bold no usada → **4.3 MB → ~300 KB**.
3. Dynamic `import()` para `PodcastMode`, `ConversationMode`, `ChatModal`, `openai`, `markdown-it` → el arranque solo carga lo visible.

**Fase 2 — Memoria:** `podcastStore.stop()` limpiar `_blobs` + `closeAudioContext` en destroy de `PodcastMode`; `revokeObjectURL` en `micStore`; cap en `navigationHistory`/`musicStore`; LRU en `profileArticlesResources`; fix `StringReveal`.

**Fase 3 — Bottlenecks:** variante ligera de `list_web_store_tasks` (solo metadata) para listas; eliminar el N+1 de `read_raw_content` (resolución on-demand); cachear media-src; conexión SQLite persistente + `init_schema` una vez; `loading="lazy"` + `content-visibility: auto` en MasonryGrid; throttle del render de markdown durante streaming.

**Fase 4 — Limpieza:** borrar los ~15 archivos muertos, constantes y logs ruidosos (`cargo clean` aparte para los 41 GB).

**Fase 5 — Verificación:** `bun run build` comparando pesos, `bun run check`, smoke test manual de podcast/TTS/chat.
