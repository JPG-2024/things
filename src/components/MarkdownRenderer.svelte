<script lang="ts">
  import MarkdownIt from 'markdown-it'

  interface Props {
    content?: string | null
  }

  let { content }: Props = $props()

  // Initialize markdown-it
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  })

  function preprocessContent(text: string): string {
    return text.replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }
</script>

{#if content}
  <div class="markdown-container">
    {@html md.render(preprocessContent(content))}
  </div>
{/if}

<style>
  .markdown-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    color: #fafafa;
    text-align: left;
    word-wrap: break-word;
    font-size: 0.9rem;
    line-height: 1.6;
    font-family: 'Menlo', monospace;
    overflow-wrap: break-word;
  }

  .markdown-container :global(h3) {
    font-size: 1.1rem;
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
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .markdown-container :global(a) {
    color: var(--primary-color);
    text-decoration: underline;
    text-decoration-color: #21cf7591;
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
    color: #fafafa;
    font-weight: bold;
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
