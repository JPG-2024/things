<script lang="ts">
	import type { ArticleWithTasks } from '@/stores/webStore';
	import ArticleItem from '@/components/ArticleItem.svelte';
	import Icon from '@/components/Icon.svelte';
	import { onMount, tick } from 'svelte';

	interface Props {
		articles: ArticleWithTasks[];
		displayMode?: 'thumbnail' | 'title';
		onArticleClick: (article: ArticleWithTasks) => void;
		onArticleHoverEnter: (article: ArticleWithTasks) => void;
		onArticleHoverLeave: () => void;
	}

	let {
		articles,
		displayMode = 'thumbnail',
		onArticleClick,
		onArticleHoverEnter,
		onArticleHoverLeave
	}: Props = $props();

	let gridEl: HTMLDivElement;
	let wrapperEls: HTMLDivElement[] = [];
	let resizeObservers: ResizeObserver[] = [];

	let layoutIndex = $state(1);

	const layouts = [
		{ width: 200, columns: 5, padding: '1.2rem' },
		{ width: 400, columns: 3, padding: '1.5rem' },
		{ width: 480, columns: 2, padding: '2rem' }
	];

	let currentLayout = $derived(layouts[layoutIndex]);

	function decreaseLayout() {
		if (layoutIndex > 0) layoutIndex--;
	}

	function increaseLayout() {
		if (layoutIndex < layouts.length - 1) layoutIndex++;
	}

	function resizeGridItem(wrapper: HTMLDivElement) {
		if (!gridEl || !wrapper) return;
		const content = wrapper.querySelector('.content') as HTMLElement;
		if (!content) return;

		const rowHeight = parseInt(window.getComputedStyle(gridEl).getPropertyValue('grid-auto-rows'));
		const rowGap = parseInt(window.getComputedStyle(gridEl).getPropertyValue('row-gap'));
		const contentHeight = content.getBoundingClientRect().height;
		const rowSpan = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap));
		wrapper.style.gridRowEnd = `span ${rowSpan}`;
	}

	function resizeAll() {
		wrapperEls.forEach(resizeGridItem);
	}

	onMount(() => {
		tick().then(() => {
			resizeAll();

			resizeObservers = wrapperEls.map((wrapper) => {
				const content = wrapper.querySelector('.content') as HTMLElement;
				const observer = new ResizeObserver(() => {
					resizeGridItem(wrapper);
				});
				if (content) observer.observe(content);
				return observer;
			});

			window.addEventListener('resize', resizeAll);
		});

		return () => {
			resizeObservers.forEach((obs) => obs.disconnect());
			window.removeEventListener('resize', resizeAll);
		};
	});

	$effect(() => {
		articles;
		currentLayout;
		tick().then(() => {
			resizeAll();
		});
	});
</script>

<div class="articles-container">
	<div class="layout-header">
		<Icon name="Minus" size={20} onClick={decreaseLayout} />
		<Icon name="Plus" size={20} onClick={increaseLayout} />
	</div>
	<div
		class="articles-grid"
		bind:this={gridEl}
		style:grid-template-columns={`repeat(${currentLayout.columns}, 1fr)`}
		style:gap={currentLayout.padding}
		style:padding-bottom={currentLayout.padding}
	>
		{#each articles as article, i (article.url)}
			<div class="article-wrapper" bind:this={wrapperEls[i]}>
				<div class="content">
					<ArticleItem
						{article}
						{displayMode}
						thumbnailOnly={layoutIndex === 0}
						onClick={onArticleClick}
						onHoverEnter={onArticleHoverEnter}
						onHoverLeave={onArticleHoverLeave}
					/>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.articles-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.layout-header {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-bottom: 1rem;
		width: 100%;
		max-width: 1200px;
	}

	.articles-grid {
		display: grid;
		grid-auto-rows: 10px;
		width: 100%;
		max-width: 1200px;
	}

	.article-wrapper {
		overflow: hidden;
	}

	.content {
		width: var(--content-width);
	}
</style>
