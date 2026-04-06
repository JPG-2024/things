<script lang="ts">
import { onMount } from "svelte";
import { invoke } from "@tauri-apps/api/core";

import CategoryWidget from "@/components/CategoryWidget.svelte";
import Icon from "@/components/Icon.svelte";
import SettingsModal from "@/components/modals/SettingsModal.svelte";
import Input from "@/components/inputs/Input.component.svelte";
import { urlRouter } from "@/lib/urlRouter/urlRouter";
import { navigate } from "@/lib/utils/url";
import { primaryColor } from "@/stores/uiStore";
import { viewState } from "@/stores/viewStore.svelte";

// Data provided by +page.ts load

const CLIPBOARD_POLL_INTERVAL_MS = 5000;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

let processingUrl = $state(false);

function extractValidUrl(value: string): string | null {
	const trimmedValue = value.trim();

	if (!trimmedValue || !HTTP_URL_REGEX.test(trimmedValue)) {
		return null;
	}

	try {
		const parsedUrl = new URL(trimmedValue);
		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			return null;
		}

		return parsedUrl.toString();
	} catch {
		return null;
	}
}

$effect(() => {
	// generate random svg
	// Generate a random light color (avoid dark tones)
	const randomColor = `rgb(${200 + Math.floor(Math.random() * 56)}, ${200 + Math.floor(Math.random() * 56)}, ${200 + Math.floor(Math.random() * 56)})`;

	primaryColor.set(randomColor);
});

/* onMount(async () => {
	try {
		console.debug("Attempting to launch llama-server...");
		await invoke("launch_llama_server");
		console.debug("llama-server launch invoked successfully.");
	} catch (error) {
		console.warn("llama-server launch skipped:", error);
	}
}); */

async function handlePasteUrl(url: string) {
	const validUrl = extractValidUrl(url);
	if (!validUrl || processingUrl) return;

	processingUrl = true;

	try {
		viewState.lastHandledClipboardUrl = validUrl;
		navigate(`/youtube/${encodeURIComponent(validUrl)}`);
		await urlRouter(validUrl);
	} finally {
		processingUrl = false;
	}
}

onMount(() => {
	const pollClipboard = async () => {
		if (!viewState.clipboardPollingEnabled || processingUrl) return;

		try {
			const clipboardText = await invoke<string>("read_clipboard_text");
			const validUrl = extractValidUrl(clipboardText ?? "");

			if (!validUrl || validUrl === viewState.lastHandledClipboardUrl) {
				return;
			}

			await handlePasteUrl(validUrl);
		} catch {
			viewState.clipboardPollingEnabled = false;
		}
	};

	void pollClipboard();
	const clipboardInterval = setInterval(() => {
		void pollClipboard();
	}, CLIPBOARD_POLL_INTERVAL_MS);

	return () => {
		clearInterval(clipboardInterval);
	};
});
</script>

<div class="page-topbar">
	<button
		type="button"
		class="settings-trigger"
		onclick={() => (viewState.modalSettingVisible = true)}
		aria-label="Open settings"
	>
		<Icon name="Settings" />
	</button>
</div>

<div class="dashboard-container">
   <div class="title-row">
    <span class="dashboard-title">Things</span>
  </div> 

  <div class="inputs-container">
    <Input onChange={(url) => handlePasteUrl(url)} placeholder="Paste URL here..." />
    <!--     <Input onChange={(prompt) => (viewState.prompt = prompt)} />
    <Input onChange={(query) => (viewState.prompt = query)} /> -->
    <!-- <InstantResponse model="gpt-3.5-turbo" maxTokens={512} /> -->
    <!-- <button onclick={() => handleYoutubeQuestion(viewState.prompt!)}>search</button> -->
  </div>

  <div class="flex-squares">
    {#each ['Unsorted'] as categoryId}
      <CategoryWidget {categoryId} name={categoryId} />
    {/each}
  </div>
</div>

<SettingsModal
	show={viewState.modalSettingVisible}
	onClose={() => (viewState.modalSettingVisible = false)}
/>

<style>
	.page-topbar {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 10;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		min-height: 52px;
		padding: 0 1rem;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		background: rgba(54, 54, 54, 0.2);
	}

	.settings-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.45rem;
		background: rgba(255, 255, 255, 0.06);
	}

  .dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
    align-items: center;
    box-sizing: border-box;
		padding: 76px 20px 20px;
    width: 100%;
  }

  .dashboard-title {
    color: var(--primary-color);
    font-size: 2.2rem;
    padding: 0.1rem 1rem;
    
  }

  .flex-squares {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    width: 100%;
  }

  .inputs-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 800px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    justify-content: center;
    padding: 10px;
  }

  /* The widget-specific styles were moved to `src/components/CategoryWidget.svelte` */
</style>
