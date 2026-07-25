<script lang="ts">
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import Modal from '@/components/Modal.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Pill from '@/components/Pill.svelte';
	import { topologicalSortTasks } from '@/lib/utils/tasks/topologicalSortTasks';
	import type { Task, TaskStatus } from '@/types/taskRunner.types';

	const targetRunId = $derived(workflowStore.focusedRunId ?? workflowStore.stackedRunIds[0]);
	const tasks = $derived(targetRunId ? (workflowManager.getTasks(targetRunId) ?? []) : []);
	const orderedTasks = $derived(topologicalSortTasks(tasks));
	const isRunning = $derived(targetRunId ? workflowStore.isRunRunning(targetRunId) : false);
	const runSummary = $derived(targetRunId ? workflowStore.getRunSummary(targetRunId) : undefined);

	const statusCounts = $derived(() => {
		const counts = { done: 0, failed: 0, blocked: 0, running: 0, pending: 0 };
		for (const task of orderedTasks) {
			const s = task.status ?? 'pending';
			if (s in counts) counts[s as keyof typeof counts]++;
		}
		return counts;
	});

	const elapsed = $derived(() => {
		if (!runSummary) {
			if (!targetRunId) return null;
			const run = workflowStore.getRun(targetRunId);
			if (!run?.startedAt) return null;
			const end = run.endedAt ?? Date.now();
			return end - run.startedAt;
		}
		return runSummary.endedAt - runSummary.startedAt;
	});

	function statusToPillStatus(status?: TaskStatus): 'idle' | 'loading' | 'done' | 'error' {
		switch (status) {
			case 'running':
				return 'loading';
			case 'done':
				return 'done';
			case 'failed':
			case 'blocked':
				return 'error';
			default:
				return 'idle';
		}
	}

	function formatDuration(ms: number | null | undefined): string {
		if (ms == null) return '—';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function formatTimestamp(ts: number | undefined): string {
		if (!ts) return '—';
		return new Date(ts).toLocaleTimeString();
	}

	function dataPreview(data: unknown): string {
		if (data == null) return '';
		if (typeof data === 'string') return data.length > 120 ? data.slice(0, 120) + '…' : data;
		if (Array.isArray(data)) return `Array(${data.length})`;
		if (typeof data === 'object') return 'Object';
		return String(data);
	}

	function dataTypeLabel(data: unknown): string {
		if (data == null) return 'none';
		if (Array.isArray(data)) return `array[${data.length}]`;
		return typeof data;
	}

	function formatData(data: unknown): string {
		if (data == null) return '';
		if (typeof data === 'string') return data;
		try {
			return JSON.stringify(data, null, 2);
		} catch {
			return String(data);
		}
	}

	function handleClose() {
		viewState.showAllTasks = false;
	}
</script>

<Modal show={viewState.showAllTasks} onClose={handleClose}>
	<div class="logger-shell">
		<header class="logger-header">
			<div>
				<p class="eyebrow">Workflow logger</p>
				<h2>{targetRunId ?? 'No active run'}</h2>
			</div>
			{#if isRunning}
				<Pill status="loading" text="running" />
			{/if}
		</header>

		{#if targetRunId}
			{@const counts = statusCounts()}
			{@const ms = elapsed()}
			<section class="run-summary">
				<div class="summary-pills">
					{#if counts.done > 0}
						<Pill status="done" text={`done: ${counts.done}`} tag />
					{/if}
					{#if counts.failed > 0}
						<Pill status="error" text={`failed: ${counts.failed}`} tag />
					{/if}
					{#if counts.blocked > 0}
						<Pill status="error" text={`blocked: ${counts.blocked}`} tag />
					{/if}
					{#if counts.running > 0}
						<Pill status="loading" text={`running: ${counts.running}`} tag />
					{/if}
					{#if counts.pending > 0}
						<Pill status="idle" text={`pending: ${counts.pending}`} tag />
					{/if}
				</div>
				<span class="elapsed">Elapsed: {formatDuration(ms)}</span>
			</section>

			<section class="task-list">
				{#if orderedTasks.length === 0}
					<p class="hint">No tasks in this workflow run.</p>
				{:else}
					{#each orderedTasks as task (task.id)}
						<Spacer
							title={task.id}
							defaultOpen={task.status === 'running' || task.status === 'failed'}
						>
							<div class="task-body">
								<div class="task-meta">
									<Pill
										status={statusToPillStatus(task.status)}
										text={task.status ?? 'pending'}
										tag
									/>
									<span class="meta-item">{task.type}</span>
									{#if task.name}
										<span class="meta-item">{task.name}</span>
									{/if}
									{#if task.component}
										<span class="meta-item">{task.component}</span>
									{/if}
								</div>

								<div class="dependencies-field">
									<span>Dependencies</span>
									{#if task.dependencies.length > 0}
										<div class="dependency-pills">
											{#each task.dependencies as dep (dep)}
												<Pill status="idle" text={dep} tag />
											{/each}
										</div>
									{:else}
										<p class="hint">None</p>
									{/if}
								</div>

								<div class="timing-row">
									{#if task.data != null}
										<span class="timing-label">Type</span>
										<span class="timing-value">{dataTypeLabel(task.data)}</span>
									{/if}
									<span class="timing-label">Started</span>
									<span class="timing-value">{formatTimestamp(task.startedAt)}</span>
									<span class="timing-label">Ended</span>
									<span class="timing-value">{formatTimestamp(task.endedAt)}</span>
									<span class="timing-label">Duration</span>
									<span class="timing-value">
										{formatDuration(
											task.startedAt && task.endedAt ? task.endedAt - task.startedAt : null
										)}
									</span>
								</div>

								{#if task.data != null}
									<details class="result-preview">
										<summary>
											Result
											<span class="preview-hint">{dataPreview(task.data)}</span>
										</summary>
										<pre class="result-data">{formatData(task.data)}</pre>
									</details>
								{/if}

								{#if task.status === 'failed'}
									<div class="error-block">
										<p class="error-message">{task.error ?? 'Unknown error'}</p>
										{#if task.debug}
											<details class="debug-block">
												<summary>Debug</summary>
												<pre>{task.debug}</pre>
											</details>
										{/if}
									</div>
								{/if}
							</div>
						</Spacer>
					{/each}
				{/if}
			</section>
		{:else}
			<p class="hint">No active workflow run.</p>
		{/if}

		{#if isRunning}
			<p class="hint">Workflow in progress...</p>
		{/if}
	</div>
</Modal>

<style>
	.logger-shell {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem;
		max-width: 900px;
		margin: 0 auto;
		color: white;
	}

	.logger-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0 0 0.25rem;
		opacity: 0.7;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	h2,
	p {
		margin: 0;
	}

	.run-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.75rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.03);
	}

	.summary-pills {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.elapsed {
		font-size: 0.85rem;
		opacity: 0.7;
		white-space: nowrap;
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.task-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem 0 1rem;
	}

	.task-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.meta-item {
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.dependencies-field {
		display: grid;
		gap: 0.35rem;
	}

	.dependencies-field > span {
		opacity: 0.82;
		font-size: 0.9rem;
	}

	.dependency-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.timing-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
		align-items: center;
		font-size: 0.82rem;
	}

	.timing-label {
		opacity: 0.55;
	}

	.timing-value {
		opacity: 0.85;
		font-variant-numeric: tabular-nums;
	}

	.result-preview {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.03);
		padding: 0.5rem 0.75rem;
	}

	.result-preview summary {
		cursor: pointer;
		font-size: 0.85rem;
		opacity: 0.8;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.preview-hint {
		opacity: 0.5;
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 400px;
	}

	.result-data {
		margin: 0.5rem 0 0;
		max-height: 20rem;
		overflow: auto;
		font-size: 0.85rem;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: 'CaskaydiaCove NFM Light', monospace;
		line-height: 1.45;
	}

	.error-block {
		display: grid;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid rgba(255, 143, 143, 0.25);
		border-radius: 10px;
		background: rgba(255, 143, 143, 0.05);
	}

	.error-message {
		margin: 0;
		color: #ff8f8f;
		font-size: 0.9rem;
		line-height: 1.45;
		word-break: break-word;
	}

	.debug-block {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
		padding: 0.4rem 0.6rem;
	}

	.debug-block summary {
		cursor: pointer;
		font-size: 0.82rem;
		opacity: 0.7;
	}

	.debug-block pre {
		margin: 0.4rem 0 0;
		max-height: 12rem;
		overflow: auto;
		font-size: 0.82rem;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: 'CaskaydiaCove NFM Light', monospace;
		line-height: 1.45;
	}

	.hint {
		opacity: 0.7;
		font-size: 0.9rem;
	}
</style>
