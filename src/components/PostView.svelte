<script lang="ts">
import { urlRouter } from "@/lib/urlRouter";
import { navigate } from "@/lib/utils/url";
import { viewState } from "@/stores/viewStore.svelte";
import Icon from "./Icon.svelte";
import LinkIcon from "./LinkIcon.svelte";
import Modal from "@/components/Modal.svelte";
import Topbar from "./layout/Topbar.svelte";
import StringReveal from "./StringReveal.svelte";
import ToggleIcon from "./ToggleIcon.svelte";
import { deleteArticleByUrl } from "@/stores/tasksStore";
import Dropdown from "@/components/inputs/Dropdown.component.svelte";
import { AVAILABLE_VOICES, ttsStore } from "@/stores/ttsStore";
import Input from "./inputs/Input.component.svelte";

interface Props {
	headerContent?: any;
	summaryContent?: any;
}

const { headerContent, summaryContent } = $props();
// reactive state for deletion flag (Svelte runes)
let isDeleting = $state(false);
let showSettingsModal = $state(false);

// Add window scroll event listener on mount, remove on unload, using $effect.pre
$effect.pre(() => {
	function handleScroll() {
		if (window.scrollX === -2 || window.scrollY === -2) {
			navigate("/");
		}
	}
	window.addEventListener("scroll", handleScroll);
	// Cleanup on component unload
	return () => {
		window.removeEventListener("scroll", handleScroll);
	};
});

async function handleDelete() {
	if (!viewState.url || isDeleting) return;
	try {
		isDeleting = true;
		const res = await deleteArticleByUrl(viewState.url);
		if (res?.success) {
			viewState.cleanAllState();
			navigate("/");
		} else {
			console.error("Failed to delete article");
		}
	} catch (err) {
		console.error("Error deleting article", err);
	} finally {
		isDeleting = false;
	}
}
</script>

<article>
  <Topbar>
    <ToggleIcon
      name="ListChecks"
      checked={viewState.showAllTasks}
      onToggle={() => (viewState.showAllTasks = !viewState.showAllTasks)}
    />
    <Icon
      name="RefreshCcw"
      onClick={() => urlRouter(viewState.url!, { forceRunTasks: true })}
    />

    <Icon
      name="Settings"
      title="Settings"
      onClick={() => (showSettingsModal = true)}
    />

    <LinkIcon url={viewState.url!} />

    {#if viewState.url && !viewState.loading}
      <button
        class="delete-btn"
        onclick={handleDelete}
        disabled={isDeleting}
        title="Delete article"
      >
        <Icon name="Trash" />
      </button>
    {/if}
  </Topbar>

  

  <div class="header-container">
    <div class="title">
      <StringReveal message={viewState.title} />
    </div>

    <div class="header">
      {#if headerContent}
        {@render headerContent()}
      {/if}
    </div>
  </div>

  {@render summaryContent()}

  <Modal show={showSettingsModal} onClose={() => (showSettingsModal = false)}>
    <div class="modal-inner">
      <h2>Settings</h2>
      
      <Dropdown
        options={[
          { label: 'Spanish', value: 'es' },
          { label: 'English', value: 'en' },
        ]}
        bind:value={viewState.language}
       />

         <Dropdown
          options={AVAILABLE_VOICES.map((voice) => ({ label: voice, value: voice }))}
          onChange={(voice) => (ttsStore.state.update((prev) => ({ ...prev, selectedVoice: voice })))}
          value={ttsStore.state.selectedVoice}
        />

        <Input placeholder="speed.." onChange={(speed) => (ttsStore.state.update((prev) => ({ ...prev, speed: Number(speed) })))} value={String(ttsStore.state.speed)}/>

        <Input placeholder="total steps.." onChange={(totalStep) => (ttsStore.state.update((prev) => ({ ...prev, totalStep: Number(totalStep) })))} value={String(ttsStore.state.totalStep)}/>
    </div>
  </Modal>
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 0.2em;
    box-sizing: border-box;
    padding-top: 20px;
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    margin-bottom: 30px;
  }

  .header-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .title {
    font-weight: bold;
    font-size: 1.8rem;
    line-height: 1.8rem;
    font-family: 'Raleway', Times, serif;
    text-decoration: underline;
    text-decoration-color: var(--primary-color);
    text-underline-offset: -2px;
  }

  .title :global(.revealer) {
    font-weight: bold;
    font-size: 1.5rem;
  }

  .header {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 15px;
    width: 100%;
  }

  .delete-btn {
    all: unset;
    cursor: pointer;
    border-radius: 8px;
    padding: 6px 10px;
    color: white;
    font-size: 18px;
    line-height: 1;
  }

  .delete-btn[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .url-link {
    color: var(--primary-color);
    font-size: 0.9rem;
    text-decoration: none;
    text-align: center;
    word-break: break-all;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
