<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import Modal from '@/components/Modal.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';

	type Props = {
		runId?: string;
		task: Task;
		children?: Snippet;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, children, componentProps = {} }: Props = $props();

	let showModal = $state(false);

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);
	const errorMessage = $derived(task.error);
	const debugInfo = $derived(task.debug);

	void componentProps;

	function handleRerun() {
		if (!targetRunId) {
			console.error('TaskError: no active workflow run for rerun.');
			return;
		}

		void workflowManager.rerunTask(targetRunId, task.id).catch((error) => {
			console.error('Task rerun failed', error);
		});
	}
</script>

<div class="task-shell task-shell--error">
	<div class="task-header">
		<span class="title">{task.name}</span>
	</div>

	<div class="task-content task-content--error">
		{#if children}
			{@render children()}
		{:else}
			<p class="error-message">{errorMessage}</p>
			{#if debugInfo}
				<details class="debug-block">
					<summary>Debug</summary>
					<pre>{debugInfo}</pre>
				</details>
			{/if}
		{/if}
	</div>

	<div class="task-footer">
		<div class="toolbar">
			<button
				type="button"
				class="task-action task-action--error"
				onclick={handleRerun}
				title="Rerun from this task (cascades to dependencies)"
				aria-label="Rerun task"
			>
				<Icon name="RefreshCw" size={18} />
				<span class="action-label">Rerun</span>
			</button>
		</div>
	</div>
</div>

<Modal show={showModal} onClose={() => (showModal = false)}>
	<h2>Task Details</h2>
	<pre class="wrapped-output">{JSON.stringify(task, null, 2)}</pre>
</Modal>

<style>
	.task-shell {
		position: relative;
		display: grid;
		gap: 0.9rem;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}

	.task-shell--error {
		padding: 0.75rem 0.9rem;
		border: 1px solid rgba(255, 143, 143, 0.25);
		border-radius: var(--radius-lg);
		background: rgba(255, 143, 143, 0.05);
	}

	.task-header {
		width: 100%;
		display: flex;
		justify-content: flex-start;
		align-items: center;
		border-bottom: 1px solid rgba(255, 143, 143, 0.15);

		.title {
			font-size: 1.1rem;
			margin-right: auto;
			color: #ff8f8f;
		}
	}

	.task-content {
		min-width: 0;
		width: 100%;
		font-size: 1.2rem;
	}

	.task-content--error {
		font-size: 0.95rem;
		display: grid;
		gap: 0.5rem;
	}

	.error-message {
		margin: 0;
		color: #ff8f8f;
		line-height: 1.45;
		word-break: break-word;
	}

	.debug-block {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.03);
		padding: 0.5rem 0.75rem;

		summary {
			cursor: pointer;
			font-size: 0.85rem;
			opacity: 0.8;
		}

		pre {
			margin: 0.5rem 0 0;
			max-height: 16rem;
			overflow: auto;
			font-size: 0.85rem;
			white-space: pre-wrap;
			word-break: break-word;
		}
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		justify-content: flex-end;
	}

	.task-footer {
		width: 100%;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding: 0.2em 0;
	}

	.task-action {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgba(255, 143, 143, 0.4);
		border-radius: 999px;
		background: rgba(255, 143, 143, 0.08);
		padding: 0.45rem 0.9rem;
		color: #ff8f8f;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			transform 0.2s ease;
	}

	.task-action:hover {
		border-color: rgba(255, 143, 143, 0.7);
		background: rgba(255, 143, 143, 0.16);
		transform: translateY(-1px);
	}

	.action-label {
		font-size: 0.8rem;
	}

	.wrapped-output {
		text-wrap: auto;
		max-width: 100%;
		overflow-y: auto;
	}
</style>
