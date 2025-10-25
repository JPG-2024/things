<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  let url = $state("");
  let markdown = $state("");
  let imagesSources = $state<string[]>([]);
  let comments = $state<string[]>([]);
  let loading = $state(false);
  let loadingImages = $state(false);
  let error = $state("");
  let errorImages = $state("");

  async function extractUrlToMarkdown(event: Event) {
    event.preventDefault();
    loading = true;
    error = "";
    markdown = "";
    comments = [];

    try {
      markdown = await invoke("extract_url_to_markdown", { url });

      const regex = /<img[^>]+src=["']([^"']+)["']/g;
      const sources = [];

      let match;
      while ((match = regex.exec(markdown)) !== null) {
        sources.push(match[1]);
      }

      imagesSources = sources;
      console.log("Extracted image sources:", imagesSources);

    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }



  async function extractYoutubeComments(event: Event) {
    event.preventDefault();
    loading = true;
    error = "";
    markdown = "";
    comments = [];

    try {
      comments = await invoke("extract_youtube_comments", { url });
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }

  async function extractInstagramComments(event: Event) {
    event.preventDefault();
    loading = true;
    error = "";
    markdown = "";
    comments = [];

    try {
      comments = await invoke("extract_instagram_comments", { url });
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }
</script>

<main class="container">
  <h2>Extract Content</h2>
  <form class="row">
    <input 
      id="url-input" 
      type="url"
      placeholder="Enter URL (e.g., https://youtube.com/watch?v=...)..." 
      bind:value={url}
      required
    />
    <button 
      type="button"
      class="button"
      onclick={extractUrlToMarkdown}
      disabled={loading}
    >
      {loading ? "Extracting..." : "Extract Markdown"}
    </button>
  </form>

  {#if error}
    <div class="error">
      <strong>Error:</strong> {error}
    </div>
  {/if}

  {#if markdown}
    <div class="markdown-container">
      <h3>Extracted Markdown:</h3>
      <pre><code>{markdown}</code></pre>
      <button onclick={() => navigator.clipboard.writeText(markdown)}>
        Copy to Clipboard
      </button>
    </div>
  {/if}

  {#if imagesSources.length}
      <div class="images-container">
      {#each imagesSources as image}
        <img class="image" src="{image}" alt="description">
      {/each}        
      </div>
  {/if}


</main>

<style>

:root {
  border: 8px solid #e0e0e040;
  background:
  
  radial-gradient(
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
  border: 2px solid #ddd;
  border-radius: 8px;
  background-color: transparent;
  padding: 15px;
  max-height: 400px;
  overflow-x: auto;
  overflow-y: auto;
  color: #fafafa;
}

.markdown-container code {
  color: #333;
  color: #fafafa;
  font-size: 14px;
  font-size: 1.2rem;
  line-height: 1.5;
  font-family: "Menlo", monospace;
}

pre, code {
  margin: 0;
  border: none;
  background: none;
  padding: 0;
  color: inherit;
  font-family: inherit;
}

pre {border: 0; background-color: transparent;}

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
