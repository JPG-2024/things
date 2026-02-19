<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { toVTName, navigate, getRouteForDomain } from '@/lib/utils/url'
  import { categoryCache } from '@/stores/categoryCache'
  import { urlRouter } from '@/lib/urlRouter'

  let { categoryId, name = '', showTitle = false } = $props()

  const limit = 9

  // Inicias la carga (esto está bien aquí)
  categoryCache.load(categoryId, { limit })

  // Lógica reactiva con Svelte 5 (Rune mode)
  // 1. Calculamos la key reactivamente
  const key = $derived(`${categoryId}-${JSON.stringify({ limit })}`)

  // 2. Accedemos al segmento usando la sintaxis $categoryCache (auto-suscripción)
  // Svelte 5 permite usar $ en stores locales
  const segment = $derived($categoryCache.segments[key])
  // 3. Derivamos los estados finales.
  // Al ser $derived, siempre estarán actualizados antes del render.
  const articles = $derived(segment?.data || [])
  const loading = $derived(segment?.loading || false)
  const error = $derived(segment?.error || null)

  async function handleNavigateToArticle(article: Article) {
    await urlRouter(article.url)
    navigate(`/${getRouteForDomain(article.domainUrl)}/${encodeURIComponent(article.url)}`)
  }

  async function handleSquareDoubleClick() {
    try {
      const text = await navigator.clipboard.readText()
      // Llama a tu callback con `text`
    } catch (err) {
      console.error('Clipboard error', err)
    }
  }
</script>

<div class="category-widget">
  {#if name && showTitle}
    <h2 class="category-title">{name}</h2>
  {/if}

  <div class="widget" ondblclick={handleSquareDoubleClick} role="group">
    {#if articles?.length}
      <div class="img-flex">
        {#each articles as article (article.url)}
          <button
            type="button"
            class="img-button"
            onclick={() => handleNavigateToArticle(article)}
            aria-label="View article"
          >
            <img
              src={article.mainImageSrc}
              alt="Article"
              class={`mini-img`}
              style={`view-transition-name: vt-main-image-${toVTName(article.url)}`}
            />
          </button>
        {/each}
      </div>
    {:else if loading}
      <span>Loading articles...</span>
    {:else if error}
      <span class="error">Error loading articles: {error.message}</span>
    {:else}
      <span>No articles found.</span>
    {/if}
    <div class="widget-corner"></div>
  </div>
</div>

<style>
  .category-widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
  }

  .category-title {
    transform: translateY(10px);
    margin: 0 0 0.5rem 0;
    color: var(--primary-color);
    font-weight: 600;
    font-size: 1.2rem;
    font-family: 'Segoe UI', Courier, monospace;
  }

  .error {
    color: red;
    font-size: 0.9rem;
  }

  .widget {
    position: relative;
    width: 280px;
    height: 280px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    border-radius: 30px;
    padding: 15px;
    overflow: hidden;
  }

  /* Esquina superior izquierda + lado superior */
  .widget::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 60%; /* Cubre 60% del ancho superior */
    height: 2px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.8) 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    border-radius: 30px 0 0 0;
  }

  .widget::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 2px;
    height: 60%; /* Cubre 60% de la altura izquierda */
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.8) 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    border-radius: 30px 0 0 0;
  }

  /* Esquina inferior derecha + lado inferior (usando span o elemento extra) */
  .widget-corner {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 60%;
    height: 60%;
    pointer-events: none;
  }

  .widget-corner::before {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(
      270deg,
      rgba(255, 255, 255, 0.8) 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    border-radius: 0 0 30px 0;
  }

  .widget-corner::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 2px;
    height: 100%;
    background: linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.8) 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%
    );
    border-radius: 0 0 30px 0;
  }

  .img-flex {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 10px;
    padding-top: 10px;
    box-sizing: border-box;
    width: 100%;
    height: auto; /* Changed from 100% to auto */
    align-items: start;
  }

  .mini-img {
    border-radius: 15px;
    width: 45px;
    height: 45px;
    object-fit: cover;
    will-change: transform, opacity;
    transform: translateZ(0);
  }

  .img-button {
    transition: transform 0.2s ease-in-out;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  .yt-button::after {
    position: absolute;
    top: 58%;
    left: 50%;
    transform: translate(-50%, -50%);
    content: '▶';
    color: rgb(255, 0, 0);
    font-size: 24px;
  }

  .img-button:hover {
    transform: scale(1.05);
  }

  .img-button:active {
    transform: scale(0.98);
  }
</style>
