<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';

	type Props = {
		task: Task;
		runId?: string;
		componentProps?: TaskComponentProps;
	};

	let {
		task: _task,
		runId: _runId = undefined,
		componentProps: _componentProps = {}
	}: Props = $props();
</script>

<div class="edit-task-skeleton"></div>

<style>
	.edit-task-skeleton {
		width: 100%;
		min-height: 80px;
		border: 1px dashed rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
	}
</style>
