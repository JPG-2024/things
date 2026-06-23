<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		name,
		checked = $bindable(false),
		color = 'var(--primary-color)',
		size = 18,
		...props
	} = $props();

	const glowFilter =
		'drop-shadow(0 0 5px var(--primary-color)) drop-shadow(0 0 10px var(--primary-color)) drop-shadow(0 0 10px var(--primary-color)) drop-shadow(0 0 40px var(--primary-color)) drop-shadow(0 0 80px white)';
</script>

<Icon
	{name}
	{...props}
	{color}
	{size}
	onClick={() => (checked = !checked)}
	style="opacity: {checked ? 1 : 1}; filter: {checked ? glowFilter : 'none'};"
/>

<style>
	:global([class*='lucide']) {
		transition: filter 0.2s ease;
	}
</style>
