<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		disabled?: boolean;
		onClick?: () => void;
		type?: 'button' | 'submit' | 'reset';
		size?: 'default' | 'small';
		children: Snippet;
	}

	let { disabled = false, onClick, type = 'button', size = 'default', children }: Props = $props();

	function handleClick() {
		if (onClick && !disabled) {
			onClick();
		}
	}
</script>

<button class="btn" class:btn-small={size === 'small'} {type} {disabled} onclick={handleClick}>
	{@render children()}
</button>

<style>
	.btn {
		width: 100%;
		transition: all 0.2s ease;
		cursor: pointer;
		box-sizing: border-box;
		outline: none;
		box-shadow: inset 0 0px 5px var(--primary-color);
		border: 1px solid var(--primary-color);
		border-radius: 12px;
		background: rgba(154, 154, 154, 0.12);
		color: var(--primary-color);
		font-weight: bold;
		font-size: 1.2rem;
		opacity: 0.8;
	}

	.btn:hover:not(:disabled) {
		box-shadow: 0 0 0 1px rgba(154, 154, 154, 0.4);
		background: var(--primary-color);
		color: black;
	}

	.btn:active:not(:disabled) {
		background: rgba(154, 154, 154, 0.2);
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-small {
		width: auto;
		font-size: 0.85rem;
		padding: 0.25rem 0.75rem;
		border-radius: 8px;
	}
</style>
