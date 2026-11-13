<script lang="ts">
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import { articleState } from '@/stores/articleStore.svelte';
	import Icon from './Icon.svelte';
	import LinkIcon from './LinkIcon.svelte';
	import Toolbar from './Toolbar.svelte';
	import ToolbarDivider from './ToolbarDivider.svelte';
	import { deleteArticleByUrl } from '@/stores/webStore';
	import { navigateBack } from '@/stores/navigationHistory.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { articleManager } from '@/runners/articleManager.svelte';
	import { embedAnalysis } from '@/lib/utils/embeddingAnalysis';
	import { errorStore } from '@/stores/errorStore.svelte';
	import FavoriteButton from './FavoriteButton.svelte';

	interface Props {
		onOpenFullContent?: () => void;
	}

	let { onOpenFullContent }: Props = $props();

	let isDeleting = $state(false);

	const article = $derived(articleState.currentArticle);

	/**
	 * The refresh of the article redoes the whole thing: the body, the
	 * thumbnail and the analysis. The analysis panel has its own, narrower
	 * rerun.
	 */
	function handleRefresh() {
		if (!article.url) return;
		articleManager.refresh(article.url);
	}

	async function handleGenerateEmbeddings() {
		const url = article.url;
		if (!url || !article.analysis?.windows.length) return;

		await embedAnalysis({
			url,
			windows: article.analysis.windows,
			categories: article.categories,
			// Re-indexing must keep the owner bucket (channel or domain), or the
			// chunks drop out of the chat retrieval scoped to a profile.
			profileId: article.profile ?? article.domain ?? undefined
		});

		viewState.embeddingsProcessed = true;
		setTimeout(() => {
			viewState.embeddingsProcessed = false;
		}, 1200);
	}

	async function handleDelete() {
		const url = article.url;
		if (!url || isDeleting) return;
		try {
			isDeleting = true;
			// Cancel first: the article can be deleted while it is queued or
			// being analysed, and the run must not write it back after the
			// delete (it aborts before its next persistence point).
			articleManager.forget(url);
			const res = await deleteArticleByUrl(url);
			if (res?.success) {
				articleCacheStore.invalidate();
				await navigateBack();
				// The url is gone: nothing on screen may keep pointing at it, or
				// the next open would enqueue the whole pipeline again.
				articleState.reset();
				viewState.url = null;
			} else {
				errorStore.report(new Error('deleteArticleByUrl returned success: false'), {
					feature: 'db',
					userMessage: 'Failed to delete the article',
					context: { url }
				});
			}
		} catch (err) {
			errorStore.report(err, {
				feature: 'db',
				userMessage: 'Failed to delete the article',
				context: { url }
			});
		} finally {
			isDeleting = false;
		}
	}
</script>

<div class="article-toolbar">
	<Toolbar justify="end" iconSize={22}>
		{#if article.url}
			<FavoriteButton url={article.url} />
		{/if}

		<Icon name="RefreshCcw" onClick={handleRefresh} tooltipProps={{ content: 'refresh article' }} />

		<Icon
			name="FileDigit"
			onClick={handleGenerateEmbeddings}
			tooltipProps={{ content: 'generate embeddings' }}
		/>

		{#if article.url}
			<button
				class="delete-btn"
				onclick={handleDelete}
				disabled={isDeleting}
				title="Delete article"
			>
				<Icon name="Trash" tooltipProps={{ content: 'delete article' }} />
			</button>
		{/if}

		<ToolbarDivider />

		{#if article.url}
			<LinkIcon url={article.url} />
		{/if}

		{#if article.url && onOpenFullContent}
			<Icon name="Code" tooltipProps={{ content: 'View full content (F)' }} />
		{/if}

		<Icon
			name="Settings"
			title="Settings"
			onClick={() => drawersState.open('settings')}
			tooltipProps={{ content: 'settings' }}
		/>
	</Toolbar>
</div>

<style>
	/* Sits at the end of the category-editor row: hug its icons instead of
	 * grabbing the flexible space, and push itself to the right edge. */
	.article-toolbar {
		flex: 0 0 auto;
	}

	/* The Toolbar's internal `width: 100%` + padding is meant for the topbar;
	 * inline in the meta row it must size to its icons. */
	.article-toolbar :global(.toolbar) {
		width: auto;
		padding: 0;
	}

	/* One pill chrome for every button in the bar: the style the favorite and
	 * full-content buttons already had, now shared by all of them. */
	.article-toolbar :global(button) {
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		transition: background-color 0.2s;
	}

	.article-toolbar :global(button:hover) {
		background-color: var(--hover-bg);
	}

	/* The underline hover of LinkIcon does not belong to the pill language. */
	.article-toolbar :global(.link:hover) {
		text-decoration: none;
	}

	.delete-btn {
		all: unset;
		cursor: pointer;
		color: white;
		line-height: 1;
	}

	.delete-btn[disabled] {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
