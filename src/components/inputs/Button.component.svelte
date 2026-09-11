<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';

	interface Props {
		disabled?: boolean;
		onClick?: () => void;
		type?: 'button' | 'submit' | 'reset';
		icon?: string;
		children: Snippet;
	}

	let { disabled = false, onClick, type = 'button', icon = undefined, children }: Props = $props();

	function handleClick() {
		if (onClick && !disabled) {
			onClick();
		}
	}
</script>

<button {type} {disabled} onclick={handleClick}>
	{#if icon}
		<Icon name={icon} size={18} />
	{/if}
	{@render children()}
</button>

<style>
	button {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--primary-color);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		font: inherit;
		transition:
			text-shadow 0.2s ease,
			filter 0.2s ease;
	}

	button:hover {
		text-shadow: var(--glow-text);
	}

	button:hover :global(svg) {
		filter: var(--glow-sm) var(--glow-md) var(--glow-lg);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
