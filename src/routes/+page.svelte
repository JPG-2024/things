<script lang="ts">
  import { listen } from '@tauri-apps/api/event'
  import { BaseDirectory, readDir } from '@tauri-apps/plugin-fs'
  import { convertFileSrc } from '@tauri-apps/api/core'
  import { urlRouter } from '../lib/urlRouter'
  import StringReveal from '../components/StringReveal.svelte'
  import { fade } from 'svelte/transition'
  import {
    mainImage,
    title,
    description,
    initFlowStatusListeners,
    cleanAllState,
    domainUrl,
    ytVideoId,
    loaded,
    loading,
    summary,
  } from '../stores/viewStore'

  import LoadingStack from '../components/LoadingStack.svelte'
  //import Toggle from '../components/Toggle.svelte'

  // States
  let listeningClipboard = $state(true)
  let flashy = $state(false)
  let error = $state('')
  let images = $state<{ name: string; src: string }[]>([])
  let mainImageSrc = $derived($mainImage)

  $effect.pre(() => {
    let stopFlow: undefined | (() => void)
    initFlowStatusListeners().then((stop) => (stopFlow = stop))

    let unlistenClipboard: undefined | (() => void)
    listen('clipboard-changed', (event) => {
      handleUrlAction(event.payload as string)
    }).then((u) => (unlistenClipboard = u))

    const flashyInterval = setInterval(() => {
      if ($loading) return

      flashy = true
      setTimeout(() => {
        flashy = false
      }, 2000) // Duración de la animación
    }, 10000)

    return () => {
      stopFlow?.()
      unlistenClipboard?.()
      clearInterval(flashyInterval)
    }
  })

  /*   async function loadImages() {
    const appImagesDir = await homeDir().then((home) => join(home, 'notian', 'images'))
    const files = await readDir('notian/images', { baseDir: BaseDirectory.Home }).catch(() => [])
    const filesObj = files
      .filter((f) => f.name?.match(/\.(png|jpe?g|gif|webp|svg)$/i))
      .map((f) => ({
        name: f.name,
        src: `${appImagesDir}/${f.name}`,
      }))
    images = filesObj
  } */

  async function handleUrlAction(url: string) {
    if (listeningClipboard === false) return

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
</script>

<main
  class="container {$loading ? 'loading' : ''} {flashy ? 'flashy' : ''} {$loaded ? 'loaded' : ''}"
>
  <div class="loading-stack-container">
    {#if $domainUrl}
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
  {#if error}
    <div class="error">
      <strong>Error:</strong>
      {error}
    </div>
  {/if}

  {#if $title}
    <div transition:fade={{ duration: 800 }} class="title">
      <StringReveal message={$title} />
    </div>
  {/if}

  {#if mainImageSrc}
    <div transition:fade={{ duration: 800 }} class="header">
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

  {#if images.length}
    <div class="image-container">
      {#each images as image}
        <img class="image" src={convertFileSrc(image.src)} alt="description" />
      {/each}
    </div>
  {/if}

  {#if $summary}
    <div class="markdown-container">
      <pre><code>{$summary}</code></pre>
      <!--       <button onclick={() => navigator.clipboard.writeText(markdown)}>
        Copy to Clipboard
      </button> -->
    </div>
  {/if}

  <!--   <button 
    type="button"
    class="download-button"
    onclick={downloadImagesHandler}
  >
    {loadingImages ? "Downloading..." : "Download Images"}
  </button> -->
</main>

<style>
  :global(body) {
    margin: 0;

    /*     background: repeating-linear-gradient(
      transparent,
      rgb(0, 0, 0) 34.03%,
      rgb(0, 0, 0) 100%,
      rgb(28, 28, 28)
    );
 */
    height: 100vh;
    overflow: hidden;
  }

  :root {
    color: #ffffff;
    font-weight: 400;
    font-size: 16px;
    line-height: 24px;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;

    * {
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE 10+ */
      &::-webkit-scrollbar {
        background: transparent; /* Chrome/Safari/Webkit */
        width: 0px;
      }
    }
  }

  .container {
    display: flex;
    position: relative; /* seguro, aunque el overlay es fixed */
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    box-sizing: border-box;
    margin: 0;
    background: linear-gradient(-45deg, #21cf7545 10%, #21cf7529 35%, #0a864613 60%, #000000af 90%);
    background-size: 400% 400%;
    background-attachment: fixed;
    padding: 1rem;
    padding-top: 100px;
    height: 100vh;
    overflow-y: auto;
    scroll-behavior: smooth;
    scroll-padding-top: 2rem;
  }

  /* Overlay que barre el viewport cuando .flashy está activo */
  .container.loaded::after {
    position: fixed;
    transform: translateY(-120%);
    z-index: 9999;
    /* opcional para efecto “sheen”: */
    mix-blend-mode: screen;
    animation: sweep-overlay 1s ease-in-out forwards; /* 5s = tu ventana de flashy */
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0) 10%,
      rgba(255, 255, 255, 0.6) 50%,
      rgba(255, 255, 255, 0) 80%,
      rgba(255, 255, 255, 0) 100%
    );
    pointer-events: none; /* que no bloquee clicks */
    content: '';
  }

  @keyframes sweep-overlay {
    from {
      transform: translateY(-120%);
    }
    to {
      transform: translateY(120%);
    }
  }

  .loading {
    animation: gradient 2s ease infinite;
  }

  .flashy {
    animation: flashy 2s ease-in-out infinite;
  }

  @keyframes gradient {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  @keyframes flashy {
    0% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 80% 5%;
    }
    100% {
      background-position: 0% 0%;
    }
  }

  .title {
    padding-top: 1px;
    width: 90vw;
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

  .loading-stack-container {
    display: flex;
    position: fixed;
    top: 0px;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 8px;
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0);
    padding: 2px;
    width: 99vw;
    -webkit-backdrop-filter: blur(5px);
  }

  .controls {
    margin-left: auto;
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
    border: 1px solid #555;
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
    font-size: 0.8rem;
    line-height: 1.5;
    font-family: 'Menlo', monospace;
  }

  pre,
  code {
    margin: 0;
    border: none;
    background: none;
    padding: 0;
    color: inherit;
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
