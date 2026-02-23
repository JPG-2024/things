<script lang="ts">
  import MarkdownIt from 'markdown-it'

  interface Props {
    content?: string | null
    fontSize?: string | number
  }

  export type MarkdownRendererProps = Props
  const DEFAULT_FONT_SIZE = 0.9

  let { content, fontSize = DEFAULT_FONT_SIZE }: Props = $props()

  // Initialize markdown-it
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  })

  function preprocessContent(text: string): string {
    let processed = text.replace(/\\n/g, '\n').replace(/\\"/g, '"')

    // Handle 陇 tags for reasoning models
    // Replace opening tag with details/summary
    processed = processed.replace(
      /陇/g,
      '<details class="thought-process"><summary>Thought Process</summary><div class="thought-content">'
    )

    // Replace closing tag
    processed = processed.replace(/<\/think>/g, '</div></details>')

    // Handle unclosed tag (streaming)
    const lastOpen = processed.lastIndexOf('<details class="thought-process">')
    const lastClose = processed.lastIndexOf('</details>')
    if (lastOpen > lastClose) {
      processed += '</div></details>'
    }

    return processed
  }
</script>

{#if content}
  <!-- apply computed font size -->
  <div class="markdown-container" style="font-size: {fontSize}rem;">
    {@html md.render(preprocessContent(content))}
  </div>
{/if}

<style>
  .markdown-container {
    font-family: 'Noto Sans Mono Thin', monospace;
    display: flex;
    flex-direction: column;
    width: 100%;
    color: #fafafa;
    text-align: left;
    word-wrap: break-word;
    font-size: 1rem;
    line-height: 1.6;
    overflow-wrap: break-word;
  }

  /* Styles for thought process */
  .markdown-container :global(.thought-process) {
    margin-bottom: 1rem;
    border: 1px solid #333;
    border-radius: 6px;
    background-color: #1a1a1a;
  }

  .markdown-container :global(.thought-process summary) {
    padding: 0.5rem 1rem;
    cursor: pointer;
    color: #888;
    font-size: 1rem;
    user-select: none;
  }

  .markdown-container :global(.thought-process summary:hover) {
    color: #aaa;
    background-color: #222;
  }

  .markdown-container :global(.thought-content) {
    padding: 1rem;
    border-top: 1px solid #333;
    color: #aaa;
    font-size: 0.85rem;
    font-style: italic;
  }

  .markdown-container :global(h3) {
    font-size: 1.1em;
  }

  .markdown-container :global(h1),
  .markdown-container :global(h2),
  .markdown-container :global(h3),
  .markdown-container :global(h4),
  .markdown-container :global(h5),
  .markdown-container :global(h6) {
    color: var(--primary-color);
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
    background-color: rgba(154, 154, 154, 0.2);
    padding: 2px 6px;
    color: #fafafa;
    font-size: 1rem;
  }

  .markdown-container :global(pre) {
    margin: 1rem 0;
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    background-color: rgba(154, 154, 154, 0.1);
    padding: 15px;
    overflow-x: auto;
  }

  .markdown-container :global(pre code) {
    border-radius: 0;
    background-color: transparent;
    padding: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .markdown-container :global(a) {
    color: var(--primary-color);
    text-decoration: underline;
    text-decoration-color: var(--primary-color);
  }

  .markdown-container :global(a:hover) {
    color: var(--primary-color);
  }

  .markdown-container :global(ul),
  .markdown-container :global(ol) {
    margin: 1rem 0 1rem 2rem;
    padding: 0;
  }

  .markdown-container :global(ul) {
    margin-left: 24px;
  }

  .markdown-container :global(li) {
    margin: 0.5rem 0;
  }

  .markdown-container :global(blockquote) {
    margin: 1rem 0;
    border-left: 4px solid var(--primary-color);
    padding-left: 1rem;
    color: #d0d0d0;
    font-style: italic;
  }

  .markdown-container :global(strong) {
    color: var(--primary-color);
    font-weight: bold;
    font-size: 1em;
  }

  .markdown-container :global(em) {
    font-style: italic;
  }

  .markdown-container :global(img) {
    margin: 1rem 0;
    border-radius: 8px;
    height: auto;
  }

  .markdown-container :global(table) {
    margin: 1rem 0;
    border-collapse: collapse;
    width: 100%;
  }

  .markdown-container :global(th),
  .markdown-container :global(td) {
    border: 1px solid var(--primary-color);
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
