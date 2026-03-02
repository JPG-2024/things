<script lang="ts">
import { onMount } from "svelte";
import { invoke } from "@tauri-apps/api/core";
import CategoryWidget from "@/components/CategoryWidget.svelte";
import InstantResponse from "@/components/InstantResponse.svelte";
import Dropdown from "@/components/inputs/Dropdown.component.svelte";
import Input from "@/components/inputs/Input.component.svelte";
import { urlRouter } from "@/lib/urlRouter";
import { getRouteForDomain, navigate, toVTName } from "@/lib/utils/url";
import { handleYoutubeQuestion } from "@/lib/utils/youtube";
import { storeCacheWrapper } from "@/stores/cacheStore";
import { primaryColor } from "@/stores/uiStore";
import { viewState } from "@/stores/viewStore.svelte";
import { getArticles, type ArticleWithPlayerTask } from "@/stores/tasksStore";

// Data provided by +page.ts load

$effect(() => {
	// generate random svg
	// Generate a random light color (avoid dark tones)
	const randomColor = `rgb(${200 + Math.floor(Math.random() * 56)}, ${200 + Math.floor(Math.random() * 56)}, ${200 + Math.floor(Math.random() * 56)})`;

	primaryColor.set(randomColor);
});

let playerArticles = $state<ArticleWithPlayerTask[]>([]);

onMount(async () => {
	try {
		await invoke("launch_llama_server");
	} catch (error) {
		console.warn("llama-server launch skipped:", error);
	}

	playerArticles = await getArticles();
	console.debug("loaded articles with player tasks", playerArticles);
});

async function handlePasteUrl(url: string) {
	urlRouter(url);
	navigate(`/${getRouteForDomain(url)}/${encodeURIComponent(url)}`);
}
</script>

<div class="dashboard-container">
  <Dropdown
    options={[
      { label: 'Spanish', value: 'es' },
      { label: 'English', value: 'en' },
    ]}
    bind:value={viewState.language}
  ></Dropdown>

  <div class="title-row">
    <h1 class="dashboard-title">Things</h1>
  </div>

  <div class="inputs-container">
    <Input onChange={(url) => handlePasteUrl(url)} />
    <!--     <Input onChange={(prompt) => (viewState.prompt = prompt)} />
    <Input onChange={(query) => (viewState.prompt = query)} /> -->
    <!-- <InstantResponse model="gpt-3.5-turbo" maxTokens={512} /> -->
    <!-- <button onclick={() => handleYoutubeQuestion(viewState.prompt!)}>search</button> -->
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
    font-family: 'Segoe UI', Courier, monospace;
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

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    justify-content: center;
    padding-top: 10px;
  }

  /* The widget-specific styles were moved to `src/components/CategoryWidget.svelte` */
</style>
