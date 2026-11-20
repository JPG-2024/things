<script lang="ts">
	import { tooltip as tooltipAction } from '@/lib/actions/tooltip';
	import { youTubeVideoId } from '@/lib/utils/youtube/helpers';
	import { playerStore } from '@/stores/playerStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import ArticleTitle from './ArticleTitle.svelte';

	interface Props {
		src?: string | null;
		url?: string | null;
		/** Fixed box width in px; with `height`, opts out of the fluid 16:9 ratio. */
		width?: number;
		/** Fixed box height in px; with `width`, opts out of the fluid 16:9 ratio. */
		height?: number;
		fallbackText?: string | null;
		fallbackVariant?: 'text' | 'initial';
		unread?: boolean;
		tooltip?: string | null;
	}

	let {
		src = undefined,
		url = undefined,
		width = undefined,
		height = undefined,
		fallbackText = null,
		fallbackVariant = 'text',
		unread = false,
		tooltip = null
	}: Props = $props();

	// A fixed box (explicit width + height) opts out of the fluid 16:9 ratio.
	const sized = $derived(width !== undefined && height !== undefined);

	// Only YouTube videos can be played in the floating player.
	const videoId = $derived(url ? youTubeVideoId(url) : null);

	/** Play this video in the floating player. The thumbnail lives inside the
	 *  card button, so stop the click from also opening the reading view. */
	function handlePlay(event: MouseEvent): void {
		event.stopPropagation();
		playerStore.openFromUrl(url, src);
	}

	/** Keyboard equivalent (Enter/Space) for the play affordance. */
	function handlePlayKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		event.stopPropagation();
		playerStore.openFromUrl(url, src);
	}
</script>

{#snippet thumbnailImage()}
	<img
		{src}
		alt="Article"
		class="article-thumbnail"
		loading="lazy"
		decoding="async"
		use:tooltipAction={{ content: tooltip, variant: 'title' }}
	/>
{/snippet}

<!-- The container owns the box (fluid 16:9 or an explicit width/height) and is a
	query container, so the placeholder title sizes itself with `cqi` in every
	ArticleItem layout without any JS measurement. The query container is only
	needed for the placeholder: with an image there is no `cqi` to resolve, and
	a wheel of entity cards mounts one container per thumbnail. -->
<div
	class="article-thumbnail-container"
	class:sized
	class:placeholder={!src}
	style={sized ? `width: ${width}px; height: ${height}px;` : undefined}
>
	{#if unread}
		<span class="unread-dot" aria-hidden="true"></span>
	{/if}
	{#if src}
		{@render thumbnailImage()}
	{:else}
		<div class="article-thumbnail-placeholder" class:initial={fallbackVariant === 'initial'}>
			{#if fallbackText}
				<ArticleTitle title={fallbackText} />
			{/if}
		</div>
	{/if}
	{#if videoId}
		<span
			class="mini-play"
			role="button"
			tabindex="0"
			aria-label="Play video in floating player"
			title="Play in floating player"
			onclick={handlePlay}
			onkeydown={handlePlayKeydown}
		>
			<Icon name="Play" size={16} color="white" fill="white" />
		</span>
	{/if}
</div>

<style>
	.article-thumbnail-container {
		position: relative;
		display: inline-flex;
		width: 100%;
		min-width: 0;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		justify-content: center;
	}

	/* Only the placeholder resolves `cqi` units. */
	.article-thumbnail-container.placeholder {
		container-type: inline-size;
	}

	.article-thumbnail {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 1;
		transition: opacity 0.2s ease;
		border-radius: inherit;
		border-radius: var(--radius-md);
		border: 2px solid var(--article-border);
	}

	.article-thumbnail-container.sized {
		aspect-ratio: auto;
	}

	/* The container clips its overflow, so keep the unread marker inside the
	   rounded corner instead of hanging off the edge. */
	.unread-dot {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--primary-color);
		z-index: 8;
		pointer-events: none;
	}

	/* Bottom-center play affordance for YouTube thumbnails. Hidden and
	   click-through until the thumbnail is hovered or the control is focused.
	   A role-bearing span is used instead of a real <button>: this container
	   lives inside the card's <button>, and a nested button breaks the outer
	   one's DOM. Keeping it inside the container also makes the position exact
	   in every layout (grid, grid-3 and the row's fixed box). */
	.mini-play {
		position: absolute;
		bottom: 0.4rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 7;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
		line-height: 0;
		cursor: pointer;
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 0.15s ease,
			background 0.15s ease;
	}

	.article-thumbnail-container:hover .mini-play,
	.mini-play:focus-visible {
		opacity: 0.5;
		pointer-events: auto;
	}

	.mini-play:hover {
		background: rgba(0, 0, 0, 0.85);
	}

	.article-thumbnail-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 0.4rem;
		padding-top: 1rem;
		border-radius: inherit;
		color: rgba(255, 255, 255, 0.75);
		font-size: clamp(0.5rem, 10cqi, 0.7rem);
		line-height: 1.15;
		text-align: center;
		overflow: hidden;
	}

	.sized .article-thumbnail-placeholder {
		border-radius: var(--radius-sm);
	}
</style>
