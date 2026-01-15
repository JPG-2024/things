<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { toVTName, navigate, getRouteForDomain } from '@/lib/utils/url'
  import { storeCacheWrapper } from '@/stores/cacheStore'
  import { urlRouter } from '@/lib/urlRouter'
  import { handleYoutubeQuestion } from '@/lib/utils/youtube'

  import Input from '@/components/inputs/Input.component.svelte'
  import CategoryWidget from '@/components/CategoryWidget.svelte'
  import { primaryColor } from '@/stores/uiStore'
  import { viewState } from '@/stores/viewStore.svelte'
  import { query } from '$app/server'
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

  <div class="inputs-container">
    <Input onChange={(url) => handlePasteUrl(url)} />
    <!--     <Input onChange={(prompt) => (viewState.prompt = prompt)} />
    <Input onChange={(query) => (viewState.prompt = query)} />
    <button onclick={() => handleYoutubeQuestion(viewState.prompt!)}>search</button> -->
  </div>

  <div class="flex-squares">
    {#each ['Unsorted'] as categoryId}
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

  .inputs-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 800px;
    margin-bottom: 2rem;
  }

  /* The widget-specific styles were moved to `src/components/CategoryWidget.svelte` */
</style>
