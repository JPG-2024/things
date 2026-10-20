<script lang="ts">
	import ArticleList from '@/components/ArticleList.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState, articleFilters } from '@/stores/viewStore.svelte';
	import { INITIAL_TEMPLATE_ID } from '@/runners/templateConstants';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	const searchResults = $derived(viewState.rawSearchResults);

	// Created once so the transition function identity stays stable across renders.
	const articleItemTransition = tabAnimationStore.transitionFor('articles');

	// Raw search results are post-filtered client-side by the profile/domain
	// facets (category membership is not present on search rows).
	const filteredSearchResults = $derived.by(() => {
		const results = searchResults ?? [];
		if (!articleFilters.hasActive) return results;
		const profileIds = articleFilters.ids('profiles');
		const domainIds = articleFilters.ids('domains');
		return results.filter(({ article }) => {
			const profile = (article.profile ?? '').toLowerCase();
			const domain = (article.domain ?? '').toLowerCase();
			const profileOk = profileIds.length === 0 || profileIds.includes(profile);
			const domainOk = domainIds.length === 0 || domainIds.includes(domain);
			return profileOk && domainOk;
		});
	});

	const searchArticles = $derived(filteredSearchResults.map((result) => result.article));

	// ArticleList works on ArticleWithTasks[]; the match lookup is by article
	// identity so results are displayed even when `url` is missing.
	const searchMatches = $derived(
		new Map(filteredSearchResults.map((result) => [result.article, result.match]))
	);

	function handleClearSearch() {
		// Clears results, the committed filter and the typed draft, so coming
		// back from another route cannot re-trigger the auto raw search.
		viewState.clearUnifiedFilter();
		viewState.rawSearchResults = null;
	}

	const filtersActive = $derived(articleFilters.hasActive);

	$effect(() => {
		const onlyRaw = viewState.showOnlyRawArticles;
		const showOnlyInitial = viewState.showOnlyInitialArticles;
		void articleCacheStore.fetchArticlesWithoutProfile({
			onlyWithoutProfile: onlyRaw,
			profileIds: articleFilters.ids('profiles'),
			domainIds: articleFilters.ids('domains'),
			categoryIds: articleFilters.ids('categories'),
			templateId: showOnlyInitial ? INITIAL_TEMPLATE_ID : undefined,
			includeInitial: true
		});
	});
</script>

<div class="article-tab__container">
	{#if viewState.rawSearchLoading}
		<div class="empty-profiles-container">
			<div class="empty-profiles-pill">Searching raw content...</div>
		</div>
	{:else if searchResults !== null}
		<div class="search-results-header">
			<button type="button" class="search-results-clear" onclick={handleClearSearch}>
				{filteredSearchResults.length} result{filteredSearchResults.length !== 1 ? 's' : ''} — clear
			</button>
		</div>
		<ArticleList
			items={searchArticles}
			presetOverride="row"
			itemTransition={articleItemTransition}
			matchOf={(article) => searchMatches.get(article) ?? null}
			emptyMessage="No matches found"
		/>
	{:else if filtersActive && articleCacheStore.articlesWithoutProfile.length === 0 && !articleCacheStore.loadingArticles}
		<div class="empty-profiles-container">
			<button type="button" class="empty-profiles-pill" onclick={() => articleFilters.clear()}>
				0 results for active filters — clear
			</button>
		</div>
	{:else}
		<ArticleList
			items={articleCacheStore.articlesWithoutProfile}
			groupable
			itemTransition={articleItemTransition}
			loading={articleCacheStore.loadingArticles}
			hasMore={articleCacheStore.hasMoreArticles}
			onLoadMore={() => articleCacheStore.loadMoreArticles()}
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

	.empty-profiles-pill:hover {
		opacity: 1;
	}

	.search-results-header {
		display: flex;
		justify-content: center;
		padding: 1rem 0;
	}

	.search-results-clear {
		all: unset;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.15s;
		border: 1px solid var(--primary-color);
		border-radius: var(--radius-sm);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}

	.search-results-clear:hover {
		opacity: 1;
	}
</style>
