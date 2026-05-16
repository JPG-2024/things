<script lang="ts">
	import Icon from './Icon.svelte';

	let { name, checked = false, onToggle, ...props } = $props();
</script>

<Icon
	{name}
	{...props}
	onClick={onToggle}
	style="opacity: {checked ? 1 : 0.5}"
	color={checked ? 'green' : 'white'}
/>
