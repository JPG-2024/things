<script lang="ts">
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import Icon from './Icon.svelte';
	import LinkIcon from './LinkIcon.svelte';
	import Topbar from './layout/Topbar.svelte';
	import Toolbar from './Toolbar.svelte';
	import StringReveal from './StringReveal.svelte';
	import ToggleIcon from './ToggleIcon.svelte';
	import { deleteArticleByUrl, markArticleAsViewed } from '@/stores/webStore';
	import { goto } from '$app/navigation';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import {
		generateEmbeddingsFromTasks,
		extractCategoryFromTasks
	} from '@/lib/utils/embeddingTasks';
	import { EMBEDDING_MODEL } from '@/lib/utils/inference/constants';
	import TemplateManager from './TemplateManager.svelte';
	import ToolbarDivider from './ToolbarDivider.svelte';

	const TOOLBAR_ICON_SIZE = 18;

	interface Props {
		headerContent?: any;
		contentSnippet?: any;
	}

	const { headerContent, contentSnippet } = $props();
	let isDeleting = $state(false);
	let showTemplateManager = $state(false);

	const titleText = $derived.by(() => {
		const tasks = workflowStore.focusedRunTasks;
		const titleTask = tasks.find((t) => t.id === 'title');
		return titleTask?.status === 'done' ? (titleTask.data as string) : undefined;
	});

	$effect.pre(() => {
		function handleScroll() {
			if (window.scrollX === -2 || window.scrollY === -2) {
				window.removeEventListener('scroll', handleScroll);
				void goto('/');
			}
		}
		window.addEventListener('scroll', handleScroll);
		return () => {
			window.removeEventListener('scroll', handleScroll);
			workflowManager.clearStack();
		};
	});

	$effect(() => {
		return () => {
			if (viewState.url) {
				void markArticleAsViewed(viewState.url);
			}
		};
	});

	async function handleGenerateEmbeddings() {
		const tasks = workflowStore.focusedRunTasks;
		if (!viewState.url || !tasks.length) return;
		await generateEmbeddingsFromTasks(tasks, viewState.url, {
			model: EMBEDDING_MODEL,
			profileId: viewState.currentProfileId ?? undefined,
			category: extractCategoryFromTasks(tasks)
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
				goto(`/`);
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
	<Topbar title={titleText} loading={viewState.embeddingsLoading}>
		<Toolbar justify="end">
			<ToggleIcon
				name="ListChecks"
				size={TOOLBAR_ICON_SIZE}
				bind:checked={viewState.showAllTasks}
				tooltipProps={{ content: 'show all tasks' }}
			/>
			<Icon
				color="var(--primary-color)"
				name="RefreshCcw"
				size={TOOLBAR_ICON_SIZE}
				onClick={() => urlRouter(viewState.url!, { forceRunTasks: true })}
				tooltipProps={{ content: 'refresh article' }}
			/>

			<Icon
				color="var(--primary-color)"
				name="Save"
				size={TOOLBAR_ICON_SIZE}
				tooltipProps={{ content: 'template manager' }}
				onClick={() => (showTemplateManager = true)}
			/>

			<Icon
				color="var(--primary-color)"
				name="Brain"
				size={TOOLBAR_ICON_SIZE}
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
					<Icon
						name="Trash"
						color="var(--primary-color)"
						size={TOOLBAR_ICON_SIZE}
						tooltipProps={{ content: 'delete article' }}
					/>
				</button>
			{/if}

			<ToolbarDivider />

			<LinkIcon url={viewState.url!} size={TOOLBAR_ICON_SIZE} />
			<Icon
				color="var(--primary-color)"
				name="Settings"
				size={TOOLBAR_ICON_SIZE}
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

<TemplateManager show={showTemplateManager} onClose={() => (showTemplateManager = false)} />

<style>
	article {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		gap: 0.2em;
		box-sizing: border-box;
		padding-top: 50px;
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
		border-radius: 8px;
		padding: 6px 10px;
		color: white;
		line-height: 1;
	}

	.delete-btn[disabled] {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.url-link {
		color: var(--primary-color);
		text-decoration: none;
		text-align: center;
		word-break: break-all;
	}

	@media (prefers-color-scheme: dark) {
		:root {
			background-color: #2f2f2f;
			color: #f6f6f6;
		}
	}
</style>
