<script lang="ts">
	import { getArticleByUrl } from '@/stores/webStore';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		url: string | null;
		/** Non-interactive marker (stack piles): a span instead of a button, so it
		     can live inside a clickable card without nesting buttons. */
		marker?: boolean;
		/** Known favorite state; skips the per-url fetch when provided (marker). */
		favorite?: boolean;
	}

	let { url, marker = false, favorite: favoriteKnown = undefined }: Props = $props();

	let fetchedFavorite = $state(false);
	let favorite = $derived(favoriteKnown ?? fetchedFavorite);
	let favoriteRequestId = 0;

	$effect(() => {
		if (favoriteKnown !== undefined) return;
		const currentUrl = url;
		const requestId = ++favoriteRequestId;
		fetchedFavorite = false;
		if (!currentUrl) return;
		void getArticleByUrl(currentUrl).then((record) => {
			if (requestId !== favoriteRequestId) return;
			fetchedFavorite = record?.favorite ?? false;
		});
	});

	async function toggleFavorite(): Promise<void> {
		if (!url) return;
		const next = !favorite;
		const saved = await articleCacheStore.setArticleFavorite(url, next);
		if (saved) fetchedFavorite = next;
	}
</script>

{#if marker}
	<span class="favorite-button" class:favorite aria-hidden="true">
		<Icon name="Star" size={16} color="yellow" />
	</span>
{:else}
	<button class="full-content-button favorite-button" class:favorite onclick={toggleFavorite}>
		<!-- No `size`: inside the article toolbar the 20px come from the
		     `toolbar-icon-size` context. -->
		<Icon
			name="Star"
			color="yellow"
			tooltipProps={{ content: favorite ? 'Remove from favorites' : 'Add to favorites' }}
		/>
	</button>
{/if}

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

	/* Marker mode: same star fill rules, flex layout without button chrome. */
	span.favorite-button {
		display: flex;
		align-items: center;
		justify-content: center;
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
