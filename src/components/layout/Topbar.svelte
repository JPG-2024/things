<script lang="ts">
import { invoke } from "@tauri-apps/api/core"
import type { Snippet } from "svelte"
import { viewState } from "@/stores/viewStore.svelte"

interface Props {
	children?: Snippet
}

let { children }: Props = $props()

async function stopTTSPlayback() {
	try {
		await invoke("stop_tts_playback")
	} catch (err) {
		console.error("Failed to stop TTS playback", err)
	}
}
</script>

<div class="top-bar">
  <button onclick={() => history.back()} class="back-navigation">⬅</button>
  <!-- <button title="Stop TTS" onclick={stopTTSPlayback} class="tts-stop">[]</button> -->
  {#if viewState.domainUrl}
    <img
      onclick={stopTTSPlayback}
      class="favicon"
      src="https://www.google.com/s2/favicons?sz=64&domain={viewState.domainUrl}"
      alt=""
    />
  {/if}

  {@render children?.()}
</div>

<style>
  .top-bar {
    color: white;
    display: flex;
    position: fixed;
    top: 0px;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 10px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(10px);
    background: rgba(54, 54, 54, 0.6);
    min-height: 50px;
    backdrop-filter: blur(10px);
    right: 0;
    left: 0;
    z-index: 10;
    box-sizing: border-box;
    padding: 0 1rem;
  }

    .top-bar::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 100%;
    height: 1px;
    background: linear-gradient(
      270deg,
      rgba(255, 255, 255, 0.334) 0%,
      rgba(255, 255, 255, 0.159) 50%,
      transparent 100%
    );
    border-radius: 0 0 30px 0;
  }

  .back-navigation {
    all: unset;
    cursor: pointer;
    border-radius: 8px;
    padding: 0px 5px;
    font-size: 25px;
    text-decoration: none;
  }

  .favicon {
    margin-right: auto;
    border-radius: 8px;
    width: 32px;
    height: 32px;
  }

  .tts-stop {
    all: unset;
    cursor: pointer;
  }
</style>
