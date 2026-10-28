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
		color = 'var(--bg-color)',
		onClick = undefined,
		tooltipProps = undefined,
		disabled = false,
		ariaLabel = undefined,
		...props
	}: Props = $props();

	const toolbarSize = getContext<number | undefined>('toolbar-icon-size');
	const resolvedSize = $derived(size ?? toolbarSize ?? 18);

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
		<Icon {...props} {color} size={resolvedSize} />
	</button>
{:else if tooltipProps?.content}
	<!-- No natural host element to attach the action to when the icon is not a
	   button; this span only exists for icons that actually carry a tooltip. -->
	<span class="icon-tooltip-host" use:tooltip={tooltipProps}>
		<Icon {...props} {color} size={resolvedSize} />
	</span>
{:else}
	<Icon {...props} {color} size={resolvedSize} />
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
	.icon-button:hover :global(svg) {
		color: white !important;
		transform: scale(1.05);
	}

	.icon-button:disabled {
		opacity: 0.5;
		cursor: default;
		pointer-events: none;
	}
</style>
