<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';

	interface Props {
		text: string;
		htmlFor?: string;
		position?: 'top' | 'inline';
		value?: string;
		/** Optional "?" icon next to the label that reveals an info tooltip on hover. */
		tooltip?: string;
		/** Let the control grow past `--field-height` (e.g. textareas). */
		stretch?: boolean;
		children: Snippet;
	}

	let {
		text,
		htmlFor,
		position = 'top',
		value,
		tooltip,
		stretch = false,
		children
	}: Props = $props();
</script>

<div class="label-wrapper" class:inline={position === 'inline'}>
	<label for={htmlFor}>
		<span class="label-main">
			<span class="label-text">{text}</span>
			{#if tooltip}
				<Icon
					name="CircleHelp"
					size={13}
					color="var(--gray-300)"
					tooltipProps={{ content: tooltip, position: 'top' }}
				/>
			{/if}
		</span>
		{#if value}
			<span class="label-value">{value}</span>
		{/if}
	</label>
	<div class="label-children" class:stretch>{@render children()}</div>
</div>

<style>
	.label-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1;
		min-width: 0;
	}

	.label-children {
		display: flex;
		align-items: center;
		gap: 1rem;
		height: var(--field-height, 38px);
		min-width: 0;
	}

	.label-children.stretch {
		height: auto;
		align-items: stretch;
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

	.label-main {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
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
