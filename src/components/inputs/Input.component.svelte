<script lang="ts">
  interface Props {
    value?: string
    placeholder?: string
    disabled?: boolean
    onChange?: (value: string) => void
    onEnter?: (value: string) => void
  }

  let {
    value = $bindable(''),
    placeholder = '',
    disabled = false,
    onChange,
    onEnter,
  }: Props = $props()

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement
    const newValue = target.value
    value = newValue

    if (onChange) {
      onChange(newValue)
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && onEnter) {
      event.preventDefault()
      onEnter(value)
      value = ''
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
    border-radius: 12px;
    background: rgba(154, 154, 154, 0.1);
    padding: 1rem 0.75rem;
    width: 100%;
    color: inherit;
    font-size: 1rem;
  }

  .text-input:focus {
    box-shadow: 0 0 0 1px rgba(154, 154, 154, 0.4);
  }

  .text-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
