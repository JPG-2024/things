<script lang="ts">
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import { articleState } from '@/stores/articleStore.svelte';
	import Icon from './Icon.svelte';
	import LinkIcon from './LinkIcon.svelte';
	import Topbar from './layout/Topbar.svelte';
	import Toolbar from './Toolbar.svelte';
	import { deleteArticleByUrl, markArticleAsViewed } from '@/stores/webStore';
	import { navigateBack, createBackHotkey } from '@/stores/navigationHistory.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { articleManager } from '@/runners/articleManager.svelte';
	import { embedAnalysis } from '@/lib/utils/embeddingAnalysis';
	import ToolbarDivider from './ToolbarDivider.svelte';

	interface Props {
		headerContent?: any;
		contentSnippet?: any;
	}

	const { headerContent, contentSnippet } = $props();
	let isDeleting = $state(false);

	// ArrowLeft returns to the route this post was opened from.
	createBackHotkey();

	$effect(() => {
		return () => {
			if (viewState.url) {
				void markArticleAsViewed(viewState.url);
			}
		};
	});

	/**
	 * The refresh of the top bar redoes the whole article: the body, the
	 * thumbnail and the analysis. The analysis panel has its own, narrower
	 * rerun.
	 */
	function handleRefresh() {
		if (!viewState.url) return;
		articleManager.refresh(viewState.url);
	}

	async function handleGenerateEmbeddings() {
		const article = articleState.currentArticle;
		if (!article.url || !article.analysis?.windows.length) return;

		await embedAnalysis({
			url: article.url,
			windows: article.analysis.windows,
			categories: article.categories
		});

		viewState.embeddingsProcessed = true;
		setTimeout(() => {
			viewState.embeddingsProcessed = false;
		}, 1200);
	}

	async function handleDelete() {
		if (!viewState.url || isDeleting) return;
		try {
			isDeleting = true;
			const res = await deleteArticleByUrl(viewState.url);
			if (res?.success) {
				articleCacheStore.invalidate();
				void navigateBack();
			} else {
				console.error('Failed to delete article');
			}
		} catch (err) {
			console.error('Error deleting article', err);
		} finally {
			isDeleting = false;
		}
	}
</script>

<article>
	<Topbar loading={viewState.embeddingsLoading}>
		<Toolbar justify="end" iconSize={20}>
			<Icon
				name="RefreshCcw"
				onClick={handleRefresh}
				tooltipProps={{ content: 'refresh article' }}
			/>

			<Icon
				name="FileDigit"
				onClick={handleGenerateEmbeddings}
				tooltipProps={{ content: 'generate embeddings' }}
			/>

			{#if viewState.url && !viewState.loading}
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

			<LinkIcon url={viewState.url!} />
			<Icon
				name="Settings"
				title="Settings"
				onClick={() => drawersState.open('settings')}
				tooltipProps={{ content: 'settings' }}
			/>
		</Toolbar>
	</Topbar>

	<div class="header">
		{#if headerContent}
			{@render headerContent()}
		{/if}
	</div>

	{@render contentSnippet()}
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		gap: 0.2em;
		padding-top: 33px;
		box-sizing: border-box;
		width: 100%;
		margin: 0 auto;
		margin-bottom: 30px;
	}

	.header {
		display: flex;
		flex-direction: column;
		gap: 15px;
		width: 100%;
	}

	.delete-btn {
		all: unset;
		cursor: pointer;
		border-radius: var(--radius-md);
		padding: 6px 10px;
		color: white;
		line-height: 1;
	}

	.delete-btn[disabled] {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (prefers-color-scheme: dark) {
		:root {
			background-color: #2f2f2f;
			color: #f6f6f6;
		}
	}
</style>
