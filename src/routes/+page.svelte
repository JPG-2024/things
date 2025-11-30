<script lang="ts">
  import { toVTName, navigate, getRouteForDomain } from '@/lib/utils/url'
  import { storeCacheWrapper } from '@/stores/cacheStore'
  import { urlRouter } from '@/lib/urlRouter'

  import Input from '@/components/inputs/Input.component.svelte'
  import CategoryWidget from '@/components/CategoryWidget.svelte'
  import { primaryColor } from '@/stores/uiStore'
  // Data provided by +page.ts load

  $effect(() => {
    // generate random svg
    // Generate a random light color (avoid dark tones)
    const randomColor = `rgb(${200 + Math.floor(Math.random() * 56)}, ${200 + Math.floor(Math.random() * 56)}, ${200 + Math.floor(Math.random() * 56)})`

    primaryColor.set(randomColor)
  })

  async function handlePasteUrl(url: string) {
    urlRouter(url)
    navigate(`/${getRouteForDomain(url)}/${encodeURIComponent(url)}`)
  }
</script>

<div class="dashboard-container">
  <h1 class="dashboard-title">Things</h1>

  <Input onChange={(url) => handlePasteUrl(url)} />

  <div class="flex-squares">
    {#each ['Unsorted', 'Technology', 'Psychology', 'Health', 'IA', 'Music'] as categoryId}
      <CategoryWidget {categoryId} name={categoryId} />
    {/each}
  </div>
</div>

<style>
  .dashboard-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
    padding: 20px;
    width: 100%;
  }

  .dashboard-title {
    margin-bottom: 1rem;
    color: var(--primary-color);
    font-size: 2.2rem;
    font-family: 'JetBrains Mono', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }

  .flex-squares {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    margin-top: 2rem;
    width: 100%;
  }

  .square {
    position: relative;
    align-items: center;
    border-radius: 20%;
    background: rgb(154, 154, 154, 0.1);
    padding: 30px;
    width: 204px;
    height: 204px;
    color: white;
    font-weight: bold;
  }

  /* The widget-specific styles were moved to `src/components/CategoryWidget.svelte` */
</style>
