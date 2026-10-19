<script lang="ts">
	import { toThumbnailVTName } from '@/lib/utils/url';
	import Tooltip from '@/components/Tooltip.svelte';
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
</script>

{#snippet thumbnailImage()}
	<img
		{src}
		alt="Article"
		class="article-thumbnail"
		style={`view-transition-name: ${toThumbnailVTName(url ?? '')}`}
	/>
{/snippet}

<!-- The container owns the box (fluid 16:9 or an explicit width/height) and is a
	query container, so the placeholder title sizes itself with `cqi` in every
	ArticleItem layout without any JS measurement. -->
<div
	class="article-thumbnail-container"
	class:sized
	style={sized ? `width: ${width}px; height: ${height}px;` : undefined}
>
	{#if unread}
		<span class="unread-dot" aria-hidden="true"></span>
	{/if}
	{#if src}
		{#if tooltip}
			<Tooltip content={tooltip}>{@render thumbnailImage()}</Tooltip>
		{:else}
			{@render thumbnailImage()}
		{/if}
	{:else}
		<div class="article-thumbnail-placeholder" class:initial={fallbackVariant === 'initial'}>
			{#if fallbackText}
				<ArticleTitle title={fallbackText} />
			{/if}
		</div>
	{/if}
</div>

<style>
	.article-thumbnail-container {
		flex: none;
		position: relative;
		display: inline-flex;
		width: 80%;
		min-width: 0;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: var(--radius-lg);
		container-type: inline-size;
	}

	.article-thumbnail {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.8;
		transition: opacity 0.2s ease;
		border-radius: inherit;
		border: 1px solid var(--article-border);
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
		z-index: 10;
		pointer-events: none;
	}

	/* Tooltip wraps its children in an unsized flex box; make it fill the
	   thumbnail so the image keeps its 100% sizing. */
	.article-thumbnail-container :global(.tooltip-wrapper) {
		width: 100%;
		height: 100%;
		min-width: 0;
		justify-content: center;
	}

	.article-thumbnail-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 0.4rem;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: inherit;
		color: rgba(255, 255, 255, 0.75);
		font-size: clamp(0.5rem, 10cqi, 0.7rem);
		line-height: 1.15;
		text-align: center;
		overflow: hidden;
	}

	.article-thumbnail-placeholder span {
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.article-thumbnail-placeholder.initial span {
		font-size: 2rem;
		font-weight: bold;
		line-height: 1;
		-webkit-line-clamp: none;
		line-clamp: none;
	}

	.sized .article-thumbnail-placeholder {
		border-radius: var(--radius-sm);
	}
</style>
