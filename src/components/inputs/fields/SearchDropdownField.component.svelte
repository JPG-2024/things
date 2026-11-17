<script lang="ts">
	import type { Snippet } from 'svelte';
	import SearchDropdown from '../SearchDropdown.component.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Option {
		label: string;
		value: string;
		emoji?: string;
		description?: string;
	}

	interface Props {
		label: string;
		options: Option[];
		value?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		disabled?: boolean;
		capitalize?: boolean;
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
		searchPlaceholder = 'Search...',
		disabled = false,
		capitalize = true,
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
	<SearchDropdown
		id={fieldId}
		bind:value
		{options}
		{placeholder}
		{searchPlaceholder}
		{disabled}
		{capitalize}
		{onChange}
	/>
</FieldBase>
