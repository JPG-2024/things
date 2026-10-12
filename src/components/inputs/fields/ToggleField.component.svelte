<script lang="ts">
	import type { Snippet } from 'svelte';
	import FieldBase from './FieldBase.component.svelte';

	interface Props {
		label: string;
		checked?: boolean;
		disabled?: boolean;
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
		disabled = false,
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

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onChange?.(checked);
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			toggle();
		}
	}
</script>

<FieldBase {label} {labelPosition} {tooltip} {helper} {error} id={fieldId} {suffix}>
	<div
		role="switch"
		aria-checked={checked}
		aria-label={label}
		aria-disabled={disabled}
		tabindex={disabled ? -1 : 0}
		class="switch"
		class:on={checked}
		class:disabled
		onclick={toggle}
		onkeydown={onKey}
	>
		<div class="knob" class:move={checked}></div>
	</div>
</FieldBase>

<style>
	.switch {
		--w: 35px;
		--h: 20px;
		--knob-size: 16px;
		width: var(--w);
		height: var(--h);
		border-radius: calc(var(--h) / 2);
		background: #acacac64;
		position: relative;
		padding: 3px;
		cursor: pointer;
		transition: background 200ms;
		display: inline-flex;
		align-items: center;
	}

	.switch.on {
		background: var(--primary-color);
	}

	.switch.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.knob {
		width: var(--knob-size);
		height: var(--knob-size);
		background: white;
		border-radius: 50%;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
		transition: transform 220ms;
		position: relative;
		z-index: 2;
	}

	.knob.move {
		transform: translateX(calc(var(--w) - var(--knob-size) - 6px));
	}
</style>
