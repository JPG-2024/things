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
	<div class="label-children">{@render children()}</div>
</div>

<style>
	.label-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1;
	}

	.label-children {
		display: flex;
		align-items: center;
		gap: 1rem;
		height: 38px;
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
		font-size: 0.8rem;
		color: inherit;
		border-radius: var(--radius-md);
		backdrop-filter: blur(4px);
		gap: 0.5rem;
	}

	.label-text {
		font-family: var(--font-secondary);
		font-size: 0.7rem;
		color: var(--gray-200);
	}

	.label-value {
		font-family: var(--font-secondary);
		font-size: 0.7rem;
		color: var(--primary-color);
	}
</style>
