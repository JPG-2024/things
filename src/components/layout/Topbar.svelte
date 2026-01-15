<script lang="ts">
  import { viewState } from '@/stores/viewStore.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    children?: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="top-bar">
  <button onclick={() => history.back()} class="back-navigation">⬅</button>
  {#if viewState.domainUrl}
    <img
      class="favicon"
      src="https://www.google.com/s2/favicons?sz=64&domain={viewState.domainUrl}"
      alt=""
    />
  {/if}

  {@render children?.()}
</div>

<style>
  .top-bar {
    display: flex;
    position: fixed;
    top: 0px;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 10px;
    backdrop-filter: blur(8px);
    background: rgba(54, 54, 54, 0.6);
    min-height: 50px;
    -webkit-backdrop-filter: blur(5px);
    right: 0;
    left: 0;
    z-index: 10;
    box-sizing: border-box;
    padding: 0 1rem;
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
</style>
