<script lang="ts">
	interface Props {
		label?: string;
		checked?: boolean;
		disabled?: boolean;
	}

	let { label = '', checked = $bindable(false), disabled = false }: Props = $props();
</script>

<label class="toggle-wrapper">
	<input type="checkbox" bind:checked {disabled} />
	<span class="toggle-slider"></span>
	{#if label}
		<span class="toggle-label">{label}</span>
	{/if}
</label>

<style>
	.toggle-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		user-select: none;
	}

	input[type='checkbox'] {
		display: none;
	}

	.toggle-slider {
		position: relative;
		transition: background-color 0.3s;
		border-radius: var(--radius-lg);
		background-color: #ccc;
		width: 2.5rem;
		height: 1.4rem;
	}

	.toggle-slider::before {
		position: absolute;
		top: 0.1rem;
		left: 0.1rem;
		transition: transform 0.3s;
		border-radius: 50%;
		background-color: white;
		width: 1.2rem;
		height: 1.2rem;
		content: '';
	}

	input:checked + .toggle-slider {
		background-color: #4caf50;
	}

	input:checked + .toggle-slider::before {
		transform: translateX(1.1rem);
	}

	input:disabled + .toggle-slider {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toggle-label {
		font-size: 0.95rem;
	}
</style>
