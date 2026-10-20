<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import Icon from '@/components/Icon.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import { readClipboardAndHandle } from '@/lib/utils/clipboard';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { profileRunner } from '@/runners/youtube/profileVideosRunner';
	import {
		viewState,
		drawersState,
		voiceSettingsState,
		articleFilters
	} from '@/stores/viewStore.svelte';
	import type { RawSearchResult } from '@/stores/viewStore.svelte';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import {
		deleteProfileById,
		getCategories,
		mapArticlesFromRecords,
		type WebStoreArticleRecord
	} from '@/stores/webStore';
	import { generateTTSfromArticleURL } from '@/lib/utils/tts';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import Toolbar from '@/components/Toolbar.svelte';
	import ToolbarDivider from '@/components/ToolbarDivider.svelte';
	import { startLlamaHealthPolling } from '@/lib/utils/llamaHealth';
	import {
		startExternalServicesHealthPolling,
		type ExternalServiceName
	} from '@/lib/utils/externalServicesHealth';
	import ProfileArticleTabs from '@/components/ProfileArticleTabs.svelte';
	import ActiveFilterChips from '@/components/ActiveFilterChips.svelte';
	import ArticleFiltersPanel from '@/components/ArticleFiltersPanel.svelte';
	import PopupMenu from '@/components/PopupMenu.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import Input from '@/components/inputs/Input.component.svelte';

	import { autoHide } from '@/lib/actions/autoHide';
	import ProfilesTab from './tabs/ProfilesTab.svelte';
	import CategoriesTab from './tabs/CategoriesTab.svelte';
	import ArticlesTab from './tabs/ArticlesTab.svelte';
	import DomainsTab from './tabs/DomainsTab.svelte';

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

	function llamaServiceTooltip(
		name: 'inference' | 'embeddings',
		label: string,
		up: boolean
	): string {
		const status = viewState.llamaServersStatus.find((entry) => entry.name === name);
		if (status?.error) return `${label}: ${status.error}`;
		return `${label} ${up ? 'online' : 'offline'}`;
	}

	function externalServiceTooltip(label: string, up: boolean): string {
		return `${label} ${up ? 'online' : 'offline'}`;
	}

	const EXTERNAL_SERVICE_DOTS = [
		{ name: 'scrap', label: 'Scrap service' },
		{ name: 'tts', label: 'TTS service' },
		{ name: 'whisper', label: 'Whisper service' }
	] as const satisfies ReadonlyArray<{ name: ExternalServiceName; label: string }>;

	function externalServiceUp(name: ExternalServiceName): boolean {
		switch (name) {
			case 'scrap':
				return viewState.scrapServiceUp;
			case 'tts':
				return viewState.ttsServiceUp;
			case 'whisper':
				return viewState.whisperServiceUp;
		}
	}

	let toolbarEl = $state<HTMLDivElement>();
	let searchInput = $state<{ focus: () => void } | null>(null);

	// Focus the page search whenever the filters popover opens (F, icon, typing).
	$effect(() => {
		if (articleFilters.panelOpen) searchInput?.focus();
	});

	/** "Search in articles content" button: commits the typed term, runs the
	 * raw search and closes the filters popup. */
	function handleSearchInContent() {
		viewState.commitUnifiedFilter();
		void handleRawSearch(viewState.unifiedFilterDraft);
		articleFilters.panelOpen = false;
	}

	/** Filter icon: clears the facet filters and the search term/input text. */
	function handleClearFilters() {
		articleFilters.clear();
		viewState.clearUnifiedFilter();
	}

	async function handleRawSearch(pattern: string) {
		const trimmed = pattern.trim();
		if (trimmed.length < 4) return;
		viewState.rawSearchLoading = true;
		try {
			const results = await invoke<
				Array<{
					url: string;
					before: string;
					matchText: string;
					after: string;
					article: WebStoreArticleRecord;
				}>
			>('search_raw_content', {
				pattern: trimmed,
				contextChars: viewState.rawSearchContextChars
			});

			const articles = await mapArticlesFromRecords(results.map((r) => r.article));
			const articleByUrl = new Map(articles.map((article) => [article.url ?? '', article]));

			const mapped: RawSearchResult[] = [];
			for (const r of results) {
				const article = articleByUrl.get(r.url);
				if (!article) continue;
				mapped.push({
					article,
					match: { before: r.before, matchText: r.matchText, after: r.after }
				});
			}
			viewState.rawSearchResults = mapped;
		} catch (error) {
			console.warn('[raw-search] error', error);
			viewState.rawSearchResults = [];
		} finally {
			viewState.rawSearchLoading = false;
		}
	}

	$effect(() => {
		if (viewState.unifiedFilter.trim().length < 4) {
			viewState.rawSearchResults = null;
		}
	});

	$effect(() => {
		const filter = viewState.unifiedFilter.trim();
		if (!filter) return;
		const timeout = setTimeout(() => void handleRawSearch(filter), 1000);
		return () => clearTimeout(timeout);
	});

	async function handleDeleteProfile(profileId: string) {
		const result = await deleteProfileById(profileId);
		if (result.success) {
			articleFilters.removeById(profileId);
			articleCacheStore.invalidateProfiles();
			await articleCacheStore.fetchProfilesWithArticles({ force: true });
		}
	}

	async function handleTitleClick() {
		await readClipboardAndHandle();
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

	const TAB_ORDER = ['profiles', 'domains', 'categories', 'articles'] as const;

	const leftHotkey = createHotkey(
		'Alt+ArrowLeft',
		() => {
			const currentIndex = TAB_ORDER.indexOf(viewState.activeProfileArticleTab);
			if (currentIndex < TAB_ORDER.length - 1) {
				const next = TAB_ORDER[currentIndex + 1];
				tabAnimationStore.recordTabChange(next);
				viewState.activeProfileArticleTab = next;
			}
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	const rightHotkey = createHotkey(
		'Alt+ArrowRight',
		() => {
			const currentIndex = TAB_ORDER.indexOf(viewState.activeProfileArticleTab);
			if (currentIndex > 0) {
				const next = TAB_ORDER[currentIndex - 1];
				tabAnimationStore.recordTabChange(next);
				viewState.activeProfileArticleTab = next;
			}
		},
		{ ignoreInputs: true, stopPropagation: true, preventDefault: true }
	);

	$effect(() => {
		const stopLlama = startLlamaHealthPolling();
		const stopExternal = startExternalServicesHealthPolling();
		return () => {
			stopLlama();
			stopExternal();
		};
	});

	$effect(() => {
		void getCategories().then((categories) => {
			viewState.categories = categories;
		});
	});
</script>

<div
	bind:this={toolbarEl}
	class="dashboard-toolbar-container"
	use:autoHide={{ scrollContainerId: 'dashboard-content' }}
>
	<div class="toolbar-row page-topbar">
		<Toolbar layout="grid" iconSize={20}>
			<div class="toolbar-left">
				<LuminousText
					mode="random"
					size="1.4rem"
					glowOpacity={0.5}
					onclick={handleTitleClick}
					aria-label="Paste clipboard URL"
				>
					Things
				</LuminousText>
			</div>
			<div class="toolbar-center">
				<PopupMenu
					position="bottom"
					gap={10}
					manual
					closeOnLeave={false}
					bind:open={articleFilters.panelOpen}
				>
					{#snippet trigger()}
						<Input
							type="text"
							bind:this={searchInput}
							bind:value={viewState.unifiedFilterDraft}
							search
							keepValueOnEnter
							onEnter={() => viewState.commitUnifiedFilter()}
							onFocus={() => (articleFilters.panelOpen = true)}
						/>
						<button
							type="button"
							class="filters-trigger"
							class:active={articleFilters.hasActive}
							onclick={handleClearFilters}
							aria-label="Clear article filters"
						>
							<Icon name="Filter" />
						</button>
					{/snippet}
					{#snippet content()}
						{#if articleFilters.hasActive}
							<div class="popup-filter-chips">
								<ActiveFilterChips />
							</div>
						{/if}
						<ArticleFiltersPanel />
						{#if viewState.unifiedFilterDraft.trim()}
							<div class="popup-raw-search">
								<Button
									icon="Search"
									disabled={viewState.unifiedFilterDraft.trim().length < 4}
									onClick={handleSearchInContent}
								>
									Search in articles content
								</Button>
							</div>
						{/if}
					{/snippet}
				</PopupMenu>
			</div>
			<div class="toolbar-actions">
				<!-- 	<button
		type="button"
		class="settings-trigger"
		onclick={() => (viewState.collapseProfiles = !viewState.collapseProfiles)}
		aria-label="Open settings"
	>
		<Icon name="ChevronRight" />
	</button> -->
				<button type="button" class="settings-trigger" aria-label="Toggle auto speech">
					<ToggleIcon
						name="Speech"
						bind:checked={viewState.autoSpeechEnabled}
						tooltipProps={{ content: 'auto start voice' }}
					/>
				</button>
				<button type="button" class="settings-trigger" aria-label="Translate to current language">
					<ToggleIcon
						name="Languages"
						bind:checked={viewState.forceLanguageEnabled}
						tooltipProps={{ content: 'translate to current language' }}
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
				<ToolbarDivider />
				<button type="button" class="settings-trigger" aria-label="Toggle embeddings generation">
					<ToggleIcon
						name="FileDigit"
						bind:checked={viewState.embeddingsEnabled}
						tooltipProps={{ content: 'generate embeddings' }}
					/>
				</button>
				<ToolbarDivider />
				<!-- 					<button
						type="button"
						class="settings-trigger"
						onclick={() => drawersState.open('downloads')}
						aria-label="Open downloads"
					>
						<Icon name="ListMusic" size={18} />
					</button>
				<ToolbarDivider /> -->
				<button
					type="button"
					class="settings-trigger"
					onclick={() => voiceSettingsState.openTts()}
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
					<Icon name="SlidersHorizontal" />
				</button>

				<ToolbarDivider />

				<Tooltip
					content={llamaServiceTooltip(
						'inference',
						'Inference service',
						viewState.inferenceServiceUp
					)}
				>
					<span
						class="embeddings-health"
						class:up={viewState.inferenceServiceUp}
						role="status"
						aria-label="Inference service status"
					></span>
				</Tooltip>
				<Tooltip
					content={llamaServiceTooltip(
						'embeddings',
						'Embeddings service',
						viewState.embeddingsServiceUp
					)}
				>
					<span
						class="embeddings-health"
						class:up={viewState.embeddingsServiceUp}
						role="status"
						aria-label="Embeddings service status"
					></span>
				</Tooltip>
				{#each EXTERNAL_SERVICE_DOTS as service (service.name)}
					<Tooltip content={externalServiceTooltip(service.label, externalServiceUp(service.name))}>
						<span
							class="embeddings-health"
							class:up={externalServiceUp(service.name)}
							role="status"
							aria-label={`${service.label} status`}
						></span>
					</Tooltip>
				{/each}
				<Tooltip content="Change primary color">
					<label class="color-dot-trigger" aria-label="Change primary color">
						<span class="color-dot" style:background-color={viewState.primaryColor}></span>
						<input
							type="color"
							class="color-picker-input"
							value={rgbToHex(viewState.primaryColor)}
							oninput={handleColorChange}
						/>
					</label>
				</Tooltip>
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
	<div class="toolbar-row tabs-row">
		<ProfileArticleTabs />
	</div>
</div>

<div class="dashboard-container">
	<div id="dashboard-content" class="dashboard-content">
		{#if viewState.activeProfileArticleTab === 'profiles'}
			<ProfilesTab />
		{:else if viewState.activeProfileArticleTab === 'domains'}
			<DomainsTab />
		{:else if viewState.activeProfileArticleTab === 'categories'}
			<CategoriesTab />
		{:else}
			<ArticlesTab />
		{/if}
	</div>
</div>

<style>
	.page-topbar {
		padding: 1rem 0;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		justify-self: end;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 2rem;
		justify-self: start;
	}

	.settings-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.45rem;
		flex-shrink: 0;
	}

	.embeddings-health {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		margin: 0 0.4rem;
		flex-shrink: 0;
		background: rgb(255, 140, 109);
		box-shadow: 0 0 6px rgb(255, 140, 109);
		transition:
			background 0.2s,
			box-shadow 0.2s;
	}

	.embeddings-health.up {
		background: rgb(120, 220, 140);
		box-shadow: 0 0 6px rgb(120, 220, 140);
	}

	.dashboard-container {
		display: grid;
		grid-template-columns: minmax(0, 1fr);

		width: 100%;
		height: 100vh;
		overflow: hidden;
	}

	.dashboard-content {
		overflow-y: auto;
		padding-top: 10rem;
	}

	.dashboard-toolbar-container {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		margin: 0 auto;
		padding: 0.2rem 2rem 2rem;
		background: linear-gradient(
			color-mix(in srgb, var(--primary-color), black 92%),
			rgba(9, 9, 9, 1),
			rgba(9, 9, 9, 1),
			transparent
		);
		opacity: 1;
		transition:
			transform 250ms ease-out,
			opacity 250ms ease-out,
			height 250ms ease-out,
			padding 250ms ease-out;
	}

	.toolbar-row {
		display: flex;
		align-items: center;
		width: 100%;
	}

	.tabs-row {
		justify-content: center;
	}

	.toolbar-center {
		display: flex;
		align-items: center;
		justify-self: center;
		width: 340px;
		padding: 0 1rem;
		gap: 0.3rem;
	}

	/* The manual PopupMenu wrapper wraps search input + filter icon. */
	.toolbar-center :global(.search-wrapper) {
		flex: 1;
		min-width: 0;
	}

	.popup-raw-search {
		display: flex;
		justify-content: center;
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.filters-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.35rem;
		flex-shrink: 0;
		opacity: 0.6;
		transition:
			opacity 0.15s,
			filter 0.15s;
	}

	.filters-trigger:hover,
	.filters-trigger.active {
		opacity: 1;
	}

	/* Lit while facet filters are active so the state is visible modal-closed. */
	.filters-trigger.active {
		filter: drop-shadow(0 0 6px var(--primary-color));
	}

	.popup-filter-chips {
		margin-bottom: 0.5rem;
	}

	.filters-row {
		justify-content: center;
		gap: 1.5rem;
	}

	.dashboard-toolbar-container:global(.hidden) {
		transform: translateY(-100%);
		opacity: 0;
		pointer-events: none;
		height: 0;
		padding-top: 0;
		padding-bottom: 0;
		overflow: hidden;
	}

	.color-dot-trigger {
		all: unset;
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.45rem;
		flex-shrink: 0;
	}

	.color-dot {
		display: block;
		width: 15px;
		height: 15px;
		flex-shrink: 0;
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
