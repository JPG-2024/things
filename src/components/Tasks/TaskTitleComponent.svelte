<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import LuminousText from '@/components/LuminousText.svelte';

	interface Props {
		task?: Task;
		componentProps?: TaskComponentProps;
	}

	let { task = undefined, componentProps = {} }: Props = $props();
	void componentProps;

	const title = $derived((task?.data as string) ?? '');
</script>

{#if title}
	<div class="task-title-container">
		<LuminousText mode="on" size="1.2rem">
			{title}
		</LuminousText>
	</div>
{/if}

<style>
	.task-title-container {
		padding: 1rem 0;
	}
</style>
