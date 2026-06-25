<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Modal from '@/components/Modal.svelte';
	import Pill from '@/components/Pill.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { Task } from '@/types/taskRunner.types';

	type Props = {
		runId?: string;
		task: Task;
	};

	let { runId = undefined, task }: Props = $props();

	let showModal = $state(false);

	void runId;

	type PillStatus = 'loading' | 'error' | 'idle' | 'done';

	const getPillStatus = (status?: Task['status']): PillStatus => {
		if (status === 'running') return 'loading';
		if (status === 'failed' || status === 'blocked') return 'error';
		if (status === 'done') return 'done';
		return 'idle';
	};

	const shouldShowTask = $derived(
		getPillStatus(task.status) === 'loading' ||
			getPillStatus(task.status) === 'error' ||
			viewState.showAllTasks
	);
</script>

{#if shouldShowTask}
	<button
		class="loading-container"
		/* 		in:fly={{ x: -30, duration: 800 }}
		out:fly={{ x: 30, duration: 400 }} */
		onclick={() => (showModal = true)}
	>
		<Pill status={getPillStatus(task.status)} text={task.id} />
	</button>
{/if}

<Modal show={showModal} onClose={() => (showModal = false)}>
	<h2>Task Details</h2>
	<pre class="wrapped-output">{JSON.stringify(task, null, 2)}</pre>
</Modal>

<style>
	.loading-container {
		width: max-content;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0;
	}

	.wrapped-output {
		text-wrap: auto;
		max-width: 100%;
		overflow-y: auto;
	}
</style>
