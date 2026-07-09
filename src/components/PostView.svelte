<script lang="ts">
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import Icon from './Icon.svelte';
	import LinkIcon from './LinkIcon.svelte';
	import Topbar from './layout/Topbar.svelte';
	import StringReveal from './StringReveal.svelte';
	import ToggleIcon from './ToggleIcon.svelte';
	import { deleteArticleByUrl, markArticleAsViewed } from '@/stores/webStore';
	import { goto } from '$app/navigation';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import TasksEditorModal from '@/components/Tasks/TasksEditorModal.svelte';

	interface Props {
		headerContent?: any;
		contentSnippet?: any;
	}

	const { headerContent, contentSnippet } = $props();
	let isDeleting = $state(false);

	$effect.pre(() => {
		function handleScroll() {
			if (window.scrollX === -2 || window.scrollY === -2) {
				window.removeEventListener('scroll', handleScroll);
				articleCacheStore.invalidate();
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
				void markArticleAsViewed(viewState.url).then(() => {
					articleCacheStore.invalidate();
				});
			}
		};
	});

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
	<Topbar>
		<ToggleIcon name="ListChecks" bind:checked={viewState.showAllTasks} />
		<Icon name="RefreshCcw" onClick={() => urlRouter(viewState.url!, { forceRunTasks: true })} />

		{#if viewState.url && !viewState.loading}
			<button
				class="delete-btn"
				onclick={handleDelete}
				disabled={isDeleting}
				title="Delete article"
			>
				<Icon name="Trash" />
			</button>
		{/if}

		<LinkIcon url={viewState.url!} />
		<Icon name="Settings" title="Settings" onClick={() => drawersState.open('settings')} />
	</Topbar>

	<div class="header">
		{#if headerContent}
			{@render headerContent()}
		{/if}
	</div>

	{@render contentSnippet()}
</article>

{#if viewState.showAllTasks}
	<TasksEditorModal onClose={() => (viewState.showAllTasks = false)} />
{/if}

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
		max-width: 800px;
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
		font-size: 18px;
		line-height: 1;
	}

	.delete-btn[disabled] {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.url-link {
		color: var(--primary-color);
		font-size: 0.9rem;
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
