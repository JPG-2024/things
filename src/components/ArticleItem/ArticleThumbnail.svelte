<script lang="ts">
	import { toVTName } from '@/lib/utils/url';

	interface Props {
		src?: string | null;
		url?: string | null;
		variant?: 'default' | 'fixed';
		fallbackText?: string | null;
	}

	let {
		src = undefined,
		url = undefined,
		variant = 'default',
		fallbackText = null
	}: Props = $props();
</script>

{#if variant === 'fixed'}
	<div class="article-thumbnail-container fixed-thumb">
		{#if src}
			<img
				{src}
				alt="Article"
				class="article-thumbnail"
				style={`view-transition-name: vt-main-image-${toVTName(url ?? '')}`}
			/>
		{:else}
			<div class="article-thumbnail-fallback">{fallbackText ?? ''}</div>
		{/if}
	</div>
{:else}
	<div class="article-thumbnail-container">
		<img
			{src}
			alt="Article"
			class="article-thumbnail"
			style={`view-transition-name: vt-main-image-${toVTName(url ?? '')}`}
		/>
	</div>
{/if}

<style>
	.article-thumbnail-container {
		flex: 0 0 30%;
		position: relative;
		display: inline-flex;
		width: 100%;
	}

	.article-thumbnail {
		display: block;
		border-radius: var(--radius-sm);
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		opacity: 0.8;
		transition: opacity 0.2s ease;
	}

	.article-thumbnail-container.fixed-thumb {
		flex: none;
		width: 100%;
		height: var(--fixed-thumb-h);
	}

	.fixed-thumb .article-thumbnail {
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
		border-radius: var(--radius-sm);
	}

	.article-thumbnail-fallback {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		width: 100%;
		height: 100%;
		padding: 0.4rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.7rem;
		line-height: 1.15;
		text-align: left;
		overflow: hidden;
		border-radius: var(--radius-sm);
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		line-clamp: 4;
	}
</style>
