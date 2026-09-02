<script lang="ts">
	import type { Snippet } from 'svelte'; // Optional, for TypeScript
	export type CardProps = {
		children?: Snippet;
		title?: string;
		showBorders?: boolean;
		loading?: boolean;
	};
	let {
		children,
		title = '',
		showBorders = false,
		loading = false
	}: {
		children?: Snippet;
		title?: string;
		showBorders?: boolean;
		loading?: boolean;
	} = $props();
</script>

<div class="widget" class:no-borders={!showBorders} class:loading role="group">
	{#if title}
		<div class="widget-title">{title}</div>
	{/if}
	{@render children?.()}
</div>

<style>
	.widget {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		max-width: 100%;
		max-height: 100%;
		box-sizing: border-box;
		background-image: linear-gradient(
			180deg,
			color-mix(in srgb, var(--bg-color) 20%, transparent),
			rgba(0, 0, 0),
			rgba(0, 0, 0)
		);
		background-size: 200% 200%;
		backdrop-filter: blur(20px);
		padding: 5px;
		overflow: hidden;
	}

	.widget.loading {
		background-image: linear-gradient(
			120deg,
			rgb(from var(--primary-color) r g b / 0.08) 0%,
			rgb(from var(--primary-color) r g b / 0.24) 50%,
			rgb(from var(--primary-color) r g b / 0.08) 100%
		);
		animation: card-loading-gradient 2.4s ease-in-out infinite;
	}

	.widget-title {
		padding: 5px;

		line-height: 1;
		font-size: 1rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.825);
		pointer-events: none;
		z-index: 20;
	}

	.widget.no-borders::before,
	.widget.no-borders::after,
	.widget.no-borders .widget-corner,
	.widget.no-borders .widget-curve-tl,
	.widget.no-borders .widget-curve-br {
		display: none;
	}

	/* Esquina superior izquierda + lado superior */
	.widget::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 40%; /* Cubre 40% del ancho superior */
		height: 1px;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.8) 0%,
			rgba(255, 255, 255, 0.159) 80%,
			transparent 100%
		);
		border-radius: 30px 0 0 0;
	}

	.widget::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: 40%; /* Cubre 40% de la altura izquierda */
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.8) 0%,
			rgba(255, 255, 255, 0.159) 80%,
			transparent 100%
		);
		border-radius: 30px 0 0 0;
	}

	/* Esquina inferior derecha + lado inferior (usando span o elemento extra) */
	.widget-corner {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 80%;
		height: 60%;
		pointer-events: none;
	}

	.widget-corner::before {
		content: '';
		position: absolute;
		bottom: 0;
		right: 0;
		width: 100%;
		height: 1px;
		background: linear-gradient(
			270deg,
			rgba(255, 255, 255, 0.8) 0%,
			rgba(255, 255, 255, 0.159) 80%,
			transparent 100%
		);
		border-radius: 0 0 30px 0;
	}

	.widget-corner::after {
		content: '';
		position: absolute;
		bottom: 0;
		right: 0;
		width: 1px;
		height: 100%;
		background: linear-gradient(
			0deg,
			rgba(255, 255, 255, 0.8) 0%,
			rgba(255, 255, 255, 0.159) 80%,
			transparent 100%
		);
		border-radius: 0 0 30px 0;
	}

	.widget-curve-tl {
		position: absolute;
		top: 1px;
		left: 1px;
		width: 60px;
		height: 60px;
		pointer-events: none;
	}

	.widget-curve-br {
		position: absolute;
		bottom: 1px;
		right: 1px;
		width: 60px;
		height: 60px;
		pointer-events: none;
	}

	@keyframes card-loading-gradient {
		0% {
			background-position: 0% 50%;
		}

		50% {
			background-position: 100% 50%;
		}

		100% {
			background-position: 0% 50%;
		}
	}
</style>
