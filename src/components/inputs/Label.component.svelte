<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		text: string;
		htmlFor?: string;
		position?: 'top' | 'inline';
		value?: string;
		children: Snippet;
	}

	let { text, htmlFor, position = 'top', value, children }: Props = $props();
</script>

<div class="label-wrapper" class:inline={position === 'inline'}>
	<label for={htmlFor}>
		<span class="label-text">{text}</span>
		{#if value}
			<span class="label-value">{value}</span>
		{/if}
	</label>
	{@render children()}
</div>

<style>
	.label-wrapper {
		padding-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label-wrapper.inline {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}

	label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85rem;
		color: inherit;
		border-radius: 8px;
		background-color: rgba(255, 255, 255, 0.02);
		backdrop-filter: blur(4px);
		gap: 0.5rem;
	}

	.label-text {
		color: var(--primary-color, #000);
	}

	.label-value {
		font-weight: bold;
		color: var(--primary-color, #000);
	}
</style>
