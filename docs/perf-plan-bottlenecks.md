# Plan de fixes — Bottlenecks (perf-analysis §4)

Fecha: 2026-10-21 · Scope: frontend SvelteKit/Svelte 5 + Tauri v2 · Complementa `docs/perf-analysis.md`

> Este documento es el plan de implementación para cada item de la sección
> **4. Bottlenecks** del análisis. Los items se identifican como `IPC-*`,
> `REN-*` y `BOOT-*` para poder referenciarlos en commits y PRs.
>
> **Estado (2026-10-22):** fase IPC completa (IPC-1 … IPC-7), arranque completo
> (BOOT-1, BOOT-2a+b, BOOT-3) y los quick wins de rendering (REN-3, REN-5)
> hechos, ver la sección "Estado de implementación". Quedan REN-1, REN-2 y
> REN-4.

> **Nota de cierre (2026-10-24):** el sistema de tareas fue **reemplazado** por
> el MVP article runner (`docs/mvp-article-runner-plan.md`). Los items `IPC-*`
> quedan obsoletos en su parte de tasks: el blob `web_tasks`, los comandos
> `upsert_web_store_tasks` / `get_web_store_tasks_by_url` /
> `get_web_store_task_chunks` / `update_web_store_task_data` y la cola
> `viewState.urlQueue` ya no existen. El trabajo de rendimiento vive ahora en
> `DOCS/ArticleRunner.md` (abrir un artículo cacheado son 2 lecturas locales,
> 0 red y 0 LLM).

Convenciones del repo que aplican a casi todo lo de abajo:

- Todo comando Tauri nuevo debe registrarse en el invoke handler de
  `src-tauri/src/lib.rs` **y** tener su caller TS con el mismo nombre.
- Código que necesite rutas de DB/media/raw-content/embeddings debe usar los
  helpers de `db_manager`, nunca joinear `app_data_dir()` a mano.
- Constantes con efecto visible en UX van como settings en `SettingsModal` /
  `VoiceSettingsModal` cuando aplique (se marca en cada item).

---

## Estado de implementación (2026-10-22)

| Item    | Estado              | Commit    | Notas                                                                                                                      |
| ------- | ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| IPC-1   | ✅ Hecho            | `53b6555` | Hidratación solo en paths de detalle; `getArticleThumbnailByUrl` liviano (fila + thumb, sin hidratar)                      |
| IPC-2   | ✅ Hecho (opción B) | `53b6555` | Descarga de `web_tasks` completa eliminada; desvío documentado abajo                                                       |
| IPC-3   | ✅ Hecho (cache)    | `ce1dcd1` | Memo por `(directory, filename)` a nivel promesa + `isResolvedMediaSrc`; el comando batch (punto 2 del fix) queda opcional |
| IPC-4a  | ✅ Hecho            | `6ead6a8` | `ensure_schema` memoizado por ruta (`Lazy<Mutex<HashSet<PathBuf>>>`); 41 `init_schema` por comando eliminados              |
| IPC-4b  | ⏸ Opcional          | —         | Solo si la medición lo justifica                                                                                           |
| IPC-5   | ✅ Hecho            | `6ead6a8` | Transacción única + rebuild 1 vez + media/raw content en Rust; test nuevo                                                  |
| IPC-6   | ✅ Hecho            | `9b15466` | `delete_web_store_articles_by_urls(urls) -> usize`; embeddings batch server-side; comandos single huérfanos borrados       |
| IPC-7   | ✅ Hecho            | `88b068c` | `update_web_store_task_data(url, taskId, data) -> bool` atómico; wrap de raw content replicado en Rust                     |
| BOOT-1  | ✅ Hecho            | `f6d0d54` | `loadSettings` con `Promise.all` (orden de aplicación preservado); `set('version')` fire-and-forget                        |
| REN-3   | ✅ Hecho            | `5168516` | `loading="lazy"` + `decoding="async"` en la thumb de `ArticleThumbnail`                                                    |
| REN-5   | ✅ Hecho            | `4a04c88` | Guard single-flight en `handleRawSearch(pattern, force)` + `rawSearchLastPattern`; el botón fuerza re-búsqueda             |
| BOOT-2a | ✅ Hecho            | `752e284` | Promesa compartida de `/voices` (fallo no sticky, copia defensiva); `force` en re-fetch post-mutación                      |
| BOOT-2b | ✅ Hecho            | `acbdfb4` | `useVoiceProfiles` eliminado; estado y métodos en `ttsState`; `mainVoiceState` sin estado propio (−184 líneas netas)       |
| BOOT-3  | ✅ Hecho            | `0c6a500` | Autostart de llama diferido 3 s; `createAdaptivePoller` (skip oculto + refresh al foreground + backoff 15→30→60 s)         |

Desvío aceptado en IPC-2 (opción B elegida sobre la proyección de tasks): las
listas ya no reciben `persistedTasks` — la tabla `web_tasks` completa deja de
transferirse, pero los chips de categoría y las pills de topics de
`ArticleItem` desaparecen de Articles/Profiles/Domains, y el resumen de perfil
sobre artículos de lista se queda sin títulos/summaries (falla soft).
Follow-up posible si la UI lo extraña: chips/topics lazy por card vía
`getTasksByUrl` cacheado.

Verificación de la fase: `cargo test` 60 passed; `svelte-check` + ESLint
limpios en archivos tocados; `bun run build` OK. Pendiente manual (requiere la
app): smoke de listas, detalle, TTS, borrados y el baseline post-fase para
anotar el delta de invokes.

---

## 0. Orden de ejecución sugerido

Quick wins primero (no tocan Rust), luego el paquete IPC de listas, el resto
de IPC en Rust, rendering pesado y arranque.

| #   | Item                  | Resumen                                                              | Esfuerzo | Depende de                    |
| --- | --------------------- | -------------------------------------------------------------------- | -------- | ----------------------------- |
| 1   | REN-3                 | `loading="lazy"` en thumbnails                                       | S        | —                             |
| 2   | BOOT-1                | `loadSettings` con `Promise.all`                                     | S        | —                             |
| 3   | REN-5                 | eliminar la doble búsqueda en contenido                              | S        | —                             |
| 4   | IPC-3                 | cache/batch de media src                                             | S/M      | —                             |
| 5   | BOOT-2a               | dedup de `fetchVoiceProfiles`                                        | S        | —                             |
| 6   | IPC-1 + IPC-2         | eliminar N+1 y la descarga de `web_tasks` completa                   | M        | — (van juntos)                |
| 7   | IPC-4a                | `init_schema` una vez por DB                                         | S/M      | —                             |
| 8   | REN-2                 | throttle del render durante streaming                                | M        | —                             |
| 9   | IPC-5 / IPC-6 / IPC-7 | deletes en batch + task-patch en Rust                                | M c/u    | IPC-4a (recomendado)          |
| 10  | REN-1a → 1c → 1b      | MasonryGrid: observe incremental → resize gating → ventana de render | M/L      | —                             |
| 11  | REN-4                 | límites en `search_raw_content`                                      | S/M      | IPC-1 (para el mapeo cliente) |
| 12  | BOOT-3                | deferral de llama + polls adaptativos                                | S/M      | —                             |

Opcionales (solo si medición lo justifica): IPC-4b (pool de conexiones, L),
BOOT-2b (consolidación de estado de voz, L), REN-1d (`content-visibility`, M,
riesgo medio), BOOT-3c (`llamaAutoStart=false` por defecto, cambia UX).

Antes de empezar: capturar baseline medible (cuantos invokes hace un fetch de
página con ~100 artículos, timeline de boot, tamaño de chunks con
`bun run build`) para poder comparar al cerrar cada fase.

---

## 1. IPC (el más grave)

### IPC-1 · N+1 de `read_raw_content` en listas

**Estado: ✅ implementado (`53b6555`).** Default sin hidratación; solo los
paths de detalle (`getArticleWithTasksByUrl`, `getTasksByUrl`) pasan
`{ hydrateRawContent: true }`. Los consumidores de lista (`ArticleItem`,
`profileSummary`) quedan sin tasks — ver el desvío de IPC-2.

**Problema (verificado).** `mapStoredArticle` (`src/stores/webStore.ts:533-545`)
llama a `parsePersistedTaskStates`, que por cada task con id `content` cuyo
data es un `__rawContentRef__` emite `invoke('read_raw_content')`
(`webStore.ts:244-251`): un IPC + lectura del archivo completo por artículo.
Eso corre en **cada** mapeo de lista:

- `getArticlesWithoutProfile` (`webStore.ts:1234-1272`) → fetch de página de
  la pestaña Articles (via `articleCacheStore`).
- `getProfiles({ includeArticles: true })` (`webStore.ts:702-794`) → pestañas
  Profiles/Domains, con N artículos embebidos por card.
- `getArticlesByCategories` (`webStore.ts:1288-1322`).
- `mapArticlesFromRecords` (`webStore.ts:619-628`) → resultados de búsqueda.

Consumidores reales de `persistedTasks` en items de lista (verificado con
grep): `ArticleItem.svelte:77,90` lee las tasks `category` y `analysis`
(ninguna es el `content` hidratado). El texto crudo solo se usa en vista de
detalle, TTS y summaries.

**Fix.**

1. Separar parse de hidratación: `parsePersistedTaskStates(raw, opts?: { hydrateRawContent?: boolean })`,
   default `false` → JSON.parse puro, cero IPC. La hidratación explícita solo
   en los paths de detalle (`getArticleWithTasksByUrl`, `getTasksByUrl`).
2. Auditar los consumidores que esperan el texto del task `content` en items
   de lista (TTS hotkey `generateTTSfromArticleURL` en `+page.svelte:193-204`,
   `profileSummary.ts`, `tts.ts:18`) y hacer que resuelvan el ref on-demand
   vía `getArticleWithTasksByUrl` / `read_raw_content` individual.
3. No hidratar texto en listas aunque sea batch: reintroduciría los MBs en el
   webview que el diseño de Rust omitió a propósito.

La persistencia no cambia: guardar un ref sin resolver es lo que ya se
escribe hoy (`wrapRawContentRef`, `webStore.ts:310-317`).

**Archivos:** `src/stores/webStore.ts`; consumidores auditados en punto 2.
**Esfuerzo:** M (la auditoría de consumidores es lo fino).
**Riesgos:** algún componente que lea `persistedTasks[content].data` en un
item de lista y espere texto vería vacío/ref. Mitigación: grep de
consumidores del task `content` antes de tocar.
**Verificación:** abrir la app con 100+ artículos y contar invokes de
`read_raw_content` por fetch de página (antes/después); smoke de detalle de
artículo, hotkey S (TTS) y búsqueda.

### IPC-2 · `list_web_store_tasks` transfiere la tabla `web_tasks` completa

**Estado: ✅ implementado con la opción B (`53b6555`).** En vez de proyectar
tasks por id, se eliminó la descarga completa (`getTasksByUrlMap`, su cache
TTL y el comando `list_web_store_tasks` + `strip_recursive_chunks` y sus 2
tests, que quedaron sin callers). Las listas no reciben `persistedTasks`;
regresión aceptada según el desvío de arriba.

**Problema (verificado).** Único caller frontend: `getTasksByUrlMap()`
(`webStore.ts:194-214`, TTL 30 s), usado para hidratar listas en
`mapAndResolveArticles`. En Rust (`web_store.rs:2090-2110`) hace
`SELECT url, tasks_json, updated_at FROM web_tasks` sin límite y
`strip_recursive_chunks` re-parsea + re-serializa cada row.

**Fix.** Subsumido por IPC-1: eliminar `getTasksByUrlMap` y su caché
(`_cachedTasksByUrl` y friends, `webStore.ts:182-214`) junto con el argumento
de `mapAndResolveArticles`; `mapStoredArticle(row, null)`. Los paths que
necesitan tasks reales ya usan `get_web_store_tasks_by_url` por URL. Precedente
de que es prescindible: `getArticlesByCategories` ya mapea con `new Map()`
(`webStore.ts:1307`). El comando Rust queda sin callers → borrar de
`web_store.rs` + `lib.rs` (o dejarlo para la fase de limpieza).

**Archivos:** `src/stores/webStore.ts`; `src-tauri/src/web_store.rs` + `lib.rs` si se borra el comando.
**Esfuerzo:** S (una vez hecho IPC-1).
**Riesgos:** bajo; comportamiento igual al que ya tiene el path de categorías.
**Verificación:** fetch de página sin invoke de `list_web_store_tasks`; smoke
de listas, filtros, pestañas profiles/domains/categorías.

### IPC-3 · `resolveMediaSrc`: 2 IPC de path-join por item

**Estado: ✅ cache implementada (`ce1dcd1`).** Memo de promesas por
`(mediaDirectory, imgName)` con expulsión de rechazos; incluye el fix dev
`/@fs` y `isResolvedMediaSrc`. El comando batch (punto 2 del fix) queda
opcional, sin hacer.

**Problema (verificado).** `resolveMediaSrcBatch` (`webStore.ts:569-594`)
resuelve thumbnail + profilePicture por artículo → `getMediaSrc`
(`src/lib/utils/files.ts:21-22`) → `getImageSrc` → `getMediaRoot()` (ya
cacheado ✅) pero `join(...)` de `@tauri-apps/api/path` es un IPC, y
`convertFileSrc` es puro. Sin memoización → cada fetch de página re-resuelve
todo (~200 IPC por 100 artículos).

**Fix.**

1. **Cache local (S):** memo `Map<(folder, filename), src>` en `files.ts`. No
   necesita invalidación: cambiar de workspace recarga la webview completa.
2. **Batch (M, opcional):** comando Rust `resolve_media_paths(pairs) -> Vec<String>`
   que hace el join server-side para una página entera (1 IPC por página);
   el frontend aplica `convertFileSrc` (puro) al resultado. Vía segura para no
   asumir el separador de path de la plataforma; el join local con `/` solo es
   correcto en Linux/macOS.

**Archivos:** `src/lib/utils/files.ts`, `src/stores/webStore.ts`; opcional
`src-tauri/src/web_store.rs` + `lib.rs` para el comando batch.
**Esfuerzo:** S (cache) / M (batch).
**Riesgos:** bajo. Si se hace join local, cuadrar compat Windows.
**Verificación:** abrir listas con 100+ artículos: invokes de path por página
de 200 → 0-1; thumbs y avatares se siguen viendo (smoke visual).

### IPC-4 · `get_db()` reabre conexión + `init_schema` en cada invocación

**Estado: ✅ etapa A implementada (`6ead6a8`).** `ensure_schema` memoizado por
ruta de DB dentro de `get_db` (también en `init_database_at`); los 41
`init_schema(&conn)?;` de comandos eliminados. Etapa B pendiente de medición.

**Problema (verificado).** `get_db` (`web_store.rs:256-259`) abre una
`Connection` nueva (con PRAGMAs en `open_connection`) por comando, y cada
comando además llama `init_schema(&conn)` (migración `rename_profiles_to_domains`

- DDL completo de todas las tablas, `web_store.rs:261+`). Se multiplica en
  decenas de comandos.

**Fix por etapas (la B difiere hasta medir).**

- **Etapa A (obligatoria):** `init_schema` una vez por ruta de DB. Cache
  `Mutex<HashSet<PathBuf>>` (o `OnceCell` por path) consultada dentro de
  `get_db()`. Clave = ruta resuelta: cubre el caso de `init_database_at`
  (`db_manager` prepara un workspace antes de activarlo) y de export/import,
  que crean rutas nuevas. Los tests que llaman `init_schema` directo no cambian.
- **Etapa B (opcional, L):** conexión persistente por workspace
  (`Mutex<HashMap<PathBuf, Arc<Mutex<Connection>>>>`, comandos toman un
  guard). Cambio mecánico pero ancho (~40 call sites de `get_db`). WAL y
  PRAGMAs se setean una vez en el open.

**Archivos:** `src-tauri/src/web_store.rs` (+ `lib.rs` si cambia la firma de
`get_db` en la etapa B — comandos no, es interno).
**Esfuerzo:** A = S/M · B = L.
**Riesgos:** A mínimo (idempotencia ya garantizada por `IF NOT EXISTS`/flag).
B: vida de la conexión vs. switch de workspace — la cache keyed-by-path lo
resuelve; `Connection` no es `Sync`, de ahí el mutex por conexión.
**Verificación:** `cargo test --manifest-path src-tauri/Cargo.toml` (los 8
tests de `web_store::tests` deben seguir pasando); micro-bench manual de un
fetch de lista antes/después.

### IPC-5 · `deleteProfileById` trae todos los artículos al cliente

**Estado: ✅ implementado (`6ead6a8`).** `delete_bucket_rows` (transacción +
rebuild 1 vez) y `delete_bucket_media` en Rust; el cliente queda en
`getProfile` (rama) + 1 invoke + `invalidateProfilesCache()`. Mejora
comportamiento: los thumbnails de dominios ahora sí se borran (antes el filtro
cliente no matcheaba en el caso dominio y quedaban huérfanas). Los embeddings
siguen sin borrarse en este path (pre-existente). Test:
`delete_bucket_rows_clears_rows_tolerates_missing_urls_and_rebuilds_once`.

**Problema (verificado).** `deleteProfileById` (`webStore.ts:1017-1045`) hace
`list_web_store_articles` (tabla completa, solo para filtrar por profile en
cliente y borrar thumbnails) + `deleteMediaFile` cliente a cliente. En Rust,
`delete_web_store_domain` / `delete_web_store_profile`
(`web_store.rs:1985-2025`) ya listan los artículos del bucket server-side,
pero `delete_articles_for_bucket` (`web_store.rs:1961-1981`) solo borra filas:
tasks + artículos, con `rebuild_domains_from_articles` **por artículo**
(recuento de dominios O(N) × N = O(N²)) y sin tocar archivos.

**Fix.** Mover la limpieza de archivos al lado Rust:

1. `delete_articles_for_bucket` usa los records ya listados por bucket
   (incluyen `thumbnail`; ampliar la query si falta la columna) para
   `fs::remove` de cada thumbnail en `media/thumbnails/` + la foto del bucket.
2. Borrar tasks + artículos en una transacción y `rebuild_domains_from_articles`
   una sola vez al final.
3. TS queda: `invoke('delete_web_store_domain'|'delete_web_store_profile')` +
   `invalidateProfilesCache()` — sin fetch de artículos ni `deleteArticleMedia`
   cliente.

**Archivos:** `src-tauri/src/web_store.rs`, `src/stores/webStore.ts`.
**Esfuerzo:** M.
**Riesgos:** thumbnails compartidos entre artículos (improbable: el nombre se
deriva de la url); el borrado de archivos pasa de manejo de error suave en
cliente a `Result` en Rust — decidir si un fallo de fs aborta o solo loguea
(hoy loguea y sigue).
**Verificación:** `cargo test` + smoke: borrar un dominio con N artículos →
filas, thumbs y dots del toolbar desaparecen; export/import posterior intacto.

### IPC-6 · `deleteSelected`: bucle serial de ~5 IPC por artículo

**Estado: ✅ implementado (`9b15466`).** `delete_web_store_articles_by_urls`
reutiliza `delete_bucket_rows`; embeddings vía `delete_article_embeddings_batch`
(1 conexión LanceDB, 1 predicated `IN` por tabla). `deleteSelected` quedó en
1 IPC; `deleteArticleByUrl` delega (mismo contrato). Borrados por huérfanos:
`delete_web_store_article_by_url` y `delete_web_store_tasks_by_url`.

**Problema (verificado).** `deleteSelected`
(`src/stores/selectedArticlesStore.svelte.ts:37-55`) llama `deleteArticleByUrl`
en serie; cada una (`webStore.ts:987-1003`) = get article + get tasks (2 IPC)

- delete media + delete article + delete tasks + delete embeddings. En Rust,
  cada `delete_web_store_article_by_url` además corre
  `rebuild_domains_from_articles` completo (`web_store.rs:1814-1833`).

**Fix.** Comando Rust `delete_web_store_articles_by_urls(urls: Vec<String>) -> usize`:

- Transacción única: DELETE de `web_articles` + `web_tasks`, borra embeddings
  y archivos de thumbnail, `rebuild_domains_from_articles` **una** vez.
- Tolerar urls inexistentes (devolver conteo de borrados reales).
- Frontend: 1 IPC (o chunks de ~50 con contador de progreso si se quiere
  feedback incremental; el flag `isDeleting` ya cubre el estado de UI).

**Archivos:** `src-tauri/src/web_store.rs`, `src-tauri/src/lib.rs` (registrar),
`src/stores/selectedArticlesStore.svelte.ts`, `src/stores/webStore.ts` (caller TS).
**Esfuerzo:** M.
**Riesgos:** bajo; reutilizar helpers existentes (el borrado de embeddings que
hoy hace `deleteArticleEmbeddings` en TS debe moverse/llamarse desde Rust).
**Verificación:** `cargo test` + smoke de selección múltiple (5 y 50
artículos) + verificación de residuos (thumbs y embeddings huérfanos).

### IPC-7 · `updateTaskDataById` read-modify-write del JSON completo

**Estado: ✅ implementado (`88b068c`).** Helper puro
`replace_task_data` (test: `replace_task_data_updates_matching_task_and_no_ops_otherwise`)

- comando `update_web_store_task_data` con SELECT+UPDATE en una transacción y
  wrap de raw content replicado server-side. El cliente quedó en 1 invoke con el
  mismo contrato.

**Problema (verificado).** `updateTaskDataById` (`webStore.ts:958-985`):
`get_web_store_tasks_by_url` (JSON completo de ida) → parse en JS → muta 1
task → posible `write_raw_content` → `upsert_web_store_tasks` (JSON completo
de vuelta). Además deja una ventana de carrera entre read y write.

**Fix.** Comando Rust `update_web_store_task_data(url, taskId, data)`:

- SELECT tasks_json → parse con serde_json → localizar task por id →
  sustituir `data` → si es string de contenido, replicar server-side la lógica
  de `wrapRawContentRef` (escribir raw content + meter ref, helper compartido)
  → UPDATE en transacción.
- El payload viaja una sola vez (solo el nuevo `data`) y el RMW pasa a ser
  atómico.

**Archivos:** `src-tauri/src/web_store.rs`, `src-tauri/src/lib.rs`, `src/stores/webStore.ts`.
**Esfuerzo:** M (lo delicado es la lógica de ref server-side; usar los tests
de `strip_recursive_chunks` como referencia de estilo).
**Riesgos:** divergencia entre el wrap cliente y server — un solo helper y
tests del round-trip lo cubren.
**Verificación:** `cargo test` + smoke: task que actualiza data (p. ej.
re-run de análisis) → verificar fila en DB y archivo en `raw_content/`.

---

## 2. Rendering

### REN-1 · MasonryGrid sin virtualización

**Problema (verificado).** `src/components/MasonryGrid.svelte`:

- `{#each renderedItems}` sin cap (L399) pinta todo; con scroll infinito el
  DOM crece sin límite.
- `observeAll()` (L249-259) hace disconnect + re-observe de todos los items y
  resetea `lastSpans` por cada cambio de `items` (L374-381) → remeasure total
  en cada fetch de página.
- Ciclo de resize (L281-346): 1ª pasada + 2ª rAF + settle 250 ms +
  `fonts.ready` → hasta 4 pasadas O(N) de `getBoundingClientRect`.
- Window resize → `scheduleResize()` inmediato (L137-140, L349) → O(N)/frame
  durante un drag-resize.

**Fix en sub-pasos independientes (landear secuencialmente, en este orden):**

- **REN-1a (S/M) — observe incremental.** Mantener el `contentObserver` vivo;
  en el `$effect` observar solo wrappers nuevos y unobserve los que ya no
  existen (diff contra un `Set` de elementos observados). No resetear
  `lastSpans` globalmente: la histeresis por wrapper se conserva y evita el
  flicker de spans en cada fetch.
- **REN-1c (S/M) — resize gating.** Re-medir todo solo cuando cambia algo que
  afecta spans: `effectiveColumns`, preset (row metrics) o contenido. Durante
  un drag-resize continuo, calcular las columnas candidatas desde
  `containerWidth` (ya lo trackea `containerObserver`) y saltarse
  `scheduleResize` si no cambió el conteo; debounce trailing (~150 ms) para el
  resize real. Elimina el O(N)/frame.
- **REN-1b (M/L) — ventana de render.** `renderLimit = $state(INITIAL_RENDER_COUNT)`;
  `renderedItems = items.slice(0, renderLimit)`; un sentinel interno (o scroll
  listener) crece `renderLimit` en bloques (~2× filas visibles). Convive con
  `LoadMoreSentinel` (que pagina datos): uno trae datos, otro pinta. Mantiene
  DOM y mediciones acotados.
- **REN-1d (opcional, riesgo medio) — `content-visibility: auto` +
  `contain-intrinsic-size` en `.content`.** OJO: los items offscreen devuelven
  el tamaño intrínseco en `getBoundingClientRect` → spans mal medidos y
  saltos de layout al entrar en viewport. Solo si 1a+1b+1c no bastan, probado
  a mano.

**Archivos:** `src/components/MasonryGrid.svelte`.
**Esfuerzo:** M-L total, por partes.
**Riesgos:** 1b interacciona con las transiciones intro/outro (los items que
entran por crecimiento de `renderLimit` animan en cascada — animar solo el
primer bloque o none en las expansiones). 1c: comprobar que el zoom (cambia
gap rem) sigue remidiendo.
**Verificación:** smoke con 200+ artículos: DOM count acotado en el inspector,
FPS estable durante resize de ventana, sin saltos de layout al scrollear,
hotkeys Alt+ArrowDown/Up siguen re-midiendo al cambiar preset.

### REN-2 · Streaming O(n²): markdown por token + forced layout por token

**Problema (verificado).**

- `src/runners/taskRunner.svelte.ts:464-469`: `onToken` acumula en
  `task.data` por token → los consumidores re-renderizan `MarkdownRenderer`
  con el texto completo en cada token.
- `MarkdownRenderer.svelte:15,49`: `new MarkdownIt()` por instancia y
  `md.render(fullText)` en cada cambio de `content`.
- `ChatModal.svelte:120-126`: `scrollToBottom()` por token = `tick()` +
  lectura de `scrollHeight` (forced layout) por token.
- Mismo patrón en `ConversationMode.svelte:219`, `AskComponent.svelte:170`,
  `InstantResponse.svelte:56`.

**Fix.**

1. **MarkdownRenderer:** instancia de markdown-it a nivel de módulo (el
   render es stateless). Prop `streaming?: boolean`: mientras esté activa, el
   HTML mostrado se actualiza con trailing throttle (constante
   `STREAM_RENDER_INTERVAL_MS = 100` en el componente), con flush final al
   estabilizarse `content`. Alternativa aún más barata si el throttle no
   alcanza: texto plano mientras streaming, markdown completo al final.
2. **ChatModal:** `scrollToBottom` throttled a rAF (flag `scrollQueued`) y
   solo cuando el usuario está pegado al fondo (guard con la distancia al
   fondo leída en el handler de scroll, no por token).
3. **Util compartida** `src/lib/utils/streamRender.ts`
   (`createThrottledUpdater`) para no copiar el patrón en
   ConversationMode/AskComponent/InstantResponse.

**Archivos:** `src/components/MarkdownRenderer.svelte`,
`src/components/ChatModal.svelte`, `src/runners/taskRunner.svelte.ts` (solo si
se decide acumular en el runner en vez de en el render), los otros 3
consumidores de `onToken`, nueva util.
**Esfuerzo:** M.
**Riesgos:** bajo — solo cambia la frecuencia de render; el flush final
garantiza el estado correcto.
**Verificación:** chat largo con streaming: re-render a ~10 Hz, no por token;
el scroll no pelea con el usuario; el texto final coincide con
`response.content`. Smoke de conversación y ask de article view.

### REN-3 · Thumbnails eager

**Estado: ✅ implementado (`5168516`).** `loading="lazy"` +
`decoding="async"` en el `<img>` de `thumbnailImage()`.

**Problema (verificado).** `src/components/ArticleItem/ArticleThumbnail.svelte:35-40`:
`<img>` sin `loading="lazy"` ni `decoding="async"` → todas las thumbs de la
lista cargan al montar.

**Fix.** Añadir `loading="lazy"` y `decoding="async"` al `<img>` (el
view-transition-name se queda igual; el contenedor ya fija el aspect-ratio,
no hay CLS).

**Archivos:** `src/components/ArticleItem/ArticleThumbnail.svelte`.
**Esfuerzo:** S. **Riesgos:** ninguno.
**Verificación:** devtools/Network: al montar una lista solo cargan las
thumbs cercanas al viewport.

### REN-4 · `search_raw_content` sin límite

**Problema (verificado).** `web_store.rs:2310-2395`: lee cada archivo de
`raw_content/` completo (`fs::read_to_string`), extrae 1 snippet por archivo
matcheado, sin cap de resultados ni de tamaño de archivo; el índice url se
recarga por búsqueda. El cliente además mapea todos los resultados vía
`mapArticlesFromRecords` (que hoy arrastra IPC-1/IPC-2 encima).

**Fix.**

1. Parámetro `limit` (máx. resultados) con early-exit del loop de `read_dir`.
   El orden por `created_at` se mantiene entre los N encontrados — mejor aún:
   mover el sort al SQL en `fetch_articles_by_urls` (`ORDER BY a.created_at
DESC LIMIT ?`) en vez de ordenar en memoria.
2. Cap de lectura por archivo: `File::take(MAX_FILE_BYTES)` (p. ej. 1 MB) o
   early-exit al primer match leyendo en stream.
3. Exponer el `limit` en el caller (`+page.svelte:141`) y darlo de alta como
   setting junto a `rawSearchContextChars` en `viewStore` +
   `SettingsModal` (constante con efecto visible → configurable, según
   convención del repo).

**Archivos:** `src-tauri/src/web_store.rs`, `src/routes/+page.svelte`,
`src/stores/viewStore.svelte.ts`, `src/components/modals/SettingsModal.svelte`.
**Esfuerzo:** S/M.
**Riesgos:** resultados truncados sin aviso → indicar "más resultados
disponibles" cuando `len == limit` (UI mínima).
**Verificación:** búsqueda frecuente en workspace grande: tiempo estable;
resultados correctos y recortados; smoke del filtro unificado completo.

### REN-5 · Doble búsqueda en contenido

**Estado: ✅ implementado (`4a04c88`).** Guard single-flight en
`handleRawSearch(pattern, force = false)` + `viewState.rawSearchLastPattern`;
el botón pasa `force: true`. Refinamiento sobre el plan: el guard también
exige `rawSearchResults !== null`, así una búsqueda limpiada
(`handleClearSearch` / effect de limpiado) puede re-ejecutar el mismo
término; un resultado vacío (`[]`, p. ej. tras un error) también permite
retry.

**Problema (verificado).** `handleSearchInContent` (`+page.svelte:116-120`)
corre `handleRawSearch` inmediatamente Y llama `commitUnifiedFilter()`, cuyo
cambio de `viewState.unifiedFilter` dispara el `$effect` (`+page.svelte:173-178`)
que re-corre la misma búsqueda 1 s después. Cada corrida arrastra el mapeo
caro de IPC-1/IPC-2.

**Fix (recomendado: single-flight).** Guard en `viewState`:
`rawSearchLastPattern`; `handleRawSearch(pattern, force = false)` hace
early-return si `pattern === rawSearchLastPattern && !force`. El botón pasa
`force: true`; el `$effect` queda como única vía del debounce. (Alternativa
más simple: quitar la llamada directa del handler y dejar solo el effect con
1 s de espera — peor UX para el botón.)

**Archivos:** `src/routes/+page.svelte`, `src/stores/viewStore.svelte.ts`.
**Esfuerzo:** S.
**Riesgos:** ninguno; el guard además sirve para IPC-1 (los resultados
existentes no re-hidratan).
**Verificación:** click en "buscar en contenido" → exactamente 1 invoke de
`search_raw_content`; escribir en el input → debounce sigue funcionando.

---

## 3. Arranque

### BOOT-1 · `loadSettings` en serie bloquea el primer render

**Estado: ✅ implementado (`f6d0d54`).** Los 4 `store.get` en `Promise.all`
con aplicación en el orden original; `set('version')` fire-and-forget con
`.catch()`. El `await` del load se mantiene.

**Problema (verificado).** `+layout.ts:10-13` hace `await loadSettings()` antes
del primer render; `loadSettings` (`settingsStore.svelte.ts:290-304`) hace 4
`await store.get()` en serie (4 round-trips del plugin-store) + `store.set('version')`.

**Fix.** `Promise.all` de los 4 `get()` y aplicar en el mismo orden
(applyView → applyScrap → applyPodcast → applyTts) para mantener la semántica
actual de aplicación. `store.set('version')` puede quedar fire-and-forget con
`.catch()`. El `await` del load se mantiene a propósito: los hijos asumen
settings aplicados al montar.

**Archivos:** `src/stores/settingsStore.svelte.ts`.
**Esfuerzo:** S. **Riesgos:** bajo (orden de aplicación preservado).
**Verificación:** arranque: tema/colores/voz aplicados; breakpoint en
`applyTts` para confirmar que llega después de `applyView`.

### BOOT-2 · Doble `fetchVoiceProfiles` al boot + estado de voz duplicado

**Estado: ✅ 2a implementado (`752e284`); ✅ 2b implementado (`acbdfb4`).**
2a: cache de la promesa en `ttsService.ts` con firma
`fetchVoiceProfiles({ silent, force })`; fallo no sticky, copia defensiva por
caller (`[...profiles]`) y `force: true` en los 3 re-fetch post-mutación de
`mainVoice` + `onProfilesChanged`. 2b: `useVoiceProfiles` eliminado — su
estado y métodos viven en `ttsState` (`voiceProfiles`,
`initVoiceProfiles`, `loadVoiceChunksForProfile`,
`handleVoiceWheelChange`, `handleLiveVoiceWheelChange`);
`mainVoiceState` quedó como módulo de operaciones sin estado propio
(`loading` muerto eliminado). Capas de estado de voz: de 3 a 1.

**Problema (verificado).** `useVoiceProfiles.initProfiles`
(`src/components/TTSPlayer/useVoiceProfiles.svelte.ts:83-96`, usado por
`TTSPlayer`, siempre montado) y `mainVoice.svelte.ts:35,83,101,128` fetchean
perfiles por su cuenta; `podcastStore.svelte.ts:165` también al abrir podcast.
Encima hay tres capas de estado de voz (`ttsState.voiceChunks/config`,
`useVoiceProfiles.profiles/chunks`, `mainVoiceState.profiles`).

**Fix en dos niveles (el b es separable).**

- **BOOT-2a (S) — dedup de fetch:** en `src/lib/utils/ttsService.ts`, cache de
  la promesa in-flight: `fetchVoiceProfiles(force = false)` devuelve la promesa
  compartida salvo `force`; invalidar tras crear/editar/borrar perfil. Todos
  los callers silenciosos del boot comparten 1 IPC.
- **BOOT-2b (L, opcional) — consolidar estado:** unificar
  `useVoiceProfiles` + `mainVoiceState` sobre `ttsState` (o un único store de
  voz). Refactor de UI de voz: hacerlo después del dedup y con smoke completo
  de `VoiceSettingsModal` + generación TTS.

**Archivos:** `src/lib/utils/ttsService.ts`; para 2b además
`src/stores/mainVoice.svelte.ts`, `src/components/TTSPlayer/useVoiceProfiles.svelte.ts`,
`src/stores/ttsStore.svelte.ts`.
**Esfuerzo:** S (a) / L (b).
**Riesgos:** en 2a, callers que asumen data fresca deben pasar `force` (los
handlers de mainVoice tras operaciones de perfil ya son casos force).
**Verificación:** boot → 1 invoke de voices en logs; cambiar voz en el modal
sigue refrescando chunks; smoke de TTS end-to-end.

### BOOT-3 · `ensureLlamaServers` + health polls al primer mount

**Estado: ✅ implementado (`0c6a500`, backoff simple elegido).** Autostart
diferido 3 s (`LLAMA_AUTOSTART_DELAY_MS` en `@/constants`) en `+layout.svelte`;
pollers (llama + externos) movidos a `createAdaptivePoller`
(`src/lib/utils/adaptivePoller.ts`): skip de ciclos con `document.hidden`,
refresh inmediato al volver al foreground y backoff 15 → 30 → 60 s mientras
algo está caído (reset al ver todo up). El punto 3 (default `llamaAutoStart =
false`) sigue sin hacerse por decisión de UX.

**Problema (verificado).** `+layout.svelte:293-296`: onMount corre
`ensureLlamaServers()` si `llamaAutoStart` (default true) — que además hace
`reconcileLlamaModels` (scan de modelos) y dispara `pollUntilHealthy`.
`+page.svelte:276-277` arranca `startLlamaHealthPolling()` +
`startExternalServicesHealthPolling()`: 2 probes llama + 3 servicios externos
× (probe `/health` + fallback) = hasta ~8 requests cada 15 s, para siempre,
aunque todo esté caído.

**Fix.**

1. **Deferral del autostart (S):** `ensureLlamaServers()` no en el primer
   onMount sino diferido unos segundos (setTimeout 3-5 s o
   `requestIdleCallback`) para no competir con el primer render y el fetch de
   listas. El comportamiento de autostart se conserva.
2. **Polls adaptativos (S/M):** en ambos pollers (llama y servicios externos):
   (a) saltar ciclos con `document.hidden` (visibilitychange), (b) backoff
   suave por servicio caído (15 s → 30 s → 60 s, reset al recuperar).
   Constantes nombradas en cada módulo.
3. **Opcional (M, cambia UX):** `llamaAutoStart` false por defecto + arranque
   on-demand al primer uso de chat/podcast/embeddings. Decidirlo aparte con el
   usuario antes de tocar defaults.

**Archivos:** `src/routes/+layout.svelte`, `src/routes/+page.svelte`,
`src/lib/utils/llamaHealth.ts`, `src/lib/utils/externalServicesHealth.ts`.
**Esfuerzo:** S (1,2) / M (3).
**Riesgos:** el backoff retrasa la detección de un servicio recién caído —
cap en 60 s y reset inmediato al verlo up lo acota.
**Verificación:** timeline de arranque (primer render no espera al spawn);
Network: probes pausadas con la app oculta y espaciadas con servicios caídos;
los dots del toolbar reflejan el estado real al volver a la app.

---

## 4. Verificación global (por cada fase aterrizada)

1. **Tipos:** `bunx svelte-check --tsconfig ./tsconfig.json <archivos
modificados>` (repo rule: por archivo, no repo entero) + `bun run lint`.
2. **Tests:** `bun run test`; si hubo Rust,
   `cargo test --manifest-path src-tauri/Cargo.toml`.
3. **Build:** `bun run build` y comparar pesos de chunks contra el baseline.
4. **Smoke manual por área:** listas (fetch/filtro/paginación), detalle de
   artículo, borrados (individual, selección múltiple, perfil/dominio),
   búsqueda en contenido, chat con streaming, TTS + perfiles de voz, podcast
   start/stop, cambio de workspace (los caches de media/DB deben seguir
   correctos tras el reload).
5. **Métrica de cierre:** repetir el baseline de la sección 0 (invokes por
   fetch de página, timeline de boot) y anotar el delta en este documento.
