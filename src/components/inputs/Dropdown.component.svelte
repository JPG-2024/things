<script lang="ts">
interface Option {
	label: string;
	value: string;
}

interface Props {
	options: Option[];
	value?: string;
	placeholder?: string;
	disabled?: boolean;
	onChange?: (value: string) => void;
}

let {
	options = [],
	value = $bindable(""),
	placeholder = "Select option...",
	disabled = false,
	onChange,
}: Props = $props();

function handleChange(event: Event) {
	const target = event.target as HTMLSelectElement;
	const newValue = target.value;
	value = newValue;

	if (onChange) {
		onChange(newValue);
	}
}
</script>

<select
  class="dropdown-input"
  bind:value
  {disabled}
  onchange={handleChange}
>
  {#if placeholder}
    <option value="" disabled selected hidden>{placeholder}</option>
  {/if}
  {#each options as option}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>

<style>
  .dropdown-input {
    position: relative;
    color: var(--primary-color);
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
    appearance: none;
    cursor: pointer;
  }

  .dropdown-input:focus {
    box-shadow: inset 0 0 5px 1px var(--primary-color);
    transition: all 0.3s ease;
  }

  .dropdown-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  option {
    background: #1a1a1a;
    color: white;
  }
</style>
