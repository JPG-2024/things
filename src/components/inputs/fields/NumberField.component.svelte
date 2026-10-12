<script lang="ts">
	import type { Snippet } from 'svelte';
	import Input from '../Input.component.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Props {
		label: string;
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		/** Truncate to an integer when committing. */
		integer?: boolean;
		/** Decimal places to round to when `integer` is false. */
		precision?: number;
		placeholder?: string;
		disabled?: boolean;
		tooltip?: string;
		helper?: string;
		error?: string;
		labelPosition?: 'top' | 'inline';
		id?: string;
		suffix?: Snippet;
		onChange?: (value: number) => void;
		onCommit?: (value: number) => void;
	}

	let {
		label,
		value = $bindable(0),
		min,
		max,
		step = 1,
		integer = true,
		precision = 2,
		placeholder = '',
		disabled = false,
		tooltip,
		helper,
		error,
		labelPosition = 'top',
		id,
		suffix,
		onChange,
		onCommit
	}: Props = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? uid);

	let text = $state(String(value));
	let lastValue = value;

	// Keep the visible text in sync when the bound value changes from outside,
	// without fighting the user mid-typing.
	$effect(() => {
		if (value !== lastValue) {
			lastValue = value;
			text = String(value);
		}
	});

	function normalize(raw: number): number {
		let next = raw;
		if (integer) {
			next = Math.trunc(next);
		} else {
			const factor = 10 ** precision;
			next = Math.round(next * factor) / factor;
		}
		if (min !== undefined) next = Math.max(min, next);
		if (max !== undefined) next = Math.min(max, next);
		return next;
	}

	// Clamp on blur instead of on every keystroke so typing intermediate values
	// (e.g. "1024" with min 1024) is not punished.
	function commit() {
		const parsed = Number(text);
		if (text.trim() === '' || Number.isNaN(parsed)) {
			text = String(value);
			return;
		}
		const next = normalize(parsed);
		text = String(next);
		if (next !== value) {
			value = next;
			lastValue = next;
			onChange?.(next);
		}
		onCommit?.(next);
	}
</script>

<FieldBase {label} {labelPosition} {tooltip} {helper} {error} id={fieldId} {suffix}>
	<Input
		id={fieldId}
		bind:value={text}
		type="number"
		min={min !== undefined ? String(min) : undefined}
		max={max !== undefined ? String(max) : undefined}
		step={String(step)}
		{placeholder}
		{disabled}
		onBlur={commit}
	/>
</FieldBase>
