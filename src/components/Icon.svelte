<script lang="ts">
	import * as icons from '@lucide/svelte';
	import { type Icon } from '@lucide/svelte';
	import { getContext, type Component } from 'svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import type { TooltipProps } from '@/components/Tooltip.svelte';

	interface Props {
		name: string;
		size?: number;
		color?: string;
		onClick?: (event: MouseEvent) => void;
		tooltipProps?: Omit<TooltipProps, 'children'>;
		[key: string]: unknown;
	}

	let {
		name,
		size,
		color = 'var(--primary-color)',
		onClick = undefined,
		tooltipProps = undefined,
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

{#if tooltipProps}
	<Tooltip {...tooltipProps}>
		{#if onClick}
			<button onclick={handleClick} class="icon-button">
				<Icon {...props} {color} size={resolvedSize} />
			</button>
		{:else}
			<Icon {...props} {color} size={resolvedSize} />
		{/if}
	</Tooltip>
{:else if onClick}
	<button onclick={handleClick} class="icon-button">
		<Icon {...props} {color} size={resolvedSize} />
	</button>
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
	.icon-button:hover :global(svg) {
		color: white !important;
	}
</style>
