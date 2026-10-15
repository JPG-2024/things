<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import CategoryItem from '@/components/CategoryItem.svelte';
	import ArticleList from '@/components/ArticleList.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getCategoryExemplars, type WebStoreCategoryExemplarRecord } from '@/stores/webStore';
	import { removeCategoryExemplar } from '@/lib/utils/categoryEmbeddings';

	let categoryId = $derived(page.params.categoryId);
	let categoryName = $derived(page.url.searchParams.get('name') ?? categoryId);
	let categoryDescription = $derived(
		viewState.categories.find((c) => c.id === categoryId)?.description ?? null
	);

	let exemplars = $state<WebStoreCategoryExemplarRecord[]>([]);
	let loadingExemplars = $state(false);
	let deletingId = $state<string | null>(null);
	let exemplarError = $state<string | null>(null);

	async function loadExemplars() {
		loadingExemplars = true;
		exemplarError = null;
		try {
			exemplars = await getCategoryExemplars(categoryId);
		} finally {
			loadingExemplars = false;
		}
	}

	async function handleDeleteExemplar(exemplar: WebStoreCategoryExemplarRecord) {
		if (deletingId) return;
		deletingId = exemplar.id;
		exemplarError = null;
		try {
			await removeCategoryExemplar(exemplar.id);
			exemplars = exemplars.filter((entry) => entry.id !== exemplar.id);
		} catch (error) {
			exemplarError = error instanceof Error ? error.message : 'Failed to delete exemplar';
		} finally {
			deletingId = null;
		}
	}

	function exemplarLabel(exemplar: WebStoreCategoryExemplarRecord): string {
		return exemplar.articleTitle?.trim() || exemplar.articleUrl;
	}

	function exemplarPreview(text: string): string {
		const compact = text.replace(/\s+/g, ' ').trim();
		return compact.length > 140 ? `${compact.slice(0, 140)}…` : compact;
	}

	onMount(async () => {
		await Promise.all([
			articleCacheStore.fetchArticlesByCategory(categoryId, { force: true }),
			loadExemplars()
		]);
	});

	function handleBack() {
		goto('/');
	}
</script>

<div class="category-page">
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={handleBack} aria-label="Go back">
			<Icon name="ArrowLeft" size={24} />
		</button>
	</div>

	<div class="category-header">
		<h1 class="category-name"><CategoryItem value={categoryName} /></h1>
		{#if categoryDescription}
			<p class="category-description">{categoryDescription}</p>
		{/if}
	</div>

	<section class="exemplars">
		<div class="exemplars-head">
			<h2 class="exemplars-title">Embedding examples</h2>
			{#if !loadingExemplars}
				<span class="exemplars-count">{exemplars.length}</span>
			{/if}
		</div>

		{#if exemplarError}
			<p class="exemplars-error">{exemplarError}</p>
		{/if}

		{#if loadingExemplars}
			<p class="exemplars-note">Loading…</p>
		{:else if exemplars.length === 0}
			<p class="exemplars-note">
				No examples yet. This category won't be assigned automatically until you feed it from an
				article.
			</p>
		{:else}
			<ul class="exemplar-list">
				{#each exemplars as exemplar (exemplar.id)}
					<li class="exemplar-row">
						<div class="exemplar-body">
							<span class="exemplar-name">{exemplarLabel(exemplar)}</span>
							<span class="exemplar-text">{exemplarPreview(exemplar.text)}</span>
						</div>
						<button
							type="button"
							class="exemplar-delete"
							onclick={() => handleDeleteExemplar(exemplar)}
							disabled={deletingId !== null}
							aria-label="Delete example {exemplarLabel(exemplar)}"
						>
							<Icon name="Trash" size={14} />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<div class="articles-container">
		<ArticleList
			items={articleCacheStore.categoryArticles}
			loading={articleCacheStore.loadingCategoryArticles}
			hasMore={articleCacheStore.hasMoreCategoryArticles}
			onLoadMore={() => articleCacheStore.loadMoreCategoryArticles()}
		/>
	</div>
</div>

<style>
	.category-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		padding: 3rem;
		padding-right: 5rem;
		width: 100%;
	}

	.top-bar {
		width: 100%;
		margin-bottom: 1rem;
	}

	.back-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		transition: background 0.15s;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.category-header {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}

	.category-name {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--primary-color);
		margin: 0;
		text-transform: capitalize;
	}

	.category-description {
		font-size: 0.9rem;
		color: var(--primary-color);
		opacity: 0.6;
		margin: 0;
	}

	.exemplars {
		width: 100%;
		max-width: 720px;
		margin-bottom: 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.exemplars-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.exemplars-title {
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.6;
		color: var(--primary-color);
		margin: 0;
	}

	.exemplars-count {
		font-size: 0.75rem;
		opacity: 0.5;
		color: var(--primary-color);
	}

	.exemplars-note {
		font-size: 0.82rem;
		opacity: 0.55;
		color: var(--primary-color);
		margin: 0;
	}

	.exemplars-error {
		font-size: 0.82rem;
		color: rgb(255, 140, 109);
		margin: 0;
	}

	.exemplar-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.exemplar-row {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.exemplar-body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}

	.exemplar-name {
		font-size: 0.85rem;
		color: var(--primary-color);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.exemplar-text {
		font-size: 0.75rem;
		opacity: 0.5;
		color: var(--primary-color);
	}

	.exemplar-delete {
		opacity: 0.5;
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0.15rem;
		color: var(--primary-color);
		line-height: 1;
		flex-shrink: 0;
	}

	.exemplar-delete:hover:not(:disabled) {
		opacity: 1;
	}

	.exemplar-delete:disabled {
		cursor: default;
		opacity: 0.25;
	}

	.articles-container {
		width: 100%;
	}
</style>
