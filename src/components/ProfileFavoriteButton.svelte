<script lang="ts">
	import { getProfile } from '@/stores/webStore';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import Icon from './Icon.svelte';

	let {
		profileId,
		size = 24,
		className = ''
	}: {
		profileId: string;
		size?: number;
		className?: string;
	} = $props();

	let favorite = $state(false);
	let favoriteRequestId = 0;

	$effect(() => {
		const currentId = profileId;
		const requestId = ++favoriteRequestId;
		favorite = false;
		if (!currentId) return;
		void getProfile(currentId).then((record) => {
			if (requestId !== favoriteRequestId) return;
			favorite = record?.favorite ?? false;
		});
	});

	async function toggleFavorite(): Promise<void> {
		if (!profileId) return;
		const next = !favorite;
		const saved = await articleCacheStore.setProfileFavorite(profileId, next);
		if (saved) favorite = next;
	}
</script>

<button
	class="full-content-button favorite-button {className}"
	class:favorite
	onclick={toggleFavorite}
>
	<Icon
		name="Star"
		{size}
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
