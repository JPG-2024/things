<script lang="ts">
  import { toVTName } from '@/lib/utils/url'
  import { viewState } from '@/stores/viewStore.svelte'
  import { page } from '$app/state'

  const articleUrl = page.params.url

  import PostView from '@/components/PostView.svelte'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
</script>

<PostView headerContent={headerContentSnippet} summaryContent={summaryContentSnippet} />

{#snippet headerContentSnippet()}
  <img
    class="image"
    src={viewState.mainImageSrc}
    alt={viewState.title}
    style={`view-transition-name: vt-main-image-${toVTName(articleUrl!)}`}
  />

  <div class="description">{viewState.description}</div>

  <!--   {#if viewState.ytVideoId}
    <iframe
      class="yt-video"
      width="560"
      height="315"
      src={`https://www.youtube.com/embed/${viewState.ytVideoId}`}
      title="YouTube video player"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  {/if} -->
{/snippet}

{#snippet summaryContentSnippet()}
  <MarkdownRenderer content={viewState.summary} />
{/snippet}

<style>
  .image {
    aspect-ratio: 16/9;
    border-radius: 12px;
    width: 100%;
    height: 300px;
    object-fit: cover;
    will-change: transform, opacity;
    transform: translateZ(0);

    @media screen and (min-width: 768px) {
      max-height: 400px;
    }
  }

  .description {
    padding-left: 5px;
    color: var(--primary-color);
    font-weight: bold;
    font-size: 0.9rem;
    line-height: 1.6;
    font-family: 'Menlo', monospace;
    text-align: left;
  }

  .yt-video {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    border: 1px solid #555;
    border-radius: 8px;
    min-height: 350px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
