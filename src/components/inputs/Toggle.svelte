<script lang="ts">
import { createEventDispatcher } from "svelte";
import Label from "./Label.component.svelte";

type Props = {
	label?: string;
	labelPosition?: "top" | "inline";
	initial?: boolean;
	onChange?: (checked: boolean) => void;
};

let {
	label,
	labelPosition = "inline",
	initial = false,
	onChange,
}: Props = $props();

let isOn = $state<boolean>(initial);

const dispatch = createEventDispatcher();

function toggle() {
	isOn = !isOn;
	dispatch("change", { checked: isOn });
	onChange?.(isOn);
}

function onKey(e: KeyboardEvent) {
	if (e.key === " " || e.key === "Enter") {
		e.preventDefault();
		toggle();
	}
}

const toggleSwitch = $derived(
	`<div role="switch" aria-checked={isOn} tabindex="0" class="switch {isOn ? 'on' : ''}" onclick={toggle} onkeydown={onKey}><div class="radial" aria-hidden="true"></div><div class="knob {isOn ? 'move' : ''}"></div></div>`
);
</script>

{#if label}
	<Label text={label} position={labelPosition}>
		<div
			role="switch"
			aria-checked={isOn}
			tabindex="0"
			class="switch {isOn ? 'on' : ''}"
			onclick={toggle}
			onkeydown={onKey}
		>
			<div class="radial" aria-hidden="true"></div>
			<div class="knob {isOn ? 'move' : ''}"></div>
		</div>
	</Label>
{:else}
	<div
		role="switch"
		aria-checked={isOn}
		tabindex="0"
		class="switch {isOn ? 'on' : ''}"
		onclick={toggle}
		onkeydown={onKey}
	>
		<div class="radial" aria-hidden="true"></div>
		<div class="knob {isOn ? 'move' : ''}"></div>
	</div>
{/if}

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
		background: linear-gradient(90deg, var(--primary-color), var(--primary-color));
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

	.radial {
		position: absolute;
		left: 6px;
		top: 50%;
		transform: translateY(-50%);
		width: var(--knob-size);
		height: var(--knob-size);
		border-radius: 50%;
		pointer-events: none;
		z-index: 1;

		transition:
			width 320ms,
			height 320ms,
			opacity 200ms,
			left 220ms;
	}
</style>