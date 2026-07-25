<script lang="ts">
	import Label from './Label.component.svelte';

	interface Props {
		id?: string;
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		rows?: number;
		label?: string;
		labelPosition?: 'top' | 'inline';
		onChange?: (value: string) => void;
	}

	let {
		id,
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		rows = 3,
		label,
		labelPosition = 'top',
		onChange
	}: Props = $props();

	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		const newValue = target.value;
		value = newValue;

		if (onChange) {
			onChange(newValue);
		}
	}
</script>

{#if label}
	<Label text={label} position={labelPosition}>
		<textarea
			{id}
			class="text-input"
			{rows}
			bind:value
			{placeholder}
			{disabled}
			oninput={handleInput}
		></textarea>
	</Label>
{:else}
	<textarea {id} class="text-input" {rows} bind:value {placeholder} {disabled} oninput={handleInput}
	></textarea>
{/if}

<style>
	.text-input {
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: 12px;
		background: transparent;
		box-shadow: inset 0 12px 14px rgba(var(--primary-color), 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 0.4rem 0.75rem;
		width: 100%;
		color: inherit;
		font-size: 1rem;
		font-family: inherit;
		resize: vertical;
		field-sizing: content;
		min-height: 4rem; /* Keeps a baseline size when empty */
		max-height: 300px;
	}

	.text-input:focus {
		box-shadow: inset 0 -1px 2px 0px var(--primary-color);
		transition: all 0.3s ease;
	}

	.text-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
