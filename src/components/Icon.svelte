<script lang="ts">
  import * as icons from '@lucide/svelte'
  let { name, size = 18, color = 'white', handleClick = undefined, ...props } = $props()

  const Icon = (icons as any)[name]
</script>

{#if handleClick}
  <button onclick={handleClick} class="icon-button">
    <Icon {...props} {color} {size} />
  </button>
{:else}
  <Icon {...props} {color} {size} />
{/if}

<style>
  .icon-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>
