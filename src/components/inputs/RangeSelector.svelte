<script lang="ts">
	import Label from './Label.component.svelte';

	type Props = {
		id: string;
		label?: string;
		labelPosition?: 'top' | 'inline';
		value: number;
		min: number;
		max: number;
		step: number;
		format?: (v: number) => string;
		onChange?: (v: number) => void;
	};

	let {
		id,
		label,
		labelPosition = 'top',
		value,
		min,
		max,
		step,
		format = (v) => v.toFixed(2).replace(/\.?0+$/, ''),
		onChange
	}: Props = $props();

	let displayValue = $derived(format(value));

	function onInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const newValue = parseFloat(target.value);
		value = newValue;
		onChange?.(newValue);
	}
</script>

{#if label}
	<Label text={label} htmlFor={id} position={labelPosition} value={displayValue}>
		<div class="range-wrapper">
			<input {id} type="range" {min} {max} {step} {value} oninput={onInput} />
		</div>
	</Label>
{:else}
	<div class="range-wrapper">
		<input {id} type="range" {min} {max} {step} {value} oninput={onInput} />
	</div>
{/if}

<style>
	.range-wrapper {
		position: relative;
		width: 100%;
		padding-bottom: 10px;
		border-radius: var(--radius-md);
		background-color: rgba(255, 255, 255, 0.02);
		backdrop-filter: blur(4px);
	}

	input[type='range'] {
		width: 100%;
		-webkit-appearance: none;
		appearance: none;
		height: 6px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.1);
		outline: none;
		cursor: pointer;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--primary-color, #7c6af7);
		cursor: pointer;
		box-shadow: 0 0 6px rgba(124, 106, 247, 0.4);
		transition: transform 150ms ease;
	}

	input[type='range']::-webkit-slider-thumb:hover {
		transform: scale(1.15);
	}

	input[type='range']::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border: none;
		border-radius: 50%;
		background: var(--primary-color, #7c6af7);
		cursor: pointer;
		box-shadow: 0 0 6px rgba(124, 106, 247, 0.4);
		transition: transform 150ms ease;
	}

	input[type='range']::-moz-range-thumb:hover {
		transform: scale(1.15);
	}

	input[type='range']::-moz-range-track {
		height: 6px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.1);
	}
</style>
