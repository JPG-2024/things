<script lang="ts">
	import Keywords from '@/components/Keywords.svelte';

	interface Props {
		topics: string[];
		wrapped?: boolean;
	}

	let { topics, wrapped = false }: Props = $props();
</script>

{#if topics.length > 0}
	{#if wrapped}
		<div class="article-item__keywords">
			<Keywords keywords={topics} />
		</div>
	{:else}
		<Keywords keywords={topics} />
	{/if}
{/if}
