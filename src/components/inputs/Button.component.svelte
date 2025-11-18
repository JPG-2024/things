<script lang="ts">
  interface Props {
    label: string
    disabled?: boolean
    onClick?: () => void
    type?: 'button' | 'submit' | 'reset'
  }

  let { label, disabled = false, onClick, type = 'button' }: Props = $props()

  function handleClick() {
    if (onClick && !disabled) {
      onClick()
    }
  }
</script>

<button class="btn" {type} {disabled} onclick={handleClick}>
  {label}
</button>

<style>
  .btn {
    transition: all 0.2s ease;
    cursor: pointer;
    box-sizing: border-box;
    outline: none;
    box-shadow: inset 0 2px 5px var(--primary-color);
    border: none;
    border-radius: 20px;
    background: rgba(154, 154, 154, 0.1);
    padding: 0.5rem 4rem;
    color: inherit;
    font-weight: 500;
    font-size: inherit;
  }

  .btn:hover:not(:disabled) {
    box-shadow: 0 0 0 1px rgba(154, 154, 154, 0.4);
    background: rgba(154, 154, 154, 0.3);
  }

  .btn:active:not(:disabled) {
    background: rgba(154, 154, 154, 0.2);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
