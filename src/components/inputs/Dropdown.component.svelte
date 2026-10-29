<script lang="ts">
	import Label from './Label.component.svelte';

	interface Option {
		label: string;
		value: string;
	}

	interface Props {
		options: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		label?: string;
		labelPosition?: 'top' | 'inline';
		onChange?: (value: string) => void;
	}

	let {
		options = [],
		value = $bindable(''),
		placeholder = 'Select option...',
		disabled = false,
		label,
		labelPosition = 'top',
		onChange
	}: Props = $props();

	function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const newValue = target.value;
		value = newValue;
		target.blur();

		if (onChange) {
			onChange(newValue);
		}
	}
</script>

{#if label}
	<Label text={label} position={labelPosition}>
		<select class="dropdown-input" bind:value {disabled} onchange={handleChange}>
			{#if placeholder}
				<option value="" disabled selected hidden>{placeholder}</option>
			{/if}
			{#each options as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</Label>
{:else}
	<select class="dropdown-input" bind:value {disabled} onchange={handleChange}>
		{#if placeholder}
			<option value="" disabled selected hidden>{placeholder}</option>
		{/if}
		{#each options as option}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
{/if}

<style>
	.dropdown-input {
		box-sizing: border-box;
		outline: none;
		border-radius: var(--radius-sm);
		background: rgba(128, 128, 128, 0.15);
		border: 1px solid rgb(19, 19, 19);
		padding: 0.16rem 1rem;
		width: 100%;
		color: inherit;
		font-size: 1rem;
		appearance: none;
		cursor: pointer;
	}

	.dropdown-input:focus {
		transition: all 0.3s ease;
		border-left: 1px solid var(--primary-color);
		border-right: 1px solid var(--primary-color);
	}

	.dropdown-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	option {
		background: #1a1a1a;
		color: white;
	}
</style>
