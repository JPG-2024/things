<script lang="ts">
	import type { ProfileStackCell } from '@/lib/utils/articleGridCells';
	import type { ArticleWithTasks } from '@/stores/webStore';
	import type { LayoutKey } from '@/stores/viewStore.svelte';

	interface Props {
		cell: ProfileStackCell;
		/** Matches ArticleItem's row/grid variants; `row` renders a compact pile. */
		layoutKey?: LayoutKey;
		/** Navigates to the profile page; ArticleList supplies the default. */
		onClick: (cell: ProfileStackCell) => void;
	}

	let { cell, layoutKey = undefined, onClick }: Props = $props();

	const isRowMode = $derived(layoutKey === 'row');

	// Newest preview article anchors the pile (index 0) and owns the unread dot.
	const frontArticle = $derived(cell.preview[0]);

	// Overlap pile: the newest preview article anchors the pile untransformed
	// (straight, at the pile's top-left), and each older thumb steps down-right
	// and tilts a bit more behind it. The fan points DOWNWARD (positive y) so no
	// layer ever crosses the grid cell's top clip edge (.grid-item has
	// overflow: hidden); the pile's bottom padding absorbs the downward growth.
	function layerStyle(index: number, total: number): string {
		// Two-thumb layout: newest anchors the left side, straight; the older
		// thumb sits at the right side, tilted a little to the left.
		// translateX(22%) is relative to the layer's own width (82% of the
		// pile), landing its right edge flush with the pile's right side.
		if (total === 2) {
			return index === 0 ? 'z-index: 2;' : 'transform: translateX(22%) rotate(-3deg); z-index: 1;';
		}
		const depth = index;
		const x = depth * 20;
		const y = depth * 10;
		const rot = depth * 0;
		return `transform: translate(${x}px, ${y}px) rotate(${rot}deg); z-index: ${total - index};`;
	}
</script>

{#snippet layer(article: ArticleWithTasks, index: number, total: number)}
	<div class="articles-stack__layer" style={layerStyle(index, total)}>
		{#if index === 0 && frontArticle && !frontArticle.viewed}
			<span class="articles-stack__unread-dot" aria-hidden="true"></span>
		{/if}
		{#if article.thumbnailSrc}
			<img src={article.thumbnailSrc} alt={article.title ?? ''} loading="lazy" draggable="false" />
		{:else}
			<div
				class="articles-stack__fallback"
				style={`background: ${article.primaryColor ?? article.mainColor ?? 'var(--bg-color)'};`}
			></div>
		{/if}
	</div>
{/snippet}

<button type="button" class="articles-stack" class:row={isRowMode} onclick={() => onClick(cell)}>
	{#if isRowMode}
		<!-- Row mode: compact pile inside ArticleItemRow's fixed thumb box
		     (150x80), newest title in the title position. The box clips the
		     fan, so no bottom padding reserve is needed. -->
		<div class="articles-stack__row-thumb">
			<div class="articles-stack__pile">
				<div class="articles-stack__spacer"></div>
				{#each cell.preview as article, index (article.id)}
					{@render layer(article, index, cell.preview.length)}
				{/each}
			</div>
		</div>
		<div class="articles-stack__row-text">
			<div class="articles-stack__row-title">{cell.preview[0]?.title ?? ''}</div>
		</div>
	{:else}
		<div class="articles-stack__pile">
			<!-- Invisible spacer with the same 16:9 footprint as a layer, so the pile
			     is exactly one layer tall at any column width; fan layers overflow it
			     downward into the pile's reserved bottom padding. -->
			<div class="articles-stack__spacer"></div>
			{#each cell.preview as article, index (article.id)}
				{@render layer(article, index, cell.preview.length)}
			{/each}
		</div>
	{/if}
</button>

<style>
	.articles-stack {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0.75rem;
		background: transparent;
		border: none;
		cursor: pointer;
		font: inherit;
		color: inherit;
	}

	/* Row mode mirrors ArticleItemRow: fixed 150x80 thumb box on the left,
	 * single-line all-small-caps title in the title position. */
	.articles-stack.row {
		justify-content: flex-start;
		gap: 0.5rem;
		padding: 0 1rem;
	}

	.articles-stack.row .articles-stack__pile {
		/* The row thumb box clips the fan, so no bottom padding reserve. */
		padding-bottom: 0;
	}

	.articles-stack__row-thumb {
		position: relative;
		flex: 0 0 auto;
		width: 150px;
		height: 80px;
		overflow: hidden;
		border-radius: var(--radius-md);
	}

	.articles-stack__row-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.articles-stack__row-title {
		font-family: var(--font-secondary);
		font-variant: all-small-caps;
		font-size: 0.8rem;
		overflow: hidden;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0 1rem;
	}

	.articles-stack__pile {
		position: relative;
		width: 100%;
		/* Room for the downward fan: (previewCount - 1) * 8px rise plus corner
		 * lift from rotation. 40px covers up to 5 preview layers. */
		padding-bottom: 40px;
	}

	.articles-stack__spacer {
		width: 82%;
		aspect-ratio: 16 / 9;
		visibility: hidden;
	}

	.articles-stack__layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 82%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: var(--radius-sm, 8px);
		border: 1px solid var(--article-border);
	}

	.articles-stack__layer img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.articles-stack__fallback {
		width: 100%;
		height: 100%;
	}

	/* Front-thumbnail unread marker: kept inside the layer's rounded corner
	 * (the layer clips its overflow) so it tracks the anchor thumb's transform. */
	.articles-stack__unread-dot {
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

	.articles-stack:hover .articles-stack__layer {
		will-change: transform;
	}
</style>
