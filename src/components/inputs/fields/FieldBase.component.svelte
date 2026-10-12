<script lang="ts">
	import type { Snippet } from 'svelte';
	import Label from '../Label.component.svelte';

	interface Props {
		label: string;
		labelPosition?: 'top' | 'inline';
		tooltip?: string;
		helper?: string;
		error?: string;
		id?: string;
		valueText?: string;
		suffix?: Snippet;
		/** Let the control grow past `--field-height` (e.g. textareas). */
		stretch?: boolean;
		children: Snippet;
	}

	let {
		label,
		labelPosition = 'top',
		tooltip,
		helper,
		error,
		id,
		valueText,
		suffix,
		stretch = false,
		children
	}: Props = $props();
</script>

<Label text={label} htmlFor={id} position={labelPosition} value={valueText} {tooltip} {stretch}>
	<div class="field-control" class:inline={labelPosition === 'inline'}>
		<div class="field-control-main">{@render children()}</div>
		{#if suffix}
			<div class="field-control-suffix">{@render suffix()}</div>
		{/if}
	</div>
</Label>

{#if error}
	<p class="field-message error">{error}</p>
{:else if helper}
	<p class="field-message helper">{helper}</p>
{/if}

<style>
	.field-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
	}

	.field-control.inline {
		width: auto;
		flex-shrink: 0;
	}

	.field-control-main {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	.field-control-suffix {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.field-message {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.2;
		word-break: break-word;
	}

	.field-message.helper {
		color: rgba(255, 255, 255, 0.5);
	}

	.field-message.error {
		color: rgb(255, 140, 109);
	}
</style>
