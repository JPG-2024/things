<script lang="ts">
	import * as icons from '@lucide/svelte';
	import { type Icon } from '@lucide/svelte';
	import { getContext, type Component } from 'svelte';
	import { tooltip, type TooltipOptions } from '@/lib/actions/tooltip';

	interface Props {
		name: string;
		size?: number;
		color?: string;
		onClick?: (event: MouseEvent) => void;
		tooltipProps?: TooltipOptions;
		disabled?: boolean;
		ariaLabel?: string;
		[key: string]: unknown;
	}

	let {
		name,
		size,
		color = 'var(--gray-200)',
		onClick = undefined,
		tooltipProps = undefined,
		disabled = false,
		ariaLabel = undefined,
		...props
	}: Props = $props();

	const toolbarSize = getContext<number | undefined>('toolbar-icon-size');
	const resolvedSize = $derived(size ?? toolbarSize ?? 18);

	// Icons with a semantic/explicit color (favorite yellow, error red, ...) keep
	// it on hover. Only the neutral theme colors are tinted with --primary-color.
	const HOVER_TINT_COLORS = new Set<string | undefined>([
		undefined,
		'var(--gray-200)',
		'var(--bg-color)',
		'var(--primary-color)'
	]);
	const tintOnHover = $derived(HOVER_TINT_COLORS.has(color));
	const iconProps = $derived({
		...props,
		'data-icon-glow': true,
		...(tintOnHover ? { 'data-icon-primary-hover': true } : {})
	});

	let Icon = $derived((icons as unknown as Record<string, Component>)[name]);

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
		onClick?.(event);
	}
</script>

{#if onClick}
	<button
		onclick={handleClick}
		class="icon-button"
		{disabled}
		aria-label={ariaLabel}
		use:tooltip={tooltipProps}
	>
		<Icon {...iconProps} {color} size={resolvedSize} />
	</button>
{:else if tooltipProps?.content}
	<!-- No natural host element to attach the action to when the icon is not a
	   button; this span only exists for icons that actually carry a tooltip. -->
	<span class="icon-tooltip-host" use:tooltip={tooltipProps}>
		<Icon {...iconProps} {color} size={resolvedSize} />
	</span>
{:else}
	<Icon {...iconProps} {color} size={resolvedSize} />
{/if}

<style>
	.icon-button {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.icon-tooltip-host {
		display: inline-flex;
		align-items: center;
	}

	/* The glow lives on the svg itself so every icon gets it on its own hover,
	   regardless of the render path (button, tooltip host or bare svg). It is
	   deliberately not tied to a checked/selected state — that is the caller's.
	   `:global` is needed because Lucide forwards the data attributes onto its
	   svg and Svelte does not scope attributes across component boundaries. */
	:global([data-icon-glow]) {
		filter: none;
	}
	:global([data-icon-glow]:hover) {
		filter: var(--glow-filter);
	}
	:global([data-icon-primary-hover]:hover) {
		stroke: var(--primary-color) !important;
		opacity: 1 !important;
	}

	.icon-button:disabled {
		opacity: 0.5;
		cursor: default;
		pointer-events: none;
	}
</style>
