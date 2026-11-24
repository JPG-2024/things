<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Tooltip in the resting state, e.g. "delete article". */
		label?: string;
		disabled?: boolean;
		size?: number;
		/** Called only after the second click. */
		onConfirm: () => void | Promise<void>;
	}

	let { label = 'delete', disabled = false, size, onConfirm }: Props = $props();

	let confirming = $state(false);
	let confirmTimeout: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => clearTimeout(confirmTimeout));

	function handleClick() {
		if (disabled) return;
		if (!confirming) {
			confirming = true;
			clearTimeout(confirmTimeout);
			confirmTimeout = setTimeout(() => (confirming = false), 4000);
			return;
		}
		clearTimeout(confirmTimeout);
		confirming = false;
		void onConfirm();
	}
</script>

<Icon
	name="Trash"
	{size}
	color={confirming ? 'rgb(255, 140, 109)' : 'var(--gray-200)'}
	onClick={handleClick}
	{disabled}
	ariaLabel={confirming ? `Confirm ${label}` : label}
	tooltipProps={{ content: confirming ? 'Click again to confirm' : label }}
/>
