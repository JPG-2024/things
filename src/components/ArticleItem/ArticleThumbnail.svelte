<script lang="ts">
	import { toThumbnailVTName } from '@/lib/utils/url';
	import ArticleTitle from './ArticleTitle.svelte';

	interface Props {
		src?: string | null;
		url?: string | null;
		variant?: 'default' | 'fixed';
		fallbackText?: string | null;
		fallbackVariant?: 'text' | 'initial';
	}

	let {
		src = undefined,
		url = undefined,
		variant = 'default',
		fallbackText = null,
		fallbackVariant = 'text'
	}: Props = $props();
</script>

<!-- The container owns the box (aspect-ratio / fixed height) and is a query
	container, so the placeholder title sizes itself with `cqi` in every
	ArticleItem layout without any JS measurement. -->
<div class="article-thumbnail-container" class:fixed-thumb={variant === 'fixed'}>
	{#if src}
		<img
			{src}
			alt="Article"
			class="article-thumbnail"
			style={`view-transition-name: ${toThumbnailVTName(url ?? '')}`}
		/>
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
		width: 100%;
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
	}

	.article-thumbnail-container.fixed-thumb {
		flex: none;
		width: 100%;
		height: var(--fixed-thumb-h);
		aspect-ratio: auto;
		border-radius: var(--radius-sm);
	}

	.article-thumbnail-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 0.4rem;
		border: 1px solid rgba(255, 255, 255, 0.35);
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

	.fixed-thumb .article-thumbnail-placeholder {
		border-radius: var(--radius-sm);
	}
</style>
