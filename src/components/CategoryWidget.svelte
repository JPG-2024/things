<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { toVTName, navigate, getRouteForDomain } from '@/lib/utils/url'
  import { categoryCache } from '@/stores/categoryCache'

  let { categoryId, name = '' } = $props()

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

  // No necesitas onDestroy, Svelte maneja la suscripción de $cache automáticamente.
</script>

<div class="category-widget">
  {#if name}
    <h2 class="category-title">{name}</h2>
  {/if}

  <div class="square">
    {#if articles?.length}
      <div class="img-flex">
        {#each articles as article}
          <button
            type="button"
            class="img-button"
            onclick={() =>
              navigate(
                `/${getRouteForDomain(article.domainUrl)}/${encodeURIComponent(article.url)}`
              )}
            aria-label="View article"
          >
            <img
              src={article?.mainImage}
              alt="Article"
              class={`mini-img`}
              style={`view-transition-name: ${toVTName(article?.mainImage)}`}
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

  .square {
    display: flex;
    position: relative;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    border-radius: 12%;
    background: rgb(154, 154, 154, 0.2);
    padding: 15px;
    padding-top: 10px;
    width: 204px;
    height: 204px;
    color: white;
    font-weight: bold;
  }

  .img-flex {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 60px; /* Changed row height */
    gap: 5px;
    padding: 20px;
    padding-top: 10px;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    align-items: start;
  }

  .mini-img {
    border-radius: 15px;
    width: 45px;
    height: 45px;
    object-fit: cover;
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
