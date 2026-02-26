<script lang="ts">
import { blur } from "svelte/transition"
import InstantResponse from "@/components/InstantResponse.svelte"
import KeypointItem from "@/components/KeypointItem.svelte"
import MarkdownRenderer from "@/components/MarkdownRenderer.svelte"
import PostView from "@/components/PostView.svelte"
import TasksRender from "@/components/Tasks/TasksRender.svelte"
import { toVTName } from "@/lib/utils/url"
import { viewState } from "@/stores/viewStore.svelte"
import { page } from "$app/state"

const articleUrl = page.params.url
let showIframe = false
</script>

<PostView headerContent={headerContentSnippet} summaryContent={summaryContentSnippet} />

<InstantResponse content={viewState.summary!} />

{#snippet headerContentSnippet()}
  {#if viewState.ytVideoId}
    <div class="yt-wrapper">
      {#if showIframe}
        <iframe
          class="yt-video"
          src={`https://www.youtube-nocookie.com/embed/${viewState.ytVideoId}?autoplay=1&rel=0&modestbranding=1`}
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
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
  {#if typeof viewState.summary === 'string'}
    {#if viewState.summary}
      <div class="summary-section" transition:blur={{ duration: 200 }}>
        <MarkdownRenderer content={viewState.summary} />
      </div>
    {/if}
  {/if}

  <TasksRender />

  {#if viewState.keypoints && viewState.keypoints.length > 0}
    <div class="keypoints-section" transition:blur={{ duration: 1000 }}>
      <ul class="keypoints-list">
        {#each viewState.keypoints as keypoint}
          {#if keypoint}
            <KeypointItem content={keypoint} />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}

  {#if viewState.questions && viewState.questions.length > 0}
    <div class="keypoints-section" transition:blur={{ duration: 1000 }}>
      <ul class="keypoints-list">
        {#each viewState.questions as question}
          {#if question}
            <KeypointItem content={question} />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}
{/snippet}

<style>
  /* Wrapper with 16:9 aspect ratio for responsive player */
  .yt-wrapper {
    position: relative;

    background-color: var(--card-bg, #000);
    width: 100%;
    border-radius: 20px;
    overflow: hidden;
  }

  /* Maintain aspect ratio */
  .yt-wrapper::before {
    display: block;
    padding-top: 56.25%; /* 16:9 */
    content: '';
    border-radius: 20px;
  }

  .yt-wrapper img {
    position: absolute;
    top: 0%;
    left: 0;
    right: auto;
    border: 1px solid var(--primary-color);
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 20px;
  }

  /* Make iframe fill the wrapper */
  .yt-wrapper .yt-video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
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

  .summary-section,
  .keypoints-section {
    padding: 1rem;
    margin-bottom: 15px;
  }

  .keypoints-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
