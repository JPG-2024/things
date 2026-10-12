<script lang="ts">
	import type { Snippet } from 'svelte';
	import Textarea from '../Textarea.component.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Props {
		label: string;
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		rows?: number;
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
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		rows = 3,
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

<FieldBase {label} {labelPosition} {tooltip} {helper} {error} id={fieldId} {suffix} stretch>
	<Textarea id={fieldId} bind:value {placeholder} {disabled} {rows} {onChange} />
</FieldBase>
