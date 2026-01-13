<script lang="ts">
  import { toVTName } from '@/lib/utils/url'
  import { viewState } from '@/stores/viewStore.svelte'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
  import { page } from '$app/state'
  import { blur } from 'svelte/transition'

  const articleUrl = page.params.url

  import PostView from '@/components/PostView.svelte'
  let showIframe = false
</script>

<PostView headerContent={headerContentSnippet} summaryContent={summaryContentSnippet} />

{#snippet headerContentSnippet()}
  {#if viewState.ytVideoId}
    <div class="yt-wrapper">
      {#if showIframe}
        <!--         <iframe
          class="yt-video"
          src={`https://www.youtube-nocookie.com/embed/${viewState.ytVideoId}?autoplay=1&rel=0&modestbranding=1`}
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe> -->
      {:else}
        <button
          class="yt-thumbnail-btn"
          onclick={() => (showIframe = true)}
          aria-label="Play video"
        >
          <img
            src={viewState.mainImageSrc}
            alt="YouTube thumbnail"
            class="yt-thumbnail"
            style={`view-transition-name: vt-main-image-${toVTName(articleUrl!)}`}
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
  {#if viewState.block1 !== ''}
    <div class="block1" transition:blur={{ duration: 200 }}>
      <MarkdownRenderer content={viewState.block1} />
    </div>
  {/if}
  {#if viewState.block2 !== ''}
    <div class="block1" transition:blur={{ duration: 200 }}>
      <MarkdownRenderer content={viewState.block2} />
    </div>
  {/if}

  {#if viewState.summary && typeof viewState.summary === 'object'}
    {#if viewState.summary.summary}
      <div class="summary-section" transition:blur={{ duration: 200 }}>
        <h3>Resumen</h3>
        <MarkdownRenderer content={viewState.summary.summary} />
      </div>
    {/if}

    {#if viewState.summary.fiveKeypoints && viewState.summary.fiveKeypoints.length > 0}
      <div class="keypoints-section" transition:blur={{ duration: 200 }}>
        <h3>Puntos Clave</h3>
        <ul class="keypoints-list">
          {#each viewState.summary.fiveKeypoints as keypoint, index}
            {#if keypoint}
              <li>
                <!-- <span class="keypoint-number">{index + 1}</span> -->
                <MarkdownRenderer content={keypoint} />
              </li>
            {/if}
          {/each}
        </ul>
      </div>
    {/if}

    {#if viewState.summary.conclusion}
      <div class="conclusion-section" transition:blur={{ duration: 200 }}>
        <h3>Conclusión</h3>
        <MarkdownRenderer content={viewState.summary.conclusion} />
      </div>
    {/if}
  {/if}
{/snippet}

<style>
  .yt-video {
    /* box-shadow: 0 0px 10px var(--primary-color); */
    min-height: 350px;
  }

  .block1 {
    color: var(--primary-color);
    min-height: 50px;
  }

  /* Wrapper with 16:9 aspect ratio for responsive player */
  .yt-wrapper {
    position: relative;
    border-radius: 30px;
    background-color: var(--card-bg, #000);
    width: 100%;

    overflow: hidden;
  }

  /* Maintain aspect ratio */
  .yt-wrapper::before {
    display: block;
    padding-top: 56.25%; /* 16:9 */
    content: '';
  }

  .yt-wrapper img {
    position: absolute;
    top: 0%;
    left: 0;
    right: auto;
    border: 0;
    width: 110%;
    height: 100%;
    object-fit: cover;
  }

  .yt-thumbnail:hover {
    transform: scale(1.01);
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

  .summary-section,
  .keypoints-section,
  .conclusion-section {
    margin-bottom: 2rem;
  }

  .summary-section h3,
  .keypoints-section h3,
  .conclusion-section h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
    font-size: 1.25rem;
  }

  .keypoints-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .keypoints-list li {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 0.2rem 0.75rem;
    border-left: 3px solid var(--primary-color);
    background-color: var(--card-bg-secondary, rgba(255, 255, 255, 0.05));
    border-radius: 4px;
  }

  .keypoint-number {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    background-color: var(--primary-color);
    color: white;
    border-radius: 50%;
    font-weight: bold;
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
