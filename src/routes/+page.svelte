<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
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
	import Toolbar from '@/components/Toolbar.svelte';
	import ToolbarDivider from '@/components/ToolbarDivider.svelte';
	import { startLlamaHealthPolling } from '@/lib/utils/llamaHealth';
	import { startExternalServicesHealthPolling } from '@/lib/utils/externalServicesHealth';
	import { tooltip } from '@/lib/actions/tooltip';
	import ProfileArticleTabs from '@/components/ProfileArticleTabs.svelte';
	import ArticleFiltersSidebar from '@/components/ArticleFiltersSidebar.svelte';
	import Input from '@/components/inputs/Input.component.svelte';

	// Toolbar auto-hide while scrolling the dashboard: re-enable by restoring
	// the import and adding `use:autoHide={{ scrollContainerId: 'dashboard-content' }}`
	// to the dashboard-toolbar-container div below. The toolbar sits in normal
	// flow (not fixed), so autoHide's translateY/height:0 hide would reflow the
	// dashboard instead of overlaying it — rework needed before re-enabling.
	// import { autoHide } from '@/lib/actions/autoHide';
	import ProfilesTab from './tabs/ProfilesTab.svelte';
	import CategoriesTab from './tabs/CategoriesTab.svelte';
	import ArticlesTab from './tabs/ArticlesTab.svelte';
	import FavoritesTab from './tabs/FavoritesTab.svelte';
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

	let toolbarEl = $state<HTMLDivElement>();
	let searchInput = $state<{ focus: () => void } | null>(null);
	let filtersStripEl = $state<HTMLDivElement>();
	let filtersAnchorEl = $state<HTMLDivElement>();

	// Focus the page search whenever the filters panel opens (F, icon, typing).
	$effect(() => {
		if (articleFilters.filtersPanelVisible) searchInput?.focus();
	});

	// Click-outside dismissal for the filters strip. `pointerdown` (not
	// `click`) so a drag-select that starts inside and ends outside does not
	// dismiss it. Bind to the whole strip instead of the sidebar card so its
	// gutter and scrollbar count as inside.
	$effect(() => {
		if (!articleFilters.filtersPanelVisible) return;

		function handlePointerDown(event: PointerEvent) {
			if (event.button !== 0) return;
			const target = event.target as Node | null;
			if (!target) return;
			if (filtersStripEl?.contains(target)) return;
			// The search input opens the panel and must not dismiss it: closing
			// here would make its own focus handler reopen it mid-typing.
			if (filtersAnchorEl?.contains(target)) return;
			articleFilters.filtersPanelVisible = false;
		}

		window.addEventListener('pointerdown', handlePointerDown, true);
		return () => window.removeEventListener('pointerdown', handlePointerDown, true);
	});

	// Auto-close the strip once it stops being useful: no active facets, or a
	// zero-result view. The transition guard is what keeps manual opens working
	// while the condition already holds (e.g. F with no filters selected yet).
	// `filtersPanelVisible` is deliberately not read here, so closing cannot
	// re-trigger this effect.
	let filtersUnproductive = false;
	$effect(() => {
		const unproductive = !articleFilters.hasActive || viewState.dashboardNoResults;
		if (unproductive && !filtersUnproductive) {
			articleFilters.filtersPanelVisible = false;
		}
		filtersUnproductive = unproductive;
	});

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
	const TAB_ORDER: ProfileArticleTabId[] = [
		'articles',
		'favorites',
		'profiles',
		'domains',
		'categories'
	];

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
	/* Auto-hide on scroll intentionally disabled for the filters panel layout
	   (and the toolbar is in normal flow now, so hiding it would reflow the
	   dashboard rather than overlay it). To re-enable, restore the action
	   import and add:
	   use:autoHide={{ scrollContainerId: 'dashboard-content' }} */
>
	<div class="page-topbar">
		<Toolbar layout="grid" iconSize={20}>
			<div class="toolbar-leading">
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
					{#if articleFilters.hasActive}
						<button
							type="button"
							class="filters-trigger"
							onclick={() => articleFilters.clearAll()}
							aria-label="Clear article filters"
							use:tooltip={{ content: 'Clear filters {shift+f}' }}
						>
							<Icon name="FunnelX" />
						</button>
					{/if}
				</div>
			</div>
			<div class="toolbar-tabs">
				<ProfileArticleTabs />
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
						name="Plug"
						bind:checked={viewState.glowEnabled}
						tooltipProps={{ content: 'glow effects' }}
					/>
				</button>

				<label
					class="color-dot-trigger"
					aria-label="Change primary color"
					use:tooltip={{ content: 'Change primary color' }}
				>
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

	<!-- Filters strip lives inside the header. Its grid row animates 0fr ↔ 1fr,
	     so opening the panel grows the toolbar and pushes the dashboard down
	     smoothly; the panel content mounts on open and fades in. -->
	<div
		class="filters-strip"
		class:filters-open={articleFilters.filtersPanelVisible}
		bind:this={filtersStripEl}
	>
		<div class="filters-strip-scroll">
			{#if articleFilters.filtersPanelVisible}
				<div class="filters-sidebar-slot">
					<ArticleFiltersSidebar />
				</div>
			{/if}
		</div>
	</div>
</div>

<div class="dashboard-container">
	<div id="dashboard-content" class="dashboard-content" class:snap-on={viewState.gridSnapEnabled}>
		{#if viewState.activeProfileArticleTab === 'profiles'}
			<ProfilesTab />
		{:else if viewState.activeProfileArticleTab === 'domains'}
			<DomainsTab />
		{:else if viewState.activeProfileArticleTab === 'favorites'}
			<FavoritesTab />
		{:else if viewState.activeProfileArticleTab === 'categories'}
			<CategoriesTab />
		{:else}
			<ArticlesTab />
		{/if}
	</div>
</div>

<style>
	.page-topbar {
		/* Single header row: (title + search) | tabs | toolbar. The two 1fr side
		   tracks are equal, so the center tabs track is viewport-centered.
		   Toolbar.svelte reads these vars so its scoped grid styles never have
		   to fight specificity. */
		--search-width: clamp(120px, 14vw, 200px);
		--toolbar-grid-columns: 1fr auto 1fr;
		--toolbar-grid-areas: 'leading tabs actions';
	}

	/* Groups title + search on the left in the single-row layout. When the tabs
	   wrap, `display: contents` dissolves this box so its children become grid
	   items again and can occupy their own rows. */
	.toolbar-leading {
		grid-area: leading;
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		grid-area: actions;
		justify-self: end;
		/* Wrap instead of overflowing when the window is narrow. */
		flex-wrap: wrap;
		justify-content: flex-end;
		row-gap: 0.3rem;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 2rem;
		grid-area: title;
		justify-self: start;
	}

	.toolbar-tabs {
		display: flex;
		align-items: center;
		grid-area: tabs;
		justify-self: center;
		width: max-content;
		max-width: 100%;
		min-width: 0;
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
		/* One minmax(0, 1fr) row gives `.dashboard-content` a definite height,
		   so its `overflow-y: auto` actually scrolls the article list (and
		   anchors ArticleList's sticky rail) instead of being clipped by this
		   box's `overflow: hidden`. The filters strip no longer occupies a row
		   here — it lives in the toolbar above. */
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		/* Full-bleed: span the viewport (main insets its children by the page
		   gutter) while `.dashboard-content` re-applies the gutter to the
		   article grid. */
		width: calc(100% + 2 * var(--page-gutter-x));
		margin-inline: calc(var(--page-gutter-x) * -1);
		/* In flow under the header: main is a 100vh flex column, so this fills
		   whatever height the (possibly taller, filters-open) toolbar leaves.
		   No fixed-toolbar clearance padding needed. */
		flex: 1 1 0%;
		min-height: 0;
		overflow: hidden;
	}

	/* Filters strip inside the header: the row animates 0fr ↔ 1fr so the
	   toolbar grows and pushes the dashboard down. Negative side margins
	   cancel the toolbar padding to keep the strip full-bleed. */
	.filters-strip {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 180ms ease;
		margin-inline: calc(var(--toolbar-padding) * -1);

		overflow: hidden;
		/* 		background-image: linear-gradient(
			45deg,
			rgba(0, 0, 0) 0%,
			transparent 10%,
			color-mix(in srgb, var(--bg-color) 12%, rgb(12, 12, 12)) 20%,
			rgba(0, 0, 0) 50%,
			color-mix(in srgb, var(--primary-color) 12%, rgb(13, 13, 13)) 60%,
			transparent 65%,
			transparent 100%
		);
		box-shadow: inset 0 0 10px color-mix(in srgb, var(--primary-color) 20%, transparent); */
	}

	.filters-strip.filters-open {
		grid-template-rows: 1fr;
	}

	.filters-strip-scroll {
		box-sizing: border-box;
		overflow: hidden;
		padding-inline: (--page-gutter-x);
		padding-top: 1rem;
	}

	.dashboard-content {
		overflow-y: auto;
		padding-inline: var(--page-gutter-x);
	}

	/* Opt-in row snapping of the entity grid (Settings → Cards → Grid). The
	   grid rows are static while scrolling, so their snap points never move.
	   `proximity`, not `mandatory`: rows differ in height and a row taller
	   than the viewport would trap the scroll otherwise. */
	.dashboard-content.snap-on {
		scroll-snap-type: y proximity;
	}

	.dashboard-toolbar-container {
		/* In normal flow (was fixed): main is a 100vh flex column and the
		   dashboard below flexes to fill the remaining height, so the header
		   needs no clearance padding and stays aligned with the content.
		   The header is a single Toolbar, so no flex-column stack is needed. */
		--toolbar-padding: 18px;
		position: relative;
		z-index: 10;
		width: 100%;
		flex-shrink: 0;
		/* Horizontal inset comes from main's --page-gutter-x (was 2rem, which
		   misaligned the toolbar against the article grid). */
		padding: var(--toolbar-padding);
		opacity: 1;
		background-image: linear-gradient(
			45deg,
			rgba(0, 0, 0) 0%,
			transparent 10%,
			color-mix(in srgb, var(--bg-color) 12%, rgb(12, 12, 12)) 20%,
			rgba(0, 0, 0) 50%,
			color-mix(in srgb, var(--primary-color) 12%, rgb(13, 13, 13)) 60%,
			transparent 65%,
			transparent 100%
		);
		box-shadow: inset 0 0 10px color-mix(in srgb, var(--primary-color) 20%, transparent);
	}

	.toolbar-center {
		display: flex;
		align-items: center;
		grid-area: search;
		width: var(--search-width);
		min-width: 0;
		flex-shrink: 1;
		gap: 0.3rem;
	}

	/* Below ~1200px title + search + tabs + toolbar stop fitting in one row.
	   Only the tabs wrap: row 1 keeps `title | search | actions`, row 2 gives
	   the tabs a full-width centered strip. */
	@media (max-width: 1200px) {
		.page-topbar {
			--toolbar-grid-columns: auto minmax(0, 1fr) auto;
			--toolbar-grid-areas: 'title search actions' 'tabs tabs tabs';
		}

		.toolbar-leading {
			display: contents;
		}

		.toolbar-center {
			width: 100%;
		}
	}

	/* Even narrower: the search drops to its own row as it did before, while
	   the tabs stay on the last row. */
	@media (max-width: 1000px) {
		.page-topbar {
			--toolbar-grid-areas: 'title title actions' 'search search search' 'tabs tabs tabs';
		}

		.toolbar-center {
			max-width: 40rem;
			margin-inline: auto;
		}
	}

	@media (max-width: 700px) {
		.toolbar-center {
			max-width: none;
		}
	}

	/* Search input stretches to fill the center slot next to the filter icon. */
	.toolbar-center :global(.search-wrapper) {
		flex: 1;
	}

	.filters-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.35rem;
		flex-shrink: 0;
		/* Only mounted while a facet is active, so it is always "lit". */
		filter: drop-shadow(0 0 6px var(--primary-color));
		transition: filter 0.15s;
	}

	.filters-trigger:hover {
		filter: drop-shadow(0 0 10px var(--primary-color));
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
