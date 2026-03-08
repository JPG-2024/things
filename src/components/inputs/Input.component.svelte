<script lang="ts">
interface Props {
	value?: string;
	placeholder?: string;
	disabled?: boolean;
	onChange?: (value: string) => void;
	onEnter?: (value: string) => void;
}

let {
	value = $bindable(""),
	placeholder = "",
	disabled = false,
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

<input
  class="text-input"
  type="text"
  bind:value
  {placeholder}
  {disabled}
  oninput={handleInput}
  onkeydown={handleKeydown}
/>

<style>
  .text-input {
    backdrop-filter: blur(8px);
    box-sizing: border-box;
    outline: none;
    border: none;
    border-radius: 15px;
    background: rgba(154, 154, 154, 0.12);
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.5);
    padding: 0.6rem 0.75rem;
    width: 100%;
    color: inherit;
    font-size: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .text-input:focus {
    box-shadow: inset 0 0 5px 1px var(--primary-color);
    transition: all 0.3s ease;
  }

  .text-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
