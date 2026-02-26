<script>
  let { show = false, onClose, children } = $props()
  import { fade, scale } from 'svelte/transition'
</script>

{#if show}
  <div class="backdrop" role="presentation">
    <div class="modal" role="dialog" transition:scale={{ start: 0.8, duration: 100 }}>
      <button class="close-btn" onclick={onClose} aria-label="Close modal">×</button>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(0, 0, 0, 0.7);

    /* desenfoque del fondo detrás del backdrop */
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .modal {
    position: relative;
    background: rgba(0, 0, 0, 0.8);
    padding: 1.5rem;
    max-width: 100%;
    padding-top: 20px;
    z-index: 1000;
  }

  .close-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: inherit;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
</style>
