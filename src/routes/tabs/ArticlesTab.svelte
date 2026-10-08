<script lang="ts">
	import ArticleList from '@/components/ArticleList.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { INITIAL_TEMPLATE_ID } from '@/runners/templateConstants';
	import { tabAnimationStore } from '@/stores/tabAnimationStore.svelte';

	const searchResults = $derived(viewState.rawSearchResults);

	// Created once so the transition function identity stays stable across renders.
	const articleItemTransition = tabAnimationStore.transitionFor('articles');

	const searchArticles = $derived((searchResults ?? []).map((result) => result.article));

	// ArticleList works on ArticleWithTasks[]; the match lookup is by article
	// identity so results are displayed even when `url` is missing.
	const searchMatches = $derived(
		new Map((searchResults ?? []).map((result) => [result.article, result.match]))
	);

	function handleClearSearch() {
		viewState.rawSearchResults = null;
	}

	$effect(() => {
		const onlyRaw = viewState.showOnlyRawArticles;
		const profileId = viewState.activeArticleProfileId;
		const showOnlyInitial = viewState.showOnlyInitialArticles;
		void articleCacheStore.fetchArticlesWithoutProfile({
			onlyWithoutProfile: onlyRaw,
			profileId: profileId ?? undefined,
			templateId: showOnlyInitial ? INITIAL_TEMPLATE_ID : undefined
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
				{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — clear
			</button>
		</div>
		<ArticleList
			items={searchArticles}
			itemTransition={articleItemTransition}
			matchOf={(article) => searchMatches.get(article) ?? null}
			emptyMessage="No matches found"
		/>
	{:else}
		<ArticleList
			items={articleCacheStore.articlesWithoutProfile}
			itemTransition={articleItemTransition}
			loading={articleCacheStore.loadingArticles}
			hasMore={articleCacheStore.hasMoreArticles}
			onLoadMore={() => articleCacheStore.loadMoreArticles()}
		/>
	{/if}
</div>

<style>
	.article-tab__container {
		padding-left: 1rem;
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
