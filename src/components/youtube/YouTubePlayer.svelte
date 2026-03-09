<script lang="ts">
import { toVTName } from "@/lib/utils/url";
import { taskRunner } from "@/runners/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";

type Props = {
	task: Task;
};

let { task }: Props = $props();

let showIframe = $state(false);
</script>

<div class="yt-wrapper">
  {#if showIframe}
    <iframe
      class="yt-video"
      src={`https://www.youtube-nocookie.com/embed/${task.data.videoId}?autoplay=1&rel=0&modestbranding=1`}
      title="YouTube video player"
      frameborder="0"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  {:else}
    <button
      class="yt-thumbnail-btn"
      onclick={() => {showIframe = true}}
      aria-label="Play video"
    >
      <img
        src={task?.data?.thumbnailImageSrc}
        alt="YouTube thumbnail"
        class="yt-thumbnail"
        style={`view-transition-name: vt-main-image-${toVTName(task?.data?.videoId || '')}`}
      />
    </button>

    <button
      class="yt-play"
      onclick={() => {showIframe = true}}
      aria-label="Play video"
      title="Play video"
    >
      ▶
    </button>
  {/if}
</div>

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
    /* border: 1px solid var(--primary-color); */
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
</style>
