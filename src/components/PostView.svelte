<script lang="ts">
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { viewState } from '@/stores/viewStore.svelte';
	import SettingsModal from '@/components/modals/SettingsModal.svelte';
	import Icon from './Icon.svelte';
	import LinkIcon from './LinkIcon.svelte';
	import Topbar from './layout/Topbar.svelte';
	import StringReveal from './StringReveal.svelte';
	import ToggleIcon from './ToggleIcon.svelte';
	import { deleteArticleByUrl } from '@/stores/tasksStore';
	import { goto } from '$app/navigation';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { prefetchHomeData } from '@/lib/prefetchHomeData';

	interface Props {
		headerContent?: any;
		contentSnippet?: any;
	}

	const { headerContent, contentSnippet } = $props();
	// reactive state for deletion flag (Svelte runes)
	let isDeleting = $state(false);

	const queryClient = useQueryClient();

	// Add window scroll event listener on mount, remove on unload, using $effect.pre
	$effect.pre(() => {
		function handleScroll() {
			if (window.scrollX === -2 || window.scrollY === -2) {
				window.removeEventListener('scroll', handleScroll);
				queryClient.invalidateQueries({ queryKey: ['profiles'] });
				queryClient.invalidateQueries({ queryKey: ['articles'] });
				void prefetchHomeData(queryClient).then(() => goto('/'));
			}
		}
		window.addEventListener('scroll', handleScroll);
		// Cleanup on component unload
		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	});

	async function handleDelete() {
		if (!viewState.url || isDeleting) return;
		try {
			isDeleting = true;
			const res = await deleteArticleByUrl(viewState.url);
			if (res?.success) {
				queryClient.invalidateQueries({ queryKey: ['profiles'] });
				queryClient.invalidateQueries({ queryKey: ['articles'] });
				await prefetchHomeData(queryClient);
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
		<ToggleIcon
			name="ListChecks"
			checked={viewState.showAllTasks}
			onToggle={() => (viewState.showAllTasks = !viewState.showAllTasks)}
		/>
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
		<Icon name="Settings" title="Settings" onClick={() => (viewState.modalSettingVisible = true)} />
	</Topbar>

	<div class="header">
		{#if headerContent}
			{@render headerContent()}
		{/if}
	</div>

	{@render contentSnippet()}

	<SettingsModal
		show={viewState.modalSettingVisible}
		onClose={() => (viewState.modalSettingVisible = false)}
	/>
</article>

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
