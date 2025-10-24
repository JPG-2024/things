<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  let url = $state("");
  let markdown = $state("");
  let comments = $state<string[]>([]);
  let loading = $state(false);
  let error = $state("");

  async function extractUrlToMarkdown(event: Event) {
    event.preventDefault();
    loading = true;
    error = "";
    markdown = "";
    comments = [];

    try {
      markdown = await invoke("extract_url_to_markdown", { url });
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
</script>

<main class="container">
  <h2>Extract Content</h2>
  <form class="row">
    <input 
      id="url-input" 
      type="url"
      placeholder="Enter URL (e.g., https://youtube.com/watch?v=... or any website)..." 
      bind:value={url}
      required
    />
    <button 
      type="button"
      onclick={extractUrlToMarkdown}
      disabled={loading}
    >
      {loading ? "Extracting..." : "Extract Markdown"}
    </button>
    <button 
      type="button"
      onclick={extractYoutubeComments}
      disabled={loading}
      style="margin-left: 5px; background-color: #ff0000;"
    >
      {loading ? "Extracting..." : "Extract Comments"}
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

  {#if comments.length > 0}
    <div class="comments-container">
      <h3>YouTube Comments ({comments.length})</h3>
      <div class="comments-list">
        {#each comments as comment, index}
          <div class="comment-item">
            <span class="comment-number">#{index + 1}</span>
            <p>{comment}</p>
          </div>
        {/each}
      </div>
      <button onclick={() => navigator.clipboard.writeText(comments.join('\n\n'))}>
        Copy All Comments
      </button>
    </div>
  {/if}
</main>

<style>

:root {
  background-color: #f6f6f6;

  color: #0f0f0f;
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
  padding-top: 10vh;
  text-align: center;
}

.logo {
  transition: 0.75s;
  will-change: filter;
  padding: 1.5em;
  height: 6em;
}

.logo.tauri:hover {
  filter: drop-shadow(0 0 2em #24c8db);
}

.row {
  display: flex;
  justify-content: center;
}

a {
  color: #646cff;
  font-weight: 500;
  text-decoration: inherit;
}

a:hover {
  color: #535bf2;
}

h1 {
  text-align: center;
}

input,
button {
  transition: border-color 0.25s;
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: #ffffff;
  padding: 0.6em 1.2em;
  color: #0f0f0f;
  font-weight: 500;
  font-size: 1em;
  font-family: inherit;
}

button {
  cursor: pointer;
}

button:hover {
  border-color: #396cd8;
}
button:active {
  border-color: #396cd8;
  background-color: #e8e8e8;
}

input,
button {
  outline: none;
}

#greet-input {
  margin-right: 5px;
}

#url-input {
  flex: 1;
  margin-right: 5px;
  min-width: 300px;
}

.error {
  margin-top: 10px;
  border: 1px solid #d32f2f;
  border-radius: 8px;
  background-color: #ffebee;
  padding: 10px;
  color: #d32f2f;
}

.markdown-container {
  margin-top: 20px;
  max-width: 100%;
  text-align: left;
}

.markdown-container pre {
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #f5f5f5;
  padding: 15px;
  max-height: 400px;
  overflow-x: auto;
  overflow-y: auto;
}

.markdown-container code {
  color: #333;
  font-size: 14px;
  line-height: 1.5;
  font-family: "Courier New", monospace;
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

.comments-container {
  margin-top: 20px;
  max-width: 100%;
  text-align: left;
  padding: 0 20px;
}

.comments-list {
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #f5f5f5;
  padding: 15px;
  max-height: 500px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.comment-item {
  padding: 10px;
  margin-bottom: 10px;
  border-left: 3px solid #396cd8;
  background-color: #ffffff;
  border-radius: 4px;
}

.comment-number {
  display: inline-block;
  background-color: #396cd8;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  margin-right: 8px;
}

.comment-item p {
  margin: 5px 0 0 0;
  color: #333;
  line-height: 1.5;
  word-wrap: break-word;
}

.comments-container button {
  margin-top: 10px;
  border: none;
  background-color: #ff6b6b;
  color: white;
}

.comments-container button:hover {
  background-color: #ff5252;
}

@media (prefers-color-scheme: dark) {
  :root {
    background-color: #2f2f2f;
    color: #f6f6f6;
  }

  a:hover {
    color: #24c8db;
  }

  input,
  button {
    background-color: #0f0f0f98;
    color: #ffffff;
  }
  button:active {
    background-color: #0f0f0f69;
  }
}

</style>
