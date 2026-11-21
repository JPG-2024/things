<script lang="ts">
	import { onDestroy } from 'svelte';
	import ArticleList from '@/components/ArticleList.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState, articleFilters } from '@/stores/viewStore.svelte';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	// Clone of ArticlesTab pinned to the "music" category: every facet,
	// grouping toggle and the search branch behave the same, the list itself
	// just queries `categoryIds: [musicCategoryId]` (all articles of the
	// category, profile or not). The category facet is deliberately not
	// passed: it would fight the pin. The category is resolved by name
	// (case-insensitive) because ids are generated per workspace.
	const musicCategoryId = $derived(
		viewState.categories.find((category) => category.name.toLowerCase() === 'music')?.id ?? null
	);

	const searchResults = $derived(viewState.rawSearchResults);

	// Created once so the transition function identity stays stable across renders.
	const articleItemTransition = tabAnimationStore.transitionFor('music');

	// Raw search results are post-filtered client-side by the profile/domain
	// facets (category membership is not present on search rows) and by the
	// only-favorites toggle, so the "N results" header matches the list.
	const filteredSearchResults = $derived.by(() => {
		const results = searchResults ?? [];
		const onlyFavorites = viewState.onlyFavorites;
		if (!articleFilters.hasActive && !onlyFavorites) return results;
		const profileIds = articleFilters.ids('profiles');
		const domainIds = articleFilters.ids('domains');
		return results.filter(({ article }) => {
			if (onlyFavorites && article.favorite !== true) return false;
			if (!articleFilters.hasActive) return true;
			const profile = (article.profile ?? '').toLowerCase();
			const domain = (article.domain ?? '').toLowerCase();
			const profileOk = profileIds.length === 0 || profileIds.includes(profile);
			const domainOk = domainIds.length === 0 || domainIds.includes(domain);
			return profileOk && domainOk;
		});
	});

	const searchArticles = $derived(filteredSearchResults.map((result) => result.article));

	// ArticleList works on ArticleRecord[]; the match lookup is by article
	// identity so results are displayed even when `url` is missing.
	const searchMatches = $derived(
		new Map(filteredSearchResults.map((result) => [result.article, result.match]))
	);

	const filtersActive = $derived(articleFilters.hasActive);

	// Mirror of ArticlesTab's empty states, scoped to the music list.
	const noSearchResults = $derived(
		viewState.rawSearchResults !== null &&
			!viewState.rawSearchLoading &&
			filteredSearchResults.length === 0
	);
	const noFilterResults = $derived(
		filtersActive && articleCacheStore.musicArticles.length === 0 && !articleCacheStore.loadingMusic
	);
	const noResults = $derived(noSearchResults || noFilterResults);

	// Publish the empty state so the header can auto-close the filters strip.
	$effect(() => {
		viewState.dashboardNoResults = noResults;
	});

	onDestroy(() => {
		viewState.dashboardNoResults = false;
	});

	$effect(() => {
		const categoryId = musicCategoryId;
		if (!categoryId) return;
		const onlyRaw = viewState.showOnlyRawArticles;
		const showOnlyImported = viewState.showOnlyImportedArticles;
		void articleCacheStore.fetchMusic({
			categoryId,
			onlyWithoutProfile: onlyRaw,
			profileIds: articleFilters.ids('profiles'),
			domainIds: articleFilters.ids('domains'),
			mode: showOnlyImported ? 'metadata' : undefined,
			// Read here (not inside the store) so the effect re-runs on toggle.
			favorite: viewState.onlyFavorites
		});
	});
</script>

<div class="article-tab__container">
	{#if searchResults !== null}
		<ArticleList
			items={searchArticles}
			presetOverride="row"
			itemTransition={articleItemTransition}
			matchOf={(article) => searchMatches.get(article) ?? null}
			emptyMessage="No matches found"
		/>
	{:else if musicCategoryId === null}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">No "music" category yet</div>
		</div>
	{:else if noFilterResults}
		<div class="empty-profiles-container">
			<button type="button" class="empty-profiles-pill" onclick={() => articleFilters.clear()}>
				0 results for active filters — clear
			</button>
		</div>
	{:else}
		<ArticleList
			items={articleCacheStore.musicArticles}
			groupable
			itemTransition={articleItemTransition}
			loading={articleCacheStore.loadingMusic}
			hasMore={articleCacheStore.hasMoreMusic}
			onLoadMore={() => articleCacheStore.loadMoreMusic()}
			emptyMessage="No music articles"
		/>
	{/if}
</div>

<style>
	.article-tab__container {
		padding-left: 1.5rem;
		padding-right: 2rem;
	}
	.empty-profiles-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.empty-profiles-pill {
		opacity: 0.6;
		transition: opacity 0.15s;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}
</style>
