<script lang="ts">
	import type { Snippet } from 'svelte';

	type HorizontalDir = 'left' | 'right';
	type VerticalDir = 'up' | 'down';

	type Animations = {
		top?: HorizontalDir;
		bottom?: HorizontalDir;
		left?: VerticalDir;
		right?: VerticalDir;
	};

	type Props = {
		children?: Snippet;
		loading: boolean;
		animations: Animations;
	};

	let { children, loading, animations }: Props = $props();
</script>

<div class="loading-border" class:is-loading={loading}>
	{#if animations.top}
		<div class="border-edge border-top" class:is-loading={loading} data-dir={animations.top}></div>
	{/if}
	{#if animations.bottom}
		<div
			class="border-edge border-bottom"
			class:is-loading={loading}
			data-dir={animations.bottom}
		></div>
	{/if}
	{#if animations.left}
		<div
			class="border-edge border-left"
			class:is-loading={loading}
			data-dir={animations.left}
		></div>
	{/if}
	{#if animations.right}
		<div
			class="border-edge border-right"
			class:is-loading={loading}
			data-dir={animations.right}
		></div>
	{/if}
	{@render children?.()}
</div>

<style>
	.loading-border {
		position: relative;
		display: inline-block;
		width: 100%;
	}

	.border-edge {
		position: absolute;
		overflow: hidden;
		pointer-events: none;
	}

	.border-top {
		top: 0;
		left: 0;
		width: 100%;
		height: 2px;
	}

	.border-bottom {
		bottom: 0;
		left: 0;
		width: 100%;
		height: 2px;
	}

	.border-left {
		top: 0;
		left: 0;
		width: 2px;
		height: 100%;
	}

	.border-right {
		top: 0;
		right: 0;
		width: 2px;
		height: 100%;
	}

	.border-edge::after {
		content: '';
		position: absolute;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.border-top::after,
	.border-bottom::after {
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, var(--primary-color, #7c6af7), transparent);
	}

	.border-left::after,
	.border-right::after {
		width: 100%;
		height: 100%;
		background: linear-gradient(40deg, transparent, var(--primary-color, #7c6af7), transparent);
	}

	.border-edge.is-loading::after {
		opacity: 1;
	}

	.border-top[data-dir='right'].is-loading::after,
	.border-bottom[data-dir='right'].is-loading::after {
		animation: sweep-right 1.2s linear infinite;
	}

	.border-top[data-dir='left'].is-loading::after,
	.border-bottom[data-dir='left'].is-loading::after {
		animation: sweep-left 1.2s linear infinite;
	}

	.border-left[data-dir='down'].is-loading::after,
	.border-right[data-dir='down'].is-loading::after {
		animation: sweep-down 1.2s linear infinite;
	}

	.border-left[data-dir='up'].is-loading::after,
	.border-right[data-dir='up'].is-loading::after {
		animation: sweep-up 1.2s linear infinite;
	}

	@keyframes sweep-right {
		from {
			left: -100%;
		}
		to {
			left: 100%;
		}
	}

	@keyframes sweep-left {
		from {
			left: 100%;
		}
		to {
			left: -100%;
		}
	}

	@keyframes sweep-down {
		from {
			top: -100%;
		}
		to {
			top: 100%;
		}
	}

	@keyframes sweep-up {
		from {
			top: 100%;
		}
		to {
			top: -100%;
		}
	}
</style>
