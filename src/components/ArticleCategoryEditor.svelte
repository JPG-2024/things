<script lang="ts">
	import { onMount } from 'svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleState } from '@/stores/articleStore.svelte';
	import { assignCategoriesToArticle, getArticleCategories } from '@/stores/webStore';
	import { addCategoryExemplar, buildCategoryText } from '@/lib/utils/categoryEmbeddings';
	import { classifyArticleCategory } from '@/runners/shared/taskFactories';
	import CategoryEditor from './CategoryEditor.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		articleUrl?: string | null;
		value?: string[];
	}

	let { articleUrl = null, value = [] }: Props = $props();

	let feedingId = $state<string | null>(null);
	let feedMessage = $state<string | null>(null);
	let feedError = $state(false);
	let reclassifying = $state(false);

	function categoryLabel(id: string): string {
		return viewState.categories.find((category) => category.id === id)?.name ?? id;
	}

	function dedupeIds(ids: string[]): string[] {
		return ids.filter((id, i, arr) => arr.indexOf(id) === i);
	}

	/**
	 * Persists a selection the user made in the pills and mirrors it into the
	 * article store, which is what feeds `value` back down.
	 */
	async function handleChange(nextIds: string[]) {
		if (!articleUrl) return;
		const ids = dedupeIds(nextIds);
		await assignCategoriesToArticle({ articleUrl, categoryIds: ids });
		if (articleState.isCurrent(articleUrl)) {
			articleState.setCategories(ids);
		}
	}

	/**
	 * Feeds the article into a category's exemplar set, using the same
	 * `title + summary` representation the classifier compares against.
	 */
	async function feedCategory(categoryId: string) {
		if (!articleUrl || feedingId) return;
		feedingId = categoryId;
		feedMessage = null;

		try {
			const analysis = articleState.currentArticle.analysis;
			const title = articleState.currentArticle.title;
			const text = buildCategoryText(analysis?.summary ?? '', title);
			if (!text) {
				feedError = true;
				feedMessage = 'No analysis text to feed';
				return;
			}
			await addCategoryExemplar({ categoryId, articleUrl, text });
			feedError = false;
			feedMessage = `Added to ${categoryLabel(categoryId)}`;
		} catch (error) {
			feedError = true;
			feedMessage = error instanceof Error ? error.message : 'Failed to add exemplar';
		} finally {
			feedingId = null;
		}
	}

	/**
	 * Forces a re-classification of the article. The pipeline only classifies
	 * articles that have no categories, so this is the explicit way to
	 * recalculate them.
	 */
	async function reclassify() {
		if (!articleUrl || reclassifying) return;
		reclassifying = true;
		feedMessage = null;

		try {
			const analysis = articleState.currentArticle.analysis;
			const title = articleState.currentArticle.title;
			const categoryIds = await classifyArticleCategory({
				title,
				summary: analysis?.summary ?? '',
				windows: analysis?.windows ?? []
			});

			if (categoryIds.length === 0) {
				feedError = true;
				feedMessage = 'No category matched';
				return;
			}

			await handleChange(categoryIds);
			feedError = false;
			feedMessage = `Recalculated: ${categoryIds.map(categoryLabel).join(', ')}`;
		} catch (error) {
			feedError = true;
			feedMessage = error instanceof Error ? error.message : 'Failed to recalculate';
		} finally {
			reclassifying = false;
		}
	}

	onMount(() => {
		// Load the persisted categories when the caller did not provide them.
		if (!articleUrl) return;
		void getArticleCategories(articleUrl).then((ids) => {
			if (ids.length === 0) return;
			if ((value ?? []).length > 0) return;
			if (articleState.isCurrent(articleUrl)) {
				articleState.setCategories(ids);
			}
		});
	});
</script>

<div class="article-category-editor">
	<CategoryEditor {value} onChange={handleChange}>
		{#snippet pillActions(id: string)}
			<button
				type="button"
				class="feed-btn"
				onclick={() => feedCategory(id)}
				disabled={feedingId !== null}
				aria-label="Add this article to {categoryLabel(id)} embeddings"
			>
				{#if feedingId === id}
					<Icon name="LoaderCircle" size={12} />
				{:else}
					<Icon
						name="FileDigit"
						size={15}
						tooltipProps={{ content: 'Add this category as example for auto category' }}
					/>
				{/if}
			</button>
		{/snippet}
		{#snippet trailingActions()}
			<button
				type="button"
				class="reclassify-btn"
				onclick={() => void reclassify()}
				disabled={reclassifying}
				aria-label="Recalculate the category of this article"
			>
				{#if reclassifying}
					<Icon name="LoaderCircle" size={14} />
				{:else}
					<Icon name="RefreshCcw" size={14} tooltipProps={{ content: 'recalculate category' }} />
				{/if}
			</button>
		{/snippet}
	</CategoryEditor>

	{#if feedMessage}
		<div class="feed-status" class:feed-error={feedError}>{feedMessage}</div>
	{/if}
</div>

<style>
	.article-category-editor {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
	}

	.feed-btn {
		opacity: 0.55;
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0 0.15rem;
		color: var(--primary-color);
		line-height: 1;
		display: inline-flex;
		align-items: center;
	}

	.feed-btn:hover:not(:disabled) {
		opacity: 1;
	}

	.feed-btn:disabled {
		cursor: default;
		opacity: 0.3;
	}

	.reclassify-btn {
		opacity: 0.55;
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0 0.2rem;
		color: var(--primary-color);
		line-height: 1;
		display: inline-flex;
		align-items: center;
	}

	.reclassify-btn:hover:not(:disabled) {
		opacity: 1;
	}

	.reclassify-btn:disabled {
		cursor: default;
		opacity: 0.3;
	}

	.feed-status {
		font-size: 0.72rem;
		opacity: 0.65;
		color: var(--primary-color);
	}

	.feed-status.feed-error {
		color: rgb(255, 140, 109);
		opacity: 0.9;
	}
</style>
