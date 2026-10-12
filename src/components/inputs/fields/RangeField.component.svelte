<script lang="ts">
	import type { Snippet } from 'svelte';
	import RangeSelector from '../RangeSelector.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Props {
		label: string;
		value?: number;
		min: number;
		max: number;
		step: number;
		disabled?: boolean;
		format?: (v: number) => string;
		tooltip?: string;
		helper?: string;
		error?: string;
		labelPosition?: 'top' | 'inline';
		id?: string;
		suffix?: Snippet;
		onChange?: (v: number) => void;
		/** Fires once on release (native `change`), not on every drag tick. */
		onCommit?: (v: number) => void;
	}

	let {
		label,
		value = $bindable(0),
		min,
		max,
		step,
		disabled = false,
		format,
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

	const defaultFormat = (v: number) => v.toFixed(2).replace(/\.?0+$/, '');
	const displayValue = $derived((format ?? defaultFormat)(value));
</script>

<FieldBase
	{label}
	{labelPosition}
	{tooltip}
	{helper}
	{error}
	id={fieldId}
	valueText={displayValue}
	{suffix}
>
	<RangeSelector
		id={fieldId}
		bind:value
		{min}
		{max}
		{step}
		{disabled}
		{format}
		{onChange}
		{onCommit}
	/>
</FieldBase>
