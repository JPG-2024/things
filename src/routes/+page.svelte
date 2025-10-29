<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'

  import { BaseDirectory, readDir } from '@tauri-apps/plugin-fs'
  import { convertFileSrc } from '@tauri-apps/api/core'
  import { homeDir, join } from '@tauri-apps/api/path'

  let url = $state('')
  let markdown = $state('')
  let imagesSources = $state<string[]>([])
  let comments = $state<string[]>([])
  let loading = $state(false)
  let loadingImages = $state(false)
  let error = $state('')
  let errorImages = $state('')
  let inferenceStreamContent = $state('')

  let images = $state<{ name: string; src: string }[]>([])

  export async function loadImages() {
    const appImagesDir = await homeDir().then((home) => join(home, 'notian', 'images'))

    console.log('appImagesDir:', appImagesDir)

    const files = await readDir('notian/images', { baseDir: BaseDirectory.Home }).catch((err) => {
      console.error('Error reading images directory:', err)
      return []
    })

    console.log('Archivos en el directorio de imágenes:', files)

    const filesObj = files
      .filter((f) => f.name?.match(/\.(png|jpe?g|gif|webp|svg)$/i))
      .map((f) => ({
        name: f.name,
        src: `${appImagesDir}/${f.name}`, // convierte a una URL segura "asset:"
      }))

    images = filesObj
  }

  async function callInference() {
    try {
      const response = await invoke('inference', {
        prompt: '¿Cuál es la capital de Francia?',
      })
      console.log('Inference response:', response)
    } catch (err) {
      console.error('Inference error:', err)
    }
  }

  async function extractUrlToMarkdown(event: Event) {
    event.preventDefault()
    loading = true
    error = ''
    markdown = ''
    comments = []
    inferenceStreamContent = ''
    imagesSources = []

    try {
      downloadImages()
      markdown = await invoke('extract_url_to_markdown', { url })

      const prompt = `Extrae el contenido principal haz un resumen maximo de un parrafo, en español:\n\n${markdown}`

      await invoke('inference', {
        prompt: prompt,
      })
    } catch (err) {
      error = String(err)
    } finally {
      loading = false
    }
  }

  async function downloadImages() {
    loadingImages = true
    errorImages = ''

    try {
      await invoke('download_images', { url })
      console.log('Imágenes descargadas:', imagesSources)
    } catch (err) {
      errorImages = String(err)
    } finally {
      loadingImages = false
    }
  }

  $effect.pre(() => {
    // Escuchar el evento inference-stream
    listen('inference-stream', (event) => {
      // event.payload.content contiene el chunk recibido
      inferenceStreamContent += event.payload.content
    })

    listen('images-saved', (event) => {
      const paths: string[] = event.payload.paths
      console.log('Imágenes guardadas en:', paths)
      loadImages() // Recargar las imágenes después de guardar nuevas
    })
  })
</script>

<main class="container">
  <form class="row">
    <input
      id="url-input"
      type="url"
      placeholder="Enter URL (e.g., https://youtube.com/watch?v=...)..."
      bind:value={url}
      required
    />
    <button type="button" class="button" onclick={extractUrlToMarkdown} disabled={loading}>
      {loading ? 'Extracting...' : 'Summarize'}
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

  {#if errorImages}
    <div class="error">
      <strong>Error downloading images:</strong>
      {errorImages}
    </div>
  {/if}
</main>

<style>
  :root {
    border: 8px solid #e0e0e040;
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
  }

  .container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin: 0;
    height: 100vh;
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
    margin-top: 20px;
    max-width: 100%;
    color: #fafafa;
    text-align: left;
  }

  .markdown-container pre {
    background-color: transparent;
    padding: 15px;
    max-height: 400px;
    overflow-y: auto;
    color: #fafafa;
    white-space: pre-wrap; /* Permite el wrap */
    word-break: break-word;
  }

  .markdown-container code {
    color: #fafafa;
    font-size: 1rem;
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
    margin-top: 10px;
    border: none;
    background-color: #4caf50;
    color: white;
  }

  .markdown-container button:hover {
    border-color: #45a049;
    background-color: #45a049;
  }

  .download-button {
    margin-top: 20px;
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
