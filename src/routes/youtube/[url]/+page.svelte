<script lang="ts">
  import StringReveal from '@/components/StringReveal.svelte'
  import { toVTName } from '@/lib/utils/url'
  import { mainImage, ytVideoId, summary, ytThumbnailUrl } from '@/stores/viewStore'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'

  import PostView from '@/components/PostView.svelte'
  let showIframe = false
</script>

<PostView headerContent={headerContentSnippet} summaryContent={summaryContentSnippet} />

{#snippet headerContentSnippet()}
  {#if $ytVideoId}
    <div class="yt-wrapper">
      {#if showIframe}
        <iframe
          class="yt-video"
          src={`https://www.youtube-nocookie.com/embed/${$ytVideoId}?autoplay=1&rel=0&modestbranding=1`}
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          style="view-transition-name: {toVTName($mainImage || $ytThumbnailUrl)}"
        ></iframe>
      {:else}
        <button
          class="yt-thumbnail-btn"
          onclick={() => (showIframe = true)}
          aria-label="Play video"
        >
          <img
            src={$ytThumbnailUrl || $mainImage}
            alt="YouTube thumbnail"
            class="yt-thumbnail"
            loading="lazy"
            style="view-transition-name: {toVTName($ytThumbnailUrl || $mainImage)}"
          />
        </button>

        <button
          class="yt-play"
          onclick={() => (showIframe = true)}
          aria-label="Play video"
          title="Play video"
        >
          ▶
        </button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet summaryContentSnippet()}
  <MarkdownRenderer content={$summary} />
{/snippet}

<style>
  .yt-video {
    /* box-shadow: 0 0px 10px var(--primary-color); */
    border-radius: 8px;
    width: 95vw;
    min-height: 350px;
  }

  /* Wrapper with 16:9 aspect ratio for responsive player */
  .yt-wrapper {
    width: 95vw;
    max-width: 100%;
    overflow: hidden;
    border-radius: 8px;
    position: relative;
    min-height: 350px;
    background-color: var(--card-bg, #000);
  }

  /* Maintain aspect ratio */
  .yt-wrapper::before {
    content: '';
    display: block;
    padding-top: 56.25%; /* 16:9 */
  }

  .yt-wrapper iframe,
  .yt-wrapper img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border: 0;
  }

  .yt-thumbnail {
    cursor: pointer;
    transition:
      transform 0.24s ease,
      opacity 0.18s ease;
  }

  .yt-thumbnail-btn {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }

  .yt-thumbnail:hover {
    transform: scale(1.02);
    opacity: 0.96;
  }

  .yt-play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transform: translateY(-8%);
    transition:
      background 0.12s ease,
      transform 0.12s;
  }

  .yt-play:hover {
    background: rgba(0, 0, 0, 0.75);
    transform: translateY(-10%);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
