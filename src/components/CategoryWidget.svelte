<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { toVTName, navigate, getRouteForDomain } from '@/lib/utils/url'
  import { categoryCache } from '@/stores/categoryCache'
  import { urlRouter } from '@/lib/urlRouter'
  import Card from '@/components/Card.svelte'

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
</script>

<div class="category-widget">
  {#if name && showTitle}
    <h2 class="category-title">{name}</h2>
  {/if}

  <Card title="Recent articles">
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
  </Card>
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

  .img-flex {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: left;
    width: 100%;
    padding: 12px;
  }

  .img-button {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    border-radius: 0.5rem;
    overflow: hidden;
    transition: transform 0.2s;
  }

  .img-button:hover {
    transform: scale(1.05);
  }

  .mini-img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    display: block;
  }
</style>
