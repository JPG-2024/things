<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconDropdown from '../IconDropdown.component.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Option {
		label: string;
		value: string;
		icon?: string;
		emoji?: string;
	}

	interface Props {
		label: string;
		options: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		iconSize?: number;
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
		iconSize = 24,
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
	<IconDropdown bind:value {options} {placeholder} {disabled} {iconSize} {onChange} />
</FieldBase>
