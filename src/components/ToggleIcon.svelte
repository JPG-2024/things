<script lang="ts">
	import Icon from './Icon.svelte';
	import type { TooltipProps } from '@/components/Tooltip.svelte';

	interface Props {
		name: string;
		checked?: boolean;
		color?: string;
		size?: number;
		label?: string | null;
		tooltipProps?: Omit<TooltipProps, 'children'>;
		[key: string]: unknown;
	}

	let {
		name,
		checked = $bindable(false),
		color = 'var(--primary-color)',
		size = 18,
		label = null,
		tooltipProps = undefined,
		...props
	}: Props = $props();
</script>

<button type="button" class="toggle-wrapper" onclick={() => (checked = !checked)}>
	<span class="icon-glow" class:glow={checked}>
		<Icon {name} {...props} {color} {size} {tooltipProps} />
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
		isolation: isolate;
		will-change: filter;
		transform: translateZ(0);
		transition: filter 0.2s ease;
		filter: none;
	}
	.icon-glow.glow {
		filter: drop-shadow(0 0 5px var(--primary-color)) drop-shadow(0 0 10px var(--primary-color))
			drop-shadow(0 0 15px white);
	}
	.icon-glow :global(svg) {
		opacity: 1;
		transition: opacity 0.2s ease;
	}
	.icon-glow:not(.glow) :global(svg) {
		opacity: 0.5;
	}
	.label {
		color: var(--primary-color);
		font-size: 0.875rem;
		opacity: 0.5;
		transition:
			opacity 0.2s ease,
			text-shadow 0.2s ease;
	}
	.label.glow {
		opacity: 1;
		text-shadow:
			0 0 5px var(--primary-color),
			0 0 10px var(--primary-color),
			0 0 15px white;
	}
</style>
