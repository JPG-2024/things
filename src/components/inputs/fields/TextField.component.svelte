<script lang="ts">
	import type { Snippet } from 'svelte';
	import Input from '../Input.component.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Props {
		label: string;
		value?: string;
		placeholder?: string;
		type?: string;
		search?: boolean;
		disabled?: boolean;
		autofocus?: boolean;
		tooltip?: string;
		helper?: string;
		error?: string;
		labelPosition?: 'top' | 'inline';
		id?: string;
		suffix?: Snippet;
		onChange?: (value: string) => void;
		onBlur?: (value: string) => void;
		onEnter?: (value: string) => void;
	}

	let {
		label,
		value = $bindable(''),
		placeholder = '',
		type = 'text',
		search = false,
		disabled = false,
		autofocus = false,
		tooltip,
		helper,
		error,
		labelPosition = 'top',
		id,
		suffix,
		onChange,
		onBlur,
		onEnter
	}: Props = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? uid);
</script>

<FieldBase {label} {labelPosition} {tooltip} {helper} {error} id={fieldId} {suffix}>
	<Input
		id={fieldId}
		bind:value
		{placeholder}
		{type}
		{search}
		{disabled}
		{autofocus}
		{onChange}
		{onBlur}
		{onEnter}
	/>
</FieldBase>
