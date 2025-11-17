<script lang="ts">
  import StringReveal from '@/components/StringReveal.svelte'
  import { toVTName } from '@/lib/utils/url'
  import { mainImage, ytVideoId, summary } from '@/stores/viewStore'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'

  import PostView from '@/components/PostView.svelte'
</script>

<PostView headerContent={headerContentSnippet} summaryContent={summaryContentSnippet} />

{#snippet headerContentSnippet()}
  <iframe
    class="yt-video"
    width="560"
    height="315"
    src={`https://www.youtube.com/embed/${$ytVideoId}`}
    title="YouTube video player"
    frameborder="0"
    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
    style="view-transition-name: {toVTName($mainImage)}"
  ></iframe>
{/snippet}

{#snippet summaryContentSnippet()}
  <MarkdownRenderer content={$summary} />
{/snippet}

<style>
  .yt-video {
    box-shadow: 0 0px 10px var(--primary-color);

    border-radius: 8px;
    width: 90vw;
    min-height: 350px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
