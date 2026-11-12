<script lang="ts">
	import { getArticleByUrl } from '@/stores/webStore';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import Icon from './Icon.svelte';

	let { url }: { url: string | null } = $props();

	let favorite = $state(false);
	let favoriteRequestId = 0;

	$effect(() => {
		const currentUrl = url;
		const requestId = ++favoriteRequestId;
		favorite = false;
		if (!currentUrl) return;
		void getArticleByUrl(currentUrl).then((record) => {
			if (requestId !== favoriteRequestId) return;
			favorite = record?.favorite ?? false;
		});
	});

	async function toggleFavorite(): Promise<void> {
		if (!url) return;
		const next = !favorite;
		const saved = await articleCacheStore.setArticleFavorite(url, next);
		if (saved) favorite = next;
	}
</script>

<button 
	class="full-content-button favorite-button" 
	class:favorite={favorite} 
	onclick={toggleFavorite}
>
	<Icon
		name="Star"
		size={24}
		color="yellow"
		tooltipProps={{ content: favorite ? 'Remove from favorites' : 'Add to favorites' }}
	/>
</button>

<style>
	.full-content-button {
		background: none;
		border: none;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: background-color 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.full-content-button:hover {
		background-color: var(--hover-bg);
	}

	/* Outlined star when unfilled, solid primary once saved. */
	.favorite-button :global(svg) {
		fill: transparent;
		transition: fill 0.15s;
	}

	.favorite-button.favorite :global(svg) {
		fill: yellow;
	}
</style>
