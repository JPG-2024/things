<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import { markArticleAsViewed } from '@/stores/webStore';
	import Topbar from './layout/Topbar.svelte';
	import { createBackHotkey } from '@/stores/navigationHistory.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		headerContent?: Snippet | null;
		contentSnippet?: Snippet;
	}

	const { headerContent, contentSnippet }: Props = $props();

	// ArrowLeft returns to the route this post was opened from.
	createBackHotkey();

	$effect(() => {
		return () => {
			if (viewState.url) {
				void markArticleAsViewed(viewState.url);
			}
		};
	});
</script>

<article>
	<Topbar loading={viewState.embeddingsLoading} />

	<div class="header">
		{#if headerContent}
			{@render headerContent()}
		{/if}
	</div>

	{#if contentSnippet}
		{@render contentSnippet()}
	{/if}
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
		/* justify-content: center; */
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

	@media (prefers-color-scheme: dark) {
		:root {
			background-color: #2f2f2f;
			color: #f6f6f6;
		}
	}
</style>
