<script>
import { fade, scale } from "svelte/transition";
import { onMount } from "svelte";

let { show = false, onClose, children } = $props();

onMount(() => {
	const handleEscape = (e) => {
		if (e.key === "Escape" && show) {
			onClose();
		}
	};

	window.addEventListener("keydown", handleEscape);

	return () => {
		window.removeEventListener("keydown", handleEscape);
	};
});
</script>

{#if show}
  <div class="backdrop" role="presentation" transition:fade={{ duration: 200 }}>
    <div class="modal" role="dialog" transition:scale={{ start: 0.8, duration: 100 }}>
      <button class="close-btn" onclick={onClose} aria-label="Close modal">×</button>
      <div class="modal-content">
      {@render children?.()}
      </div>
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
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 9999;
  }

  .modal {
    position: relative;
    background: black;
    padding: 1.5rem;
    width: 100vw;
    height: 100vh;
    overflow-y: auto;
    border-radius: 8px;
    z-index: 10000;
  }

  .modal-content {
    color: white;
  }

  .close-btn {
    position: fixed;
    top: 0.6rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: white;
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
