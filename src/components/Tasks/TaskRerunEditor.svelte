<script lang="ts">
import Modal from "@/components/Modal.svelte";
import { workflowManager } from "@/runners/workflowManager.svelte";
import type { IaTask, Task, TaskRerunPatch } from "@/types/taskRunner.types";
import Icon from "../Icon.svelte";

type Props = {
	runId?: string;
	task: Task;
};

let { runId = undefined, task }: Props = $props();

let showModal = $state(false);
let errorMessage = $state("");
let name = $state("");
let component = $state("");
let persist = $state(false);
let userMessage = $state("");
let systemMessage = $state("");
let completionOptionsJson = $state("{}");

const targetRunId = $derived(runId ?? workflowManager.activeRunId);
const isIaTask = $derived(task.type === "ia");

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return "Unknown error";
	}
}

function getIaTask(currentTask: Task): IaTask | undefined {
	return currentTask.type === "ia" ? currentTask : undefined;
}

function syncFormFromTask() {
	const iaTask = getIaTask(task);

	name = task.name;
	component = task.component ?? "";
	persist = task.persist ?? false;
	userMessage = iaTask?.userMessage ?? "";
	systemMessage = iaTask?.systemMessage ?? "";
	completionOptionsJson = JSON.stringify(
		iaTask?.completionOptions ?? {},
		null,
		2
	);
	errorMessage = "";
}

function openEditor() {
	syncFormFromTask();
	showModal = true;
}

function buildPatch(): TaskRerunPatch {
	const iaTask = getIaTask(task);
	const patch: Record<string, unknown> = {};
	const normalizedComponent = component.trim();

	if (name !== task.name) {
		patch.name = name;
	}

	if (normalizedComponent !== (task.component ?? "")) {
		patch.component = normalizedComponent || undefined;
	}

	if (persist !== (task.persist ?? false)) {
		patch.persist = persist;
	}

	if (!iaTask) {
		return patch as TaskRerunPatch;
	}

	if (userMessage !== iaTask.userMessage) {
		patch.userMessage = userMessage;
	}

	if (systemMessage !== iaTask.systemMessage) {
		patch.systemMessage = systemMessage;
	}

	const parsedCompletionOptions = JSON.parse(completionOptionsJson) as Record<
		string,
		unknown
	>;
	if (
		JSON.stringify(parsedCompletionOptions) !==
		JSON.stringify(iaTask.completionOptions)
	) {
		patch.completionOptions = parsedCompletionOptions;
	}

	return patch as TaskRerunPatch;
}

function hasPatchChanges(patch: TaskRerunPatch): boolean {
	return Object.keys(patch).length > 0;
}

async function closeEditor() {
	let patch: TaskRerunPatch;

	try {
		patch = buildPatch();
	} catch (error) {
		errorMessage = toErrorMessage(error);
		return;
	}

	if (!hasPatchChanges(patch)) {
		errorMessage = "";
		showModal = false;
		return;
	}

	if (!targetRunId) {
		errorMessage = "No active workflow found for this task.";
		return;
	}

	errorMessage = "";
	showModal = false;
	void workflowManager.rerunTask(targetRunId, task.id, patch).catch((error) => {
		console.error("Task rerun failed", error);
	});
}

void workflowManager;
void targetRunId;
void isIaTask;
</script>

<Icon name="Settings2" onClick={openEditor} size={14} color="var(--primary-color)" title="Edit and rerun task" class="task-action" />

<Modal show={showModal} onClose={closeEditor}>
	<div class="editor-shell">
		<div class="editor-header">
			<div>
				<p class="eyebrow">Task editor</p>
				<h2>{task.id}</h2>
			</div>
			<p class="task-meta">
				<span>{task.type}</span>
				<span>{task.status ?? "pending"}</span>
			</p>
		</div>

		<div class="form-grid">
			<label>
				<span>Name</span>
				<input bind:value={name} type="text" />
			</label>

			<label>
				<span>Component</span>
				<input bind:value={component} type="text" placeholder="base, keywords, listItems..." />
			</label>

			<label class="checkbox-row">
				<input bind:checked={persist} type="checkbox" />
				<span>Persist task result</span>
			</label>

			{#if isIaTask}
				<label>
					<span>User message</span>
					<textarea bind:value={userMessage} rows="5"></textarea>
				</label>

				<label>
					<span>System message</span>
					<textarea bind:value={systemMessage} rows="7"></textarea>
				</label>

				<label>
					<span>Completion options JSON</span>
					<textarea bind:value={completionOptionsJson} rows="14" spellcheck="false"></textarea>
				</label>
			{:else}
				<p class="hint">
					This script task has no editable prompt fields. You can still rerun it with the current runtime state.
				</p>
			{/if}
		</div>

		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}

		<div class="actions">
			<p>Close the modal to apply changes and rerun in background.</p>
		</div>

		<div class="details-block">
			<h3>Current task state</h3>
			<pre>{JSON.stringify(task, null, 2)}</pre>
		</div>
	</div>
</Modal>

<style>
	.task-action {
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		padding: 0.45rem 0.9rem;
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			transform 0.2s ease;
	}

	.task-action:hover {
		border-color: rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-1px);
	}

	.editor-shell {
		display: grid;
		gap: 1.25rem;
		margin: 0 auto;
		max-width: 880px;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
	}

	.eyebrow {
		margin: 0 0 0.25rem;
		opacity: 0.7;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	.task-meta {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.task-meta span {
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		padding: 0.25rem 0.65rem;
		font-size: 0.78rem;
		text-transform: capitalize;
	}

	.form-grid {
		display: grid;
		gap: 1rem;
	}

	label {
		display: grid;
		gap: 0.45rem;
	}

	label span,
	.hint {
		opacity: 0.82;
		font-size: 0.9rem;
	}

	input,
	textarea {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.04);
		padding: 0.85rem 1rem;
		width: 100%;
		color: inherit;
		font: inherit;
		box-sizing: border-box;
	}

	textarea {
		resize: vertical;
		min-height: 8rem;
		font-family: "CaskaydiaCove NFM Light", monospace;
		line-height: 1.45;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.checkbox-row input {
		width: auto;
	}

	.actions {
		padding: 0.9rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.03);
	}

	.actions p {
		opacity: 0.82;
		font-size: 0.92rem;
	}

	.error {
		color: #ff8f8f;
	}

	.details-block {
		display: grid;
		gap: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		padding-top: 1rem;
	}

	pre {
		margin: 0;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.04);
		padding: 1rem;
		max-height: 22rem;
		overflow: auto;
		font-family: "CaskaydiaCove NFM Light", monospace;
	}

	@media (max-width: 720px) {
		.editor-header {
			flex-direction: column;
		}

		.actions {
			justify-content: stretch;
		}

		.actions button {
			flex: 1;
		}
	}
</style>
