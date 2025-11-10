<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { convertFileSrc } from '@tauri-apps/api/core'
  import MarkdownIt from 'markdown-it'
  import { urlRouter } from '../../../lib/urlRouter'
  import { getArticleByUrl } from '../../../lib/database'
  import StringReveal from '../../../components/StringReveal.svelte'
  import { toVTName, navigate } from '../../../lib/utils/url'
  import { fade } from 'svelte/transition'
  import {
    mainImage,
    title,
    description,
    cleanAllState,
    domainUrl,
    ytVideoId,
    isYouTube,
    loading,
    loaded,
    summary,
    setAllViewStoreValues,
  } from '../../../stores/viewStore'

  import LoadingStack from '../../../components/LoadingStack.svelte'
  //import Toggle from '../components/Toggle.svelte'

  // Initialize markdown-it
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  })

  // States
  let error = $state('')
  let images = $state<{ name: string; src: string }[]>([])

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
      <button onclick={() => navigate('/')} class="back-navigation">⬅</button>
      <img
        class="favicon"
        src="https://www.google.com/s2/favicons?sz=64&domain={$domainUrl}"
        alt=""
      />
    {/if}
    <LoadingStack />
  </div>

  {#if $title}
    <div class="title">
      <StringReveal message={$title} />
    </div>
  {/if}

  <div class="header">
    <img
      class="image"
      src={$mainImage}
      alt="main"
      style="view-transition-name: {toVTName($mainImage)}"
    />

    <div class="description">{$description}</div>
  </div>

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
      {@html md.render($summary)}
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
    z-index: 10;
    box-sizing: border-box;
  }

  .back-navigation {
    all: unset; /* Removes *all* inherited and default styles */
    cursor: pointer; /* Add back pointer for usability */
    border-radius: 8px;
    padding: 0px 10px;
    padding-top: 5px;
    font-size: 25px;
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

  .description {
    color: #fafafa;
    font-size: 0.9rem;
    line-height: 1.6;
    font-family: 'Menlo', monospace;
    text-align: left;
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
    align-items: flex-start;
    max-width: 90%;
    color: #fafafa;
    text-align: left;
    word-wrap: break-word;
    line-height: 1.6;
    font-family: 'Menlo', monospace;
    overflow-wrap: break-word;
  }

  .markdown-container :global(h1),
  .markdown-container :global(h2),
  .markdown-container :global(h3),
  .markdown-container :global(h4),
  .markdown-container :global(h5),
  .markdown-container :global(h6) {
    margin: 1rem 0 0.5rem 0;
    color: #21cf75;
    font-weight: bold;
  }

  .markdown-container :global(h1) {
    font-size: 1.8rem;
  }

  .markdown-container :global(h2) {
    font-size: 1.5rem;
  }

  .markdown-container :global(h3) {
    font-size: 1.3rem;
  }

  .markdown-container :global(p) {
    margin: 0.8rem 0;
    line-height: 1.8;
  }

  .markdown-container :global(code) {
    border-radius: 4px;
    background-color: rgba(154, 154, 154, 0.15);
    padding: 2px 6px;
    color: #fafafa;
    font-size: 0.9rem;
  }

  .markdown-container :global(pre) {
    margin: 1rem 0;
    border: 1px solid #21cf7536;
    border-radius: 8px;
    background-color: rgba(154, 154, 154, 0.1);
    padding: 15px;
    overflow-x: auto;
  }

  .markdown-container :global(pre code) {
    border-radius: 0;
    background-color: transparent;
    padding: 0;
  }

  .markdown-container :global(a) {
    color: #21cf75;
    text-decoration: underline;
    text-decoration-color: #21cf7591;
  }

  .markdown-container :global(a:hover) {
    color: #29ff85;
  }

  .markdown-container :global(ul),
  .markdown-container :global(ol) {
    margin: 1rem 0 1rem 2rem;
    padding: 0;
  }

  .markdown-container :global(li) {
    margin: 0.5rem 0;
  }

  .markdown-container :global(blockquote) {
    margin: 1rem 0;
    border-left: 4px solid #21cf75;
    padding-left: 1rem;
    color: #d0d0d0;
    font-style: italic;
  }

  .markdown-container :global(strong) {
    color: #fafafa;
    font-weight: bold;
  }

  .markdown-container :global(em) {
    font-style: italic;
  }

  .markdown-container :global(img) {
    margin: 1rem 0;
    border-radius: 8px;
    max-width: 100%;
    height: auto;
  }

  .markdown-container :global(table) {
    margin: 1rem 0;
    border-collapse: collapse;
    width: 100%;
  }

  .markdown-container :global(th),
  .markdown-container :global(td) {
    border: 1px solid #21cf7536;
    padding: 10px;
    text-align: left;
  }

  .markdown-container :global(th) {
    background-color: rgba(33, 207, 117, 0.1);
    font-weight: bold;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
