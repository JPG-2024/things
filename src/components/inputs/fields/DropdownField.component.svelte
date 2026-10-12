<script lang="ts">
	import type { Snippet } from 'svelte';
	import Dropdown from '../Dropdown.component.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Option {
		label: string;
		value: string;
	}

	interface Props {
		label: string;
		options: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		tooltip?: string;
		helper?: string;
		error?: string;
		labelPosition?: 'top' | 'inline';
		id?: string;
		suffix?: Snippet;
		onChange?: (value: string) => void;
	}

	let {
		label,
		options = [],
		value = $bindable(''),
		placeholder = 'Select option...',
		disabled = false,
		tooltip,
		helper,
		error,
		labelPosition = 'top',
		id,
		suffix,
		onChange
	}: Props = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? uid);
</script>

<FieldBase {label} {labelPosition} {tooltip} {helper} {error} id={fieldId} {suffix}>
	<Dropdown bind:value {options} {placeholder} {disabled} {onChange} />
</FieldBase>
