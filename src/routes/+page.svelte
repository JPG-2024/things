<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { fly, fade } from 'svelte/transition';
	import Icon from '@/components/Icon.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import { readClipboardAndHandle } from '@/lib/utils/clipboard';
	import {
		viewState,
		drawersState,
		voiceSettingsState,
		articleFilters
	} from '@/stores/viewStore.svelte';
	import type { AiProvider, RawSearchResult } from '@/stores/viewStore.svelte';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';
	import type { ProfileArticleTabId } from '@/stores/tabAnimationStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import {
		deleteProfileById,
		getCategories,
		mapArticlesFromRecords,
		type WebStoreArticleRecord
	} from '@/stores/webStore';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import Toolbar from '@/components/Toolbar.svelte';
	import ToolbarDivider from '@/components/ToolbarDivider.svelte';
	import { startLlamaHealthPolling } from '@/lib/utils/llamaHealth';
	import { startExternalServicesHealthPolling } from '@/lib/utils/externalServicesHealth';
	import ProfileArticleTabs from '@/components/ProfileArticleTabs.svelte';
	import ArticleFiltersSidebar from '@/components/ArticleFiltersSidebar.svelte';
	import Input from '@/components/inputs/Input.component.svelte';

	// Toolbar auto-hide while scrolling the dashboard: re-enable by restoring
	// the import and adding `use:autoHide={{ scrollContainerId: 'dashboard-content' }}`
	// to the dashboard-toolbar-container div below.
	// import { autoHide } from '@/lib/actions/autoHide';
	import ProfilesTab from './tabs/ProfilesTab.svelte';
	import CategoriesTab from './tabs/CategoriesTab.svelte';
	import ArticlesTab from './tabs/ArticlesTab.svelte';
	import DomainsTab from './tabs/DomainsTab.svelte';

	// Header provider switch: icon-only pills backed by the same
	// `viewState.aiProvider` the Settings modal writes, so both stay in sync.
	// Lucide has no brand logos, so each provider gets a representative icon.
	const AI_PROVIDER_TABS = [
		{ id: 'llama', label: 'Llama (local)', icon: 'Cpu' },
		{ id: 'openrouter', label: 'OpenRouter', icon: 'Route' },
		{ id: 'opencode', label: 'OpenCode Go', icon: 'Terminal' }
	];

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

	let toolbarEl = $state<HTMLDivElement>();
	let searchInput = $state<{ focus: () => void } | null>(null);
	let filtersColumnEl = $state<HTMLDivElement>();
	let filtersAnchorEl = $state<HTMLDivElement>();

	// Focus the page search whenever the filters panel opens (F, icon, typing).
	$effect(() => {
		if (articleFilters.filtersPanelVisible) searchInput?.focus();
	});

	// Click-outside dismissal for the filters column. `pointerdown` (not
	// `click`) so a drag-select that starts inside and ends outside does not
	// dismiss it. Bind to the whole left column instead of the sidebar card so
	// its gutter and scrollbar count as inside.
	$effect(() => {
		if (!articleFilters.filtersPanelVisible) return;

		function handlePointerDown(event: PointerEvent) {
			if (event.button !== 0) return;
			const target = event.target as Node | null;
			if (!target) return;
			if (filtersColumnEl?.contains(target)) return;
			// Search input + filter trigger open the panel and must not dismiss
			// it: closing here would make the icon's own click re-toggle it open
			// and the input's focus handler reopen it mid-typing.
			if (filtersAnchorEl?.contains(target)) return;
			articleFilters.filtersPanelVisible = false;
		}

		window.addEventListener('pointerdown', handlePointerDown, true);
		return () => window.removeEventListener('pointerdown', handlePointerDown, true);
	});

	/** "Search in articles content" button: commits the typed term, runs the
	 * raw search and closes the filters panel. */
	function handleSearchInContent() {
		viewState.commitUnifiedFilter();
		void handleRawSearch(viewState.unifiedFilterDraft, true);
		articleFilters.filtersPanelVisible = false;
	}

	async function handleRawSearch(pattern: string, force = false) {
		const trimmed = pattern.trim();
		if (trimmed.length < 4) return;
		// Single-flight: the committed filter change re-runs this via the
		// debounced effect ~1 s after the direct call. Skip the re-run when the
		// same pattern already has results on screen; the button passes
		// `force` to refresh. Checking `rawSearchResults` (not just the
		// pattern) lets a cleared search (results = null) run again.
		if (
			!force &&
			trimmed === viewState.rawSearchLastPattern &&
			viewState.rawSearchResults !== null
		) {
			return;
		}
		viewState.rawSearchLastPattern = trimmed;
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

	const pHotkey = createHotkey(
		'P',
		async () => {
			if (!viewState.hoveredProfileName) return;
			const profile = articleCacheStore.profilesWithArticles.find(
				(p) => p.name === viewState.hoveredProfileName
			);
			if (!profile) return;
			try {
				await scrapStore.fetchMissingProfileVideos(profile.id, { maxVideos: 1 });
			} catch (error) {
				console.error('Failed to fetch profile videos', error);
			}
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

	// Visual tab order, matching the tabs row (PROFILE_ARTICLE_TABS): ArrowRight
	// moves to the tab on its right, ArrowLeft to the one on its left. TTS owns
	// the plain arrows while playback is active (seek), and overlays own them
	// otherwise, so the switch stays disabled then.
	const TAB_ORDER: ProfileArticleTabId[] = ['articles', 'profiles', 'domains', 'categories'];

	function switchTab(delta: 1 | -1) {
		const currentIndex = TAB_ORDER.indexOf(viewState.activeProfileArticleTab);
		const next = TAB_ORDER[currentIndex + delta];
		if (!next) return;
		tabAnimationStore.recordTabChange(next);
		viewState.activeProfileArticleTab = next;
	}

	const leftHotkey = createHotkey(
		'ArrowLeft',
		() => switchTab(-1),
		() => ({
			enabled: !viewState.overlayOpen && !ttsState.isPlaying && !ttsState.isPaused,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	const rightHotkey = createHotkey(
		'ArrowRight',
		() => switchTab(1),
		() => ({
			enabled: !viewState.overlayOpen && !ttsState.isPlaying && !ttsState.isPaused,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	// Global health polling: the flags it writes into `viewState` are rendered
	// by the Settings modal's Services block, so it runs here (always mounted)
	// instead of only while the modal is open.
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
	/* Auto-hide on scroll intentionally disabled for the filters panel layout.
	   To re-enable, restore the action import and add:
	   use:autoHide={{ scrollContainerId: 'dashboard-content' }} */
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
			<div class="toolbar-center" bind:this={filtersAnchorEl}>
				<Input
					type="text"
					bind:this={searchInput}
					bind:value={viewState.unifiedFilterDraft}
					search
					keepValueOnEnter
					onEnter={() => viewState.commitUnifiedFilter()}
					onFocus={() => void articleFilters.openFiltersPanel()}
				/>
				<button
					type="button"
					class="filters-trigger"
					class:active={articleFilters.hasActive || articleFilters.filtersPanelVisible}
					onclick={() => void articleFilters.toggleFiltersPanel()}
					aria-label="Toggle article filters"
				>
					<Icon name="Filter" />
				</button>
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

				<button type="button" class="settings-trigger" aria-label="Toggle read copied text">
					<ToggleIcon
						name="MessageSquareText"
						bind:checked={viewState.clipboardTtsEnabled}
						tooltipProps={{ content: 'read copied text' }}
					/>
				</button>
				<button type="button" class="settings-trigger" aria-label="Toggle capture only on paste">
					<ToggleIcon
						name="File"
						bind:checked={viewState.captureOnlyOnPaste}
						tooltipProps={{ content: 'capture only (no analysis)' }}
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

				<button type="button" class="settings-trigger" aria-label="Toggle glow effects">
					<ToggleIcon
						name="Sparkles"
						bind:checked={viewState.glowEnabled}
						tooltipProps={{ content: 'glow effects' }}
					/>
				</button>

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
		<ToolbarDivider />
		<Tabs
			tabs={AI_PROVIDER_TABS}
			activeTab={viewState.aiProvider}
			onTabChange={(id) => (viewState.aiProvider = id as AiProvider)}
			iconOnly
			iconSize={18}
		/>
	</div>
</div>

<div
	class="dashboard-container"
	class:filters-open={articleFilters.filtersPanelVisible}
	style:--filters-panel-width="{viewState.filtersPanelWidth}px"
>
	<!-- Always-rendered left track: the grid template animates 0 ↔ panel width
	     so the lists push right smoothly; content mounts with a fly transition. -->
	<div class="filters-column" bind:this={filtersColumnEl}>
		<div class="filters-column-scroll">
			{#if articleFilters.filtersPanelVisible}
				<div
					class="filters-sidebar-slot"
					in:fly={{ x: -20, duration: 100 }}
					out:fly={{ x: -20, duration: 100 }}
				>
					<ArticleFiltersSidebar onSearchInContent={handleSearchInContent} />
				</div>
			{/if}
		</div>
	</div>
	<div id="dashboard-content" class="dashboard-content" class:snap-on={viewState.gridSnapEnabled}>
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

	.dashboard-container {
		display: grid;
		grid-template-columns: 0px minmax(0, 1fr);
		transition: grid-template-columns 15ms ease-out;

		width: 100%;
		height: 100vh;
		overflow: hidden;
	}

	/* Filters left panel column: 0 collapsed, the configured width when open. */
	.dashboard-container.filters-open {
		grid-template-columns: var(--filters-panel-width, 400px) minmax(0, 1fr);
	}

	.filters-column {
		grid-column: 1;
		min-width: 0;
		overflow: hidden;
		background-image: linear-gradient(
			145deg,
			rgba(0, 0, 0) 0%,
			color-mix(in srgb, var(--primary-color) 15%, transparent) 20%,
			color-mix(in srgb, var(--bg-color) 12%, black) 45%,
			transparent 65%,
			transparent 100%
		);
	}

	.filters-column-scroll {
		height: 100%;
		overflow-y: auto;
		padding: 10rem 0.5rem 2rem 1rem;
	}

	.dashboard-content {
		overflow-y: auto;
		padding-top: 10rem;
		/* Keeps a snapped row (its cards) below the fixed toolbar. Only
		   meaningful while `scroll-snap-type` is set by `.snap-on`. */
		scroll-padding-top: 10rem;
	}

	/* Opt-in row snapping of the entity grid (Settings → Cards → Grid). The
	   grid rows are static while scrolling, so their snap points never move.
	   `proximity`, not `mandatory`: rows differ in height and a row taller
	   than the viewport would trap the scroll otherwise. */
	.dashboard-content.snap-on {
		scroll-snap-type: y proximity;
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
			color-mix(in srgb, var(--primary-color), black 98%),
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

	/* Search input stretches to fill the center slot next to the filter icon. */
	.toolbar-center :global(.search-wrapper) {
		flex: 1;
		min-width: 0;
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
