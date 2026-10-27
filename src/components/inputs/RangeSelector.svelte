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
		disabled?: boolean;
		format?: (v: number) => string;
		onChange?: (v: number) => void;
		/** Fires once on release (native `change`), not on every drag tick. */
		onCommit?: (v: number) => void;
	};

	let {
		id,
		label,
		labelPosition = 'top',
		value = $bindable(0),
		min,
		max,
		step,
		disabled = false,
		format = (v) => v.toFixed(2).replace(/\.?0+$/, ''),
		onChange,
		onCommit
	}: Props = $props();

	let displayValue = $derived(format(value));

	/** 0-1 progress of the thumb, unitless so CSS can use it in calc() freely. */
	let pct = $derived.by(() => {
		const range = max - min;
		if (!Number.isFinite(range) || range === 0) return 0;
		const progress = (value - min) / range;
		return Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
	});

	function onInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const newValue = parseFloat(target.value);
		value = newValue;
		onChange?.(newValue);
	}

	function onChangeEvent(e: Event) {
		const target = e.target as HTMLInputElement;
		const newValue = parseFloat(target.value);
		if (!Number.isFinite(newValue)) return;
		onCommit?.(newValue);
	}
</script>

{#if label}
	<Label text={label} htmlFor={id} position={labelPosition} value={displayValue}>
		<div class="range-wrapper" class:disabled style="--pct: {pct}">
			<div class="range-track" aria-hidden="true">
				<div class="range-fill"></div>
				<div class="range-thumb"></div>
			</div>
			<input
				{id}
				type="range"
				{min}
				{max}
				{step}
				{disabled}
				{value}
				oninput={onInput}
				onchange={onChangeEvent}
			/>
		</div>
	</Label>
{:else}
	<div class="range-wrapper" class:disabled style="--pct: {pct}">
		<div class="range-track" aria-hidden="true">
			<div class="range-fill"></div>
			<div class="range-thumb"></div>
		</div>
		<input
			{id}
			type="range"
			{min}
			{max}
			{step}
			{disabled}
			{value}
			oninput={onInput}
			onchange={onChangeEvent}
		/>
	</div>
{/if}

<style>
	.range-wrapper {
		position: relative;
		width: 100%;
		height: 20px;
		border-radius: 100px;
	}

	/* Outer "beam" that lights up on hover/focus, intensity grows with value. */
	.range-wrapper::before {
		content: '';
		position: absolute;
		inset: -3px;
		border-radius: 100px;

		opacity: 0;
		transition: opacity 150ms ease;
		pointer-events: none;
	}

	.range-wrapper:hover::before,
	.range-wrapper:focus-within::before {
		opacity: 1;
	}

	/* Invisible input stays the interactive surface for drag + keyboard. */
	input[type='range'] {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		-webkit-appearance: none;
		appearance: none;
		background: none;
		border: 0;
		padding: 0;
		opacity: 0;
		cursor: grab;
		outline: none;
		touch-action: none;
	}

	input[type='range']:active {
		cursor: grabbing;
	}

	input[type='range']:disabled {
		cursor: not-allowed;
	}

	.range-track {
		position: absolute;
		inset: 0;
		border-radius: 100px;
		background: hsl(0 0% 8%);

		pointer-events: none;
	}

	.range-fill {
		position: absolute;
		top: 1px;
		bottom: 1px;
		left: 1px;
		width: calc(var(--pct) * (100% - 2px));
		border-radius: 100px;
		background: linear-gradient(
			90deg,
			transparent 50%,
			color-mix(in srgb, var(--bg-color) 20%, transparent),
			color-mix(in srgb, var(--primary-color) 10%, var(--primary-color))
		);

		transition:
			width 0.1s ease,
			box-shadow 0.1s ease;
	}

	.range-thumb {
		position: absolute;
		top: 50%;
		left: calc(var(--pct) * (100% - 20px) + 10px);
		translate: -50% -50%;
		width: 16px;
		aspect-ratio: 1;
		border-radius: 50%;
		background: hsl(0 0% 16%);

		display: grid;
		place-items: center;
	}

	/* The "eye" in the middle of the knob: brighter and bigger glow with value. */
	.range-thumb::after {
		background: var(--primary-color);
		content: '';
		position: absolute;
		width: 26%;
		aspect-ratio: 1;
		border-radius: 50%;
	}

	.range-wrapper.disabled .range-fill {
		background: rgba(255, 255, 255, 0.08);
		box-shadow: none;
	}

	.range-wrapper.disabled .range-thumb {
		background: hsl(0 0% 22%);
	}

	.range-wrapper.disabled .range-thumb::after {
		background: hsl(0 0% 40%);
		box-shadow: none;
	}
</style>
