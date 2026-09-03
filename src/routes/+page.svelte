<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import Icon from '@/components/Icon.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import { handlePasteUrl } from '@/lib/utils/pasteUrl';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { profileRunner } from '@/runners/youtube/profileVideosRunner';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import { mainVoiceState } from '@/stores/mainVoice.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { deleteProfileById } from '@/stores/webStore';
	import { generateTTSfromArticleURL } from '@/lib/utils/tts';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import Categories from '@/components/Categories.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Toolbar from '@/components/Toolbar.svelte';
	import ToolbarDivider from '@/components/ToolbarDivider.svelte';
	import AskComponent from '@/components/AskComponent.svelte';
	import ProfilesBar from '@/components/ProfilesBar.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import type { Task } from '@/types/taskRunner.types';
	import { autoHide } from '@/lib/actions/autoHide';
	import ProfilesTab from './tabs/ProfilesTab.svelte';
	import CategoriesTab from './tabs/CategoriesTab.svelte';
	import ArticlesTab from './tabs/ArticlesTab.svelte';

	const standaloneAskTask: Task = {
		id: 'home-ask',
		dependencies: [],
		type: 'script'
	};

	function rgbToHex(rgb: string): string {
		const match = rgb.match(/\d+/g);
		if (!match || match.length < 3) return '#fae4c0';
		const r = parseInt(match[0]);
		const g = parseInt(match[1]);
		const b = parseInt(match[2]);
		return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
	}

	function handleColorChange(e: Event) {
		const hex = (e.target as HTMLInputElement).value;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		viewState.primaryColor = `rgb(${r}, ${g}, ${b})`;
	}

	function handleBgColorChange(e: Event) {
		const hex = (e.target as HTMLInputElement).value;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		viewState.backgroundColor = `rgb(${r}, ${g}, ${b})`;
	}

	let askInputValue = $state('');

	$effect(() => {
		if (!viewState.clipboardPollingEnabled) {
			viewState.lastHandledClipboardUrl = '';
		}
	});

	async function handleDeleteProfile(profileId: string) {
		const result = await deleteProfileById(profileId);
		if (result.success) {
			articleCacheStore.invalidateProfiles();
			await articleCacheStore.fetchProfilesWithArticles({ force: true });
		}
	}

	async function handleTitleClick() {
		try {
			const clipboardText = await invoke<string>('read_clipboard_text');
			const trimmed = (clipboardText ?? '').trim();
			if (!trimmed) return;

			if (viewState.autoSpeechEnabled && viewState.clipboardTtsEnabled) {
				const inputTrimmed = askInputValue.trim();
				if (!inputTrimmed) return;
				void ensureAudioContext();
				await ttsState.generateFromClipboard(inputTrimmed);
				return;
			}

			await handlePasteUrl(trimmed);
		} catch (error) {
			console.warn('[clipboard-paste] error', error);
		}
	}

	const sHotkey = createHotkey(
		'S',
		async () => {
			if (!viewState.hoveredArticleUrl) return;
			void ensureAudioContext();
			await generateTTSfromArticleURL(viewState.hoveredArticleUrl);
		},
		() => ({
			enabled: viewState.hoveredArticleUrl !== null,
			ignoreInputs: true
		})
	);

	const pHotkey = createHotkey(
		'P',
		async () => {
			if (!viewState.hoveredProfileName) return;
			const profile = articleCacheStore.profilesWithArticles.find(
				(p) => p.name === viewState.hoveredProfileName
			);
			if (!profile) return;
			const profileUrl = getProfileUrl(viewState.hoveredProfileName);
			await profileRunner(profileUrl, {
				options: { videosAmount: 1, scrollTimes: 1 }
			});
			articleCacheStore.invalidateProfiles();
			await articleCacheStore.fetchProfilesWithArticles({ force: true });
		},
		() => ({
			enabled: viewState.hoveredProfileName !== null,
			ignoreInputs: true
		})
	);

	const dHotkey = createHotkey(
		'D',
		async () => {
			if (!viewState.hoveredProfileId) return;
			await handleDeleteProfile(viewState.hoveredProfileId);
		},
		() => ({
			enabled: viewState.hoveredProfileId !== null,
			ignoreInputs: true
		})
	);
</script>

<div class="dashboard-toolbar-container" use:autoHide>
	<div class="toolbar-row page-topbar">
		<Toolbar justify="space-between" iconSize={18}>
			<div class="toolbar-left">
				<LuminousText
					mode="random"
					size="1.6rem"
					onclick={handleTitleClick}
					aria-label="Paste clipboard URL"
				>
					Things
				</LuminousText>
				<Input type="text" bind:value={viewState.unifiedFilter} search />
			</div>
			<div class="toolbar-center"></div>
			<div class="toolbar-actions">
				<!-- 	<button
		type="button"
		class="settings-trigger"
		onclick={() => (viewState.collapseProfiles = !viewState.collapseProfiles)}
		aria-label="Open settings"
	>
		<Icon name="ChevronRight" />
	</button> -->
				<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
					<ToggleIcon
						name="Speech"
						bind:checked={viewState.autoSpeechEnabled}
						tooltipProps={{ content: 'auto start voice' }}
					/>
				</button>
				<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
					<ToggleIcon
						name="Languages"
						bind:checked={viewState.forceLanguageEnabled}
						tooltipProps={{ content: 'translate to current language' }}
					/>
				</button>
				<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
					<ToggleIcon
						name="ClipboardPaste"
						bind:checked={viewState.clipboardPollingEnabled}
						tooltipProps={{ content: 'listen clipboard' }}
					/>
				</button>
				<button type="button" class="settings-trigger" aria-label="Toggle clipboard TTS">
					<ToggleIcon
						name="MessageSquareText"
						bind:checked={viewState.clipboardTtsEnabled}
						tooltipProps={{ content: 'read copied text' }}
					/>
				</button>
				<!-- 	<button type="button" class="settings-trigger" aria-label="Toggle show all articles">
		<ToggleIcon name="Library" bind:checked={viewState.showOnlyRawArticles} size={18} />
	</button> -->
				<button type="button" class="settings-trigger" aria-label="Toggle embeddings generation">
					<ToggleIcon
						name="FileDigit"
						bind:checked={viewState.embeddingsEnabled}
						tooltipProps={{ content: 'generate embeddings' }}
					/>
				</button>
				<ToolbarDivider />
				<button type="button" class="settings-trigger" aria-label="Toggle download tracks">
					<ToggleIcon
						name="Download"
						bind:checked={viewState.downloadTracksEnabled}
						size={18}
						tooltipProps={{ content: 'download tracks from queue' }}
					/>
				</button>
				<button
					type="button"
					class="settings-trigger"
					onclick={() => drawersState.open('downloads')}
					aria-label="Open downloads"
				>
					<Icon name="ListMusic" size={18} />
				</button>
				<ToolbarDivider />
				<button
					type="button"
					class="settings-trigger"
					onclick={() => void mainVoiceState.open()}
					aria-label="Open settings"
				>
					<Icon name="AudioWaveform" />
				</button>

				<button
					type="button"
					class="settings-trigger"
					onclick={() => drawersState.open('settings')}
					aria-label="Open settings"
				>
					<Icon name="Cog" />
				</button>

				<ToolbarDivider />
				<label class="color-dot-trigger" aria-label="Change primary color">
					<span class="color-dot" style:background-color={viewState.primaryColor}></span>
					<input
						type="color"
						class="color-picker-input"
						value={rgbToHex(viewState.primaryColor)}
						oninput={handleColorChange}
					/>
				</label>
				<label class="color-dot-trigger" aria-label="Change background color">
					<span class="color-dot" style:background-color={viewState.backgroundColor}></span>
					<input
						type="color"
						class="color-picker-input"
						value={rgbToHex(viewState.backgroundColor)}
						oninput={handleBgColorChange}
					/>
				</label>
			</div>
		</Toolbar>
	</div>
	<div class="toolbar-row">
		<ProfilesBar />
	</div>
	<div class="toolbar-row"><Categories /></div>
</div>

<div class="dashboard-container">
	<!-- <AskComponent /> -->
	{#if viewState.activeProfileArticleTab === 'profiles'}
		<ProfilesTab />
	{:else if viewState.activeProfileArticleTab === 'categories'}
		<CategoriesTab />
	{:else}
		<ArticlesTab />
	{/if}
</div>

<style>
	.page-topbar {
		padding: 1rem 0;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.settings-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.45rem;
	}

	.dashboard-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
		box-sizing: border-box;
		padding: 10px 10px;
		padding-top: 12rem;
		width: 100%;
		min-height: 80px;
	}

	.dashboard-toolbar-container {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		width: 100%;
		margin: 0 auto;
		padding: 2rem 3rem 2rem;
		background: linear-gradient(
			color-mix(in srgb, var(--primary-color), black 92%),
			rgba(9, 9, 9, 1),
			rgba(9, 9, 9, 1),
			transparent
		);
		opacity: 1;
		transition:
			transform 250ms ease-out,
			opacity 250ms ease-out;
	}

	.toolbar-row {
		display: flex;
		align-items: center;
		width: 100%;
	}

	.toolbar-center {
		display: flex;
		align-items: center;
		flex: 1;
		max-width: 340px;
		padding: 0 1rem;
	}

	.filters-row {
		justify-content: center;
		gap: 1.5rem;
	}

	.dashboard-toolbar-container:global(.hidden) {
		transform: translateY(-100%);
		opacity: 0;
		pointer-events: none;
	}

	.color-dot-trigger {
		all: unset;
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.45rem;
	}

	.color-dot {
		display: block;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		border: 1px solid color-mix(in srgb, var(--primary-color) 60%, transparent);
		box-shadow: 0 0 6px color-mix(in srgb, var(--primary-color) 35%, transparent);
		transition:
			box-shadow 0.15s,
			transform 0.15s;
	}

	.color-dot-trigger:hover .color-dot {
		box-shadow: 0 0 10px color-mix(in srgb, var(--primary-color) 60%, transparent);
		transform: scale(1.05);
	}

	.color-picker-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		border: none;
		padding: 0;
	}
</style>
