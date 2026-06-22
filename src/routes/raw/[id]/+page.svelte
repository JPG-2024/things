<script lang="ts">
	import PostView from '@/components/PostView.svelte';
	import TasksRender from '@/components/Tasks/TasksRender.svelte';

	import { page } from '$app/state';

	const rawId = page.params.id;
</script>

<PostView headerContent={null} {contentSnippet} />

{#snippet contentSnippet()}
	<TasksRender />
{/snippet}

<style>
	@media (prefers-col-scheme: dark) {
		:root {
			background-color: #2f2f2f;
			color: #f6f6f6;
		}
	}
</style>
