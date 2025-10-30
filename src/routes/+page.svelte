<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import { BaseDirectory, readDir } from '@tauri-apps/plugin-fs'
  import { convertFileSrc } from '@tauri-apps/api/core'
  import { homeDir, join } from '@tauri-apps/api/path'
  import { urlRouter } from '../lib/urlRouter'

  let url = $state('')
  let loading = $state(false)
  let error = $state('')
  let inferenceStreamContent = $state('')
  let images = $state<{ name: string; src: string }[]>([])

  $effect.pre(() => {
    listen('inference-stream', (event) => {
      const payload = event.payload as { content: string }
      inferenceStreamContent += payload.content
    })
    listen('images-saved', (event) => {
      const { paths } = event.payload as { paths: string[] }
      loadImages()
    })
  })

  async function loadImages() {
    const appImagesDir = await homeDir().then((home) => join(home, 'notian', 'images'))
    const files = await readDir('notian/images', { baseDir: BaseDirectory.Home }).catch(() => [])
    const filesObj = files
      .filter((f) => f.name?.match(/\.(png|jpe?g|gif|webp|svg)$/i))
      .map((f) => ({
        name: f.name,
        src: `${appImagesDir}/${f.name}`,
      }))
    images = filesObj
  }

  async function handleUrlAction(event: Event) {
    event.preventDefault()
    loading = true
    error = ''
    inferenceStreamContent = ''
    try {
      await urlRouter(url)
    } catch (err) {
      error = String(err)
    } finally {
      loading = false
    }
  }
</script>

<main class="container">
  <form>
    <input
      id="url-input"
      type="url"
      placeholder="Enter URL (e.g., https://youtube.com/watch?v=...)..."
      bind:value={url}
      required
    />
    <button type="button" class="button" onclick={handleUrlAction} disabled={loading}>
      {loading ? 'Procesando...' : 'Procesar'}
    </button>
  </form>

  {#if error}
    <div class="error">
      <strong>Error:</strong>
      {error}
    </div>
  {/if}

  {#if images.length}
    <div class="image-container">
      {#each images as image}
        <img class="image" src={convertFileSrc(image.src)} alt="description" />
      {/each}
    </div>
  {/if}

  {#if inferenceStreamContent}
    <div class="markdown-container">
      <pre><code>{inferenceStreamContent}</code></pre>
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
  :root {
    background: radial-gradient(
      circle at top right,
      transparent 0,
      rgba(0, 0, 0, 1) 60px,
      rgba(28, 28, 28, 1) 50%,
      rgb(86, 9, 76) 100%
    );
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
    flex-direction: column;
    justify-content: center;
    margin: 0;
    height: 95vh;
    text-align: center;
  }

  input {
    &:active {
      border-color: #ff32fc;
    }
    &:focus {
      box-shadow: 0 0 0 5px rgba(255, 186, 237, 0.3);
    }
  }

  form {
    padding: 1em;
  }

  input,
  button {
    transition: border-color 0.25s;
    box-shadow: none;
    border: 8px solid #e0e0e040;
    border-radius: 8px;
    background-color: transparent;
    padding: 0.6em 1.2em;
    color: #0f0f0f;
    font-weight: 500;
    font-size: 1em;
    font-family: inherit;
  }

  button:hover {
    border-color: #396cd8;
  }
  button:active {
    border-color: #396cd8;
    background-color: #e8e8e8;
  }

  #url-input {
    flex: 1;
    margin-right: 5px;
    min-width: 300px;
  }

  .image-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: auto;
  }

  .image {
    margin: 10px;
    border: 2px solid #ddd;
    border-radius: 8px;
    max-width: 200px;
    max-height: 200px;
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
    background-color: rgb(154, 154, 154, 0.2);
    padding: 4px;
    padding: 15px;
    max-width: 90%;
    max-height: 74vh;
    overflow-y: auto;
    color: #fafafa;
    white-space: pre-wrap; /* Permite el wrap */
    word-break: break-word;

    ::-webkit-scrollbar {
      background: transparent;
      width: 0px;
    }
  }

  .markdown-container code {
    color: #fafafa;
    font-size: 0.9rem;
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

  .markdown-container button {
    border: none;
    background-color: #4caf50;
    color: white;
  }

  .markdown-container button:hover {
    border-color: #45a049;
    background-color: #45a049;
  }

  .download-button {
    border: none;
    background-color: #2196f3;
    padding: 0.8em 1.6em;
    color: white;
  }

  .download-button:hover {
    border-color: #0b7dda;
    background-color: #0b7dda;
  }

  .download-button:disabled {
    cursor: not-allowed;
    background-color: #999;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }

    input,
    button {
      border: 2px solid #999;
      background-color: transparent;
      color: #ffffff;
    }
    button:active {
      background-color: #0f0f0f69;
    }
  }
</style>
