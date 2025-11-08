<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { convertFileSrc } from '@tauri-apps/api/core'
  import { urlRouter } from '../../../lib/urlRouter'
  import { getArticleByUrl } from '../../../lib/database'
  import StringReveal from '../../../components/StringReveal.svelte'
  import { fade } from 'svelte/transition'
  import {
    mainImage,
    title,
    description,
    cleanAllState,
    domainUrl,
    ytVideoId,
    loading,
    loaded,
    summary,
    setAllViewStoreValues,
  } from '../../../stores/viewStore'

  import LoadingStack from '../../../components/LoadingStack.svelte'
  //import Toggle from '../components/Toggle.svelte'

  // States
  let error = $state('')
  let images = $state<{ name: string; src: string }[]>([])
  let mainImageSrc = $derived($mainImage)

  async function handleUrlAction(url: string) {
    loading.set(true)

    try {
      cleanAllState()
      await urlRouter(url)
    } catch (err) {
      error = String(err)
    } finally {
      loading.set(false)
    }
  }

  // On first render, read route param according to SvelteKit docs and
  // try DB first; if not present, route the URL to the extractor.
  onMount(async () => {
    try {
      // Access route param; depending on environment, `page` may not be a store, so use direct access
      const paramUrl = (page as any)?.params?.url as string | undefined
      if (!paramUrl) return
      const decodedUrl = decodeURIComponent(paramUrl)

      const existing = await getArticleByUrl(decodedUrl)
      if (existing) {
        cleanAllState()
        setAllViewStoreValues(existing)
        loaded.set(true)
        loading.set(false)
        return
      }

      // Fallback to full routing pipeline
      await handleUrlAction(decodedUrl)
    } catch (err) {
      error = String(err)
    }
  })
</script>

<article>
  <div class="top-bar">
    {#if $domainUrl}
      <a href="/" class="back-navigation">⬅</a>
      <img
        class="favicon"
        src="https://www.google.com/s2/favicons?sz=64&domain={$domainUrl}"
        alt=""
      />
    {/if}
    <LoadingStack />

    <!--     <div class="controls">
      <Toggle label="listen" bind:checked={listeningClipboard} />
    </div> -->
  </div>
  <!--   {#if error}
    <div class="error">
      <strong>Error:</strong>
      {error}
    </div>
  {/if} -->

  {#if $title}
    <div class="title">
      <StringReveal message={$title} />
    </div>
  {/if}

  {#if mainImageSrc}
    <div class="header">
      <img class="image" src={mainImageSrc} alt="main" />
      <StringReveal message={$description} />
    </div>
  {/if}

  {#if $ytVideoId}
    <iframe
      class="yt-video"
      width="560"
      height="315"
      src={`https://www.youtube.com/embed/${$ytVideoId}`}
      title="YouTube video player"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  {/if}

  <!--   {#if images.length}
    <div class="image-container">
      {#each images as image}
        <img class="image" src={convertFileSrc(image.src)} alt="description" />
      {/each}
    </div>
  {/if} -->

  {#if $summary}
    <div class="markdown-container">
      <pre><code>{$summary}</code></pre>
      <!--       <button onclick={() => navigator.clipboard.writeText(markdown)}>
        Copy to Clipboard
      </button> -->
    </div>
  {/if}
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding-top: 100px;
  }
  .title {
    padding-top: 1px;
    width: 90vw;
    text-decoration: underline;
    text-decoration-color: #21cf7591;
    text-underline-offset: 4px;
  }
  .title :global(.revealer) {
    width: fit-content;
    font-size: 1.4rem;
    font-family: monospace;
  }

  .header {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 15px;
    width: 90vw;
  }

  .top-bar {
    display: flex;
    position: fixed;
    top: 0px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(244, 201, 201, 0);
    min-height: 75px;
    -webkit-backdrop-filter: blur(5px);
    right: 0;
    left: 0;
    box-sizing: border-box;
  }

  .back-navigation {
    transition: background-color 0.2s ease-in-out;
    border-radius: 8px;
    padding: 4px 8px;
    color: #ffffff;
    font-weight: bold;
    font-size: 1.5rem;
    text-decoration: none;
  }

  .favicon {
    border-radius: 8px;
    width: 32px;
    height: 32px;
  }

  .header :global(.revealer) {
    align-self: flex-start;
    width: fit-content;
    font-size: 0.8rem;
    text-align: left;
  }

  .image-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: auto;
  }

  .image {
    border: 1px solid #ddd;
    border-radius: 8px;
    max-height: 150px;
    object-fit: cover;
  }

  .yt-video {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    border: 1px solid #555;
    border-radius: 8px;
    width: 90vw;
    min-height: 350px;
  }

  .markdown-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    color: #fafafa;
    text-align: left;
  }

  .markdown-container pre {
    /*     border-right: 1px solid #21cf7536;
    border-left: 1px solid #21cf7536; */
    border-radius: 8px;
    background-color: rgb(154, 154, 154, 0.1);
    padding: 15px;
    max-width: 90%;
    overflow: hidden;
    overflow-y: auto;
    color: #fafafa;
    text-align: left;
    white-space: pre-wrap; /* Permite el wrap */
    word-break: break-word;

    ::-webkit-scrollbar {
      background: transparent;
      width: 0px;
    }
  }

  .markdown-container code {
    color: #fafafa;
    font-weight: 400;
    font-size: 1rem;
    line-height: 1.6;
    font-family: 'Menlo', monospace;
  }

  pre,
  code {
    margin: 0;
    border: none;
    background: none;
    padding: 0;
    color: inherit;
    line-height: 2;
    font-family: inherit;
  }

  pre {
    border: 0;
    background-color: transparent;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
