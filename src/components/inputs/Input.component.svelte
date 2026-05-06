<script lang="ts">
import Label from "./Label.component.svelte";

interface Props {
	id?: string;
	value?: string;
	placeholder?: string;
	disabled?: boolean;
	type?: string;
	min?: string;
	label?: string;
	labelPosition?: "top" | "inline";
	onChange?: (value: string) => void;
	onEnter?: (value: string) => void;
}

let {
	id,
	value = $bindable(""),
	placeholder = "",
	disabled = false,
	type = "text",
	min,
	label,
	labelPosition = "top",
	onChange,
	onEnter,
}: Props = $props();

function handleInput(event: Event) {
	const target = event.target as HTMLInputElement;
	const newValue = target.value;
	value = newValue;

	if (onChange) {
		onChange(newValue);
	}
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Enter" && onEnter) {
		event.preventDefault();
		onEnter(value);
		value = "";
	}
}
</script>

{#if label}
	<Label text={label} position={labelPosition}>
		<input
			{id}
			class="text-input"
			{type}
			{min}
			bind:value
			{placeholder}
			{disabled}
			oninput={handleInput}
			onkeydown={handleKeydown}
		/>
	</Label>
{:else}
	<input
		{id}
		class="text-input"
		{type}
		{min}
		bind:value
		{placeholder}
		{disabled}
		oninput={handleInput}
		onkeydown={handleKeydown}
	/>
{/if}

<style>
	.text-input {
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: 12px;
		background: rgba(154, 154, 154, 0.12);
		box-shadow: inset 0 12px 14px rgba(var(--primary-color), 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 0.4rem 0.75rem;
		width: 100%;
		color: inherit;
		font-size: 1rem;
	}

	.text-input:focus {
		box-shadow: inset 0 -1px 2px 0px var(--primary-color);
		transition: all 0.3s ease;
	}

	.text-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>