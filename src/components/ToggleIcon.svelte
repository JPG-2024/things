<script lang="ts">
	import Icon from './Icon.svelte';
	import type { TooltipOptions } from '@/lib/actions/tooltip';

	interface Props {
		name: string;
		checked?: boolean;
		color?: string;
		size?: number;
		label?: string | null;
		tooltipProps?: TooltipOptions;
		onClick?: (event: MouseEvent) => void;
		[key: string]: unknown;
	}

	let {
		name,
		checked = $bindable(false),
		color = 'var(--bg-color)',
		size,
		label = null,
		tooltipProps = undefined,
		onClick = undefined,
		...props
	}: Props = $props();
</script>

<button
	type="button"
	class="toggle-wrapper"
	onclick={(e) => {
		if (onClick) {
			onClick(e);
		} else {
			checked = !checked;
		}
	}}
>
	<span class="icon-glow" class:glow={checked}>
		<Icon
			{name}
			{...props}
			color={checked ? 'var(--primary-color)' : color}
			{size}
			{tooltipProps}
		/>
	</span>
	{#if label}
		<span class="label" class:glow={checked}>{label}</span>
	{/if}
</button>

<style>
	.toggle-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
	}
	.toggle-wrapper:focus {
		outline: none;
	}
	.icon-glow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		overflow: visible;
		flex-shrink: 0;
	}
	.icon-glow :global(svg) {
		opacity: 1;
		transition: opacity 0.2s ease;
	}
	.icon-glow:not(.glow) :global(svg) {
		opacity: 0.6;
	}
	.label {
		color: white;
		font-size: 0.875rem;
		opacity: 0.5;
		font-family: var(--font-secondary);
	}
	.label.glow {
		opacity: 1;
	}
</style>
