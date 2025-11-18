<script lang="ts">
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
    position: relative;
    border-radius: 30px;
    background-color: var(--card-bg, #000);
    width: 95vw;
    max-width: 100%;
    min-height: 350px;
    overflow: hidden;
  }

  /* Maintain aspect ratio */
  .yt-wrapper::before {
    display: block;
    padding-top: 56.25%; /* 16:9 */
    content: '';
  }

  .yt-wrapper iframe,
  .yt-wrapper img {
    position: absolute;
    top: 0;
    left: 0;
    border: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .yt-thumbnail {
    transition:
      transform 0.24s ease,
      opacity 0.18s ease;
    cursor: pointer;
  }

  .yt-thumbnail-btn {
    position: absolute;
    cursor: pointer;
    inset: 0;
    border: 0;
    background: transparent;
    padding: 0;
  }

  .yt-thumbnail:hover {
    transform: scale(1.02);
    opacity: 0.96;
  }

  .yt-play {
    display: flex;
    position: absolute;
    justify-content: center;
    align-items: center;
    transform: translateY(-8%);
    transition:
      background 0.12s ease,
      transform 0.12s;
    cursor: pointer;
    margin: auto;
    inset: 0;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    width: 64px;
    height: 64px;
    color: white;
    font-size: 28px;
  }

  .yt-play:hover {
    transform: translateY(-10%);
    background: rgba(0, 0, 0, 0.75);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
