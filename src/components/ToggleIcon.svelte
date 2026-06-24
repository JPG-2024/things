<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		name,
		checked = $bindable(false),
		color = 'var(--primary-color)',
		size = 18,
		label = null,
		...props
	} = $props();

	const glowFilter =
		'drop-shadow(0 0 5px var(--primary-color)) drop-shadow(0 0 10px var(--primary-color)) drop-shadow(0 0 10px var(--primary-color)) drop-shadow(0 0 10px var(--primary-color)) drop-shadow(0 0 80px white)';
</script>

<button type="button" class="toggle-wrapper" onclick={() => (checked = !checked)}>
	<Icon {name} {...props} {color} {size} style="filter: {checked ? glowFilter : 'none'};" />
	{#if label}
		<span class="label" style="filter: {checked ? glowFilter : 'none'};">{label}</span>
	{/if}
</button>

<style>
	:global([class*='lucide']) {
		transition: filter 0.2s ease;
	}
	.toggle-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
	}
	.toggle-wrapper:focus {
		outline: none;
	}
	.label {
		color: var(--primary-color);
		font-size: 0.875rem;
	}
</style>
