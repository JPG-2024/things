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
		color: rgba(207, 205, 205, 0.602);
	}

	.label-value {
		font-weight: bold;
		color: var(--primary-color, #000);
	}
</style>
