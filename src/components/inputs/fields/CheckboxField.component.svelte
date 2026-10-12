<script lang="ts">
	import type { Snippet } from 'svelte';
	import Checkbox from '../Checkbox.component.svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Props {
		label: string;
		checked?: boolean;
		tooltip?: string;
		helper?: string;
		error?: string;
		labelPosition?: 'top' | 'inline';
		id?: string;
		suffix?: Snippet;
		onChange?: (checked: boolean) => void;
	}

	let {
		label,
		checked = $bindable(false),
		tooltip,
		helper,
		error,
		labelPosition = 'inline',
		id,
		suffix,
		onChange
	}: Props = $props();

	const uid = $props.id();
	const fieldId = $derived(id ?? uid);
</script>

<FieldBase {label} {labelPosition} {tooltip} {helper} {error} id={fieldId} {suffix}>
	<Checkbox id={fieldId} bind:checked {onChange} />
</FieldBase>
