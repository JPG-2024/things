<script lang="ts">
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	interface Props {
		size?: number;
	}

	let { size = 18 }: Props = $props();
</script>

<ToggleIcon
	name="File"
	bind:checked={viewState.showOnlyImportedArticles}
	{size}
	tooltipProps={{ content: 'only imported articles' }}
/>
