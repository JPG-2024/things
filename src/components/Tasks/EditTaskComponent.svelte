<script lang="ts">
	import type { IaTask, Task, TaskComponentProps, TaskRerunPatch } from '@/types/taskRunner.types';
	import Spacer from '@/components/Spacer.component.svelte';
	import CompletionOptionsEditor from '@/components/inputs/CompletionOptionsEditor.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import {
		buildTask,
		buildRecursiveTask,
		createCategoryTask,
		createExtractionTask
	} from '@/runners/shared/taskFactories';
	import type { RecursiveConfig } from '@/runners/shared/taskFactories';
	import Input from '@/components/inputs/Input.component.svelte';
	import Label from '@/components/inputs/Label.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';

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

	const isIaTask = $derived(_task.type === 'ia');
	const isEditableIa = $derived(isIaTask && !(_task as IaTask).extractorConfig);
	const isEditingExtraction = $derived(isIaTask && !!(_task as IaTask).extractorConfig);
	const isEditingCategory = $derived(isIaTask && (_task as IaTask).subtype === 'category');
	const isEditingRecursive = $derived(_task.subtype === 'recursive');
	const isNew = $derived(isIaTask && (_task as IaTask).userMessage === '');
	const targetRunId = $derived(_runId ?? workflowStore.focusedRunId);

	const tabs = [
		{ id: 'custom', label: 'custom' },
		{ id: 'extraction', label: 'extraction' },
		{ id: 'category', label: 'category' },
		{ id: 'recursive', label: 'recursive' }
	];

	let activeTab = $state('custom');

	$effect(() => {
		if (isEditingExtraction) {
			activeTab = 'extraction';
		} else if (isEditingCategory) {
			activeTab = 'category';
		} else if (isEditingRecursive) {
			activeTab = 'recursive';
		}
	});

	let commonName = $state('');
	let commonSystemMessage = $state('');
	let commonUserMessage = $state('');
	let commonRenderOrder = $state('');
	let commonDependencies = $state('');
	let commonStreamEnabled = $state(false);
	let commonEnableTTS = $state(false);
	let commonCompletionOptions = $state<Record<string, unknown>>({});

	let originalName = $state('');
	let originalSystemMessage = $state('');
	let originalUserMessage = $state('');
	let originalRenderOrder = $state<number | undefined>(undefined);
	let originalDependencies = $state('');
	let originalEnableTTS = $state(false);
	let originalCompletionOptions = $state('');

	let extCount = $state('3');
	let extDescription = $state('keywords');
	let extOriginalCount = $state('');
	let extOriginalDescription = $state('');

	let catCategories = $state('');
	let catMaxItems = $state('1');
	let catOriginalCategories = $state('');
	let catOriginalMaxItems = $state('');

	let recChunkCount = $state('4');
	let recUserMessage = $state('');
	let recFinalUserMessage = $state('');
	let recOriginalChunkCount = $state('');
	let recOriginalUserMessage = $state('');
	let recOriginalFinalUserMessage = $state('');

	const derivedId = $derived(
		commonName?.trim() ? commonName.toLowerCase().replace(/\s+/g, '-') : (_task.id ?? '')
	);

	$effect(() => {
		commonName = _task.name ?? '';
		commonRenderOrder = _task.renderOrder != null ? String(_task.renderOrder) : '';
		commonDependencies = (_task.dependencies ?? []).join(', ');
		commonEnableTTS = _task.enableTTS ?? false;

		originalName = _task.name ?? '';
		originalRenderOrder = _task.renderOrder;
		originalDependencies = (_task.dependencies ?? []).join(', ');
		originalEnableTTS = _task.enableTTS ?? false;

		if (isIaTask) {
			const iaTask = _task as IaTask;

			commonSystemMessage = iaTask.systemMessage ?? '';
			commonUserMessage = iaTask.userMessage ?? '';
			commonStreamEnabled = iaTask.completionOptions?.stream === true;
			commonCompletionOptions = { ...(iaTask.completionOptions ?? {}) };

			originalSystemMessage = iaTask.systemMessage ?? '';
			originalUserMessage = iaTask.userMessage ?? '';
			originalCompletionOptions = JSON.stringify(iaTask.completionOptions);

			if (isEditingExtraction) {
				const ec = iaTask.extractorConfig!;
				extCount = String(ec.count);
				extDescription = ec.description;
				extOriginalCount = String(ec.count);
				extOriginalDescription = ec.description;
			} else {
				extCount = '3';
				extDescription = 'keywords';
				extOriginalCount = '';
				extOriginalDescription = '';
			}

			if (isEditingCategory) {
				catCategories = (iaTask.categoryNames ?? []).join(', ');
				catMaxItems = String(iaTask.extractorConfig?.count ?? 1);
				catOriginalCategories = (iaTask.categoryNames ?? []).join(', ');
				catOriginalMaxItems = String(iaTask.extractorConfig?.count ?? 1);
			} else {
				catCategories = '';
				catMaxItems = '1';
				catOriginalCategories = '';
				catOriginalMaxItems = '';
			}
		}

		if (isEditingRecursive) {
			const cfg = (_task.componentProps as Record<string, unknown>)?.recursiveConfig as
				| RecursiveConfig
				| undefined;
			recChunkCount = cfg ? String(cfg.chunkCount) : '4';
			recUserMessage = cfg?.userMessage ?? 'Summarize this section concisely.';
			recFinalUserMessage =
				cfg?.finalUserMessage ?? 'Combine these section summaries into one coherent summary.';
			recOriginalChunkCount = recChunkCount;
			recOriginalUserMessage = recUserMessage;
			recOriginalFinalUserMessage = recFinalUserMessage;
		} else {
			recChunkCount = '4';
			recUserMessage = '';
			recFinalUserMessage = '';
			recOriginalChunkCount = '';
			recOriginalUserMessage = '';
			recOriginalFinalUserMessage = '';
		}
	});

	$effect(() => {
		commonCompletionOptions.stream = commonStreamEnabled;
	});

	void _componentProps;

	async function handleSave() {
		if (!targetRunId || !isEditableIa) return;

		const patch: Record<string, unknown> = {};

		if (commonName !== originalName) patch.name = commonName;
		if (JSON.stringify(commonCompletionOptions) !== originalCompletionOptions)
			patch.completionOptions = commonCompletionOptions;
		if (commonSystemMessage !== originalSystemMessage) patch.systemMessage = commonSystemMessage;
		if (commonUserMessage !== originalUserMessage) patch.userMessage = commonUserMessage;

		const editedRenderOrder = commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined;
		if (editedRenderOrder !== originalRenderOrder) patch.renderOrder = editedRenderOrder;
		if (commonEnableTTS !== originalEnableTTS) patch.enableTTS = commonEnableTTS;
		if (derivedId !== _task.id) patch.id = derivedId;

		if (Object.keys(patch).length === 0) return;
		void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
	}

	async function handleSaveExtraction() {
		if (!targetRunId) return;

		if (isEditingExtraction) {
			const patch: Record<string, unknown> = {};

			if (commonName !== originalName) patch.name = commonName;

			const countChanged = extCount !== extOriginalCount;
			const descChanged = extDescription !== extOriginalDescription;
			if (countChanged || descChanged) {
				(patch as IaTask).extractorConfig = {
					count: Number(extCount) || 3,
					description: extDescription
				};
			}

			const deps = commonDependencies
				.split(',')
				.map((d) => d.trim())
				.filter(Boolean);
			const origDeps = originalDependencies
				.split(',')
				.map((d) => d.trim())
				.filter(Boolean);
			if (JSON.stringify(deps) !== JSON.stringify(origDeps)) patch.dependencies = deps;

			const editedRenderOrder = commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined;
			if (editedRenderOrder !== originalRenderOrder) patch.renderOrder = editedRenderOrder;

			if (Object.keys(patch).length === 0) return;
			void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
		} else {
			const deps = commonDependencies
				.split(',')
				.map((d) => d.trim())
				.filter(Boolean);
			const count = Number(extCount) || 3;
			const renderOrder =
				commonRenderOrder !== '' ? Number(commonRenderOrder) : (_task.renderOrder ?? 0) + 0.01;
			const def = createExtractionTask({
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				model: viewState.aiModel,
				renderOrder,
				persist: true,
				extractor: { count, description: extDescription }
			});
			const taskId = `${_task.id} > ${Date.now()}`;
			const newTask = buildTask(def, taskId);
			workflowManager.addTask(targetRunId, newTask);
			void workflowManager.rerunTask(targetRunId, newTask.id);
			workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
		}
	}

	async function handleSaveCategory() {
		if (!targetRunId) return;

		if (isEditingCategory) {
			const patch: Record<string, unknown> = {};

			if (commonName !== originalName) patch.name = commonName;

			const deps = commonDependencies
				.split(',')
				.map((d) => d.trim())
				.filter(Boolean);
			const origDeps = originalDependencies
				.split(',')
				.map((d) => d.trim())
				.filter(Boolean);
			if (JSON.stringify(deps) !== JSON.stringify(origDeps)) patch.dependencies = deps;

			const maxItems = Number(catMaxItems) || 1;
			const origMaxItems = Number(catOriginalMaxItems) || 1;
			if (maxItems !== origMaxItems) {
				(patch as IaTask).extractorConfig = {
					count: maxItems,
					description: maxItems === 1 ? 'category' : 'categories'
				};
			}

			const categoryNames = catCategories
				.split(',')
				.map((c) => c.trim())
				.filter(Boolean);
			const origNames = catOriginalCategories
				.split(',')
				.map((c) => c.trim())
				.filter(Boolean);
			if (JSON.stringify(categoryNames) !== JSON.stringify(origNames)) {
				patch.categoryNames = categoryNames.length > 0 ? categoryNames : undefined;
			}

			const editedRenderOrder = commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined;
			if (editedRenderOrder !== originalRenderOrder) patch.renderOrder = editedRenderOrder;

			if (Object.keys(patch).length === 0) return;
			void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
		} else {
			const deps = commonDependencies
				.split(',')
				.map((d) => d.trim())
				.filter(Boolean);
			const maxItems = Number(catMaxItems) || 1;
			const categoryNames = catCategories
				.split(',')
				.map((c) => c.trim())
				.filter(Boolean);
			const renderOrder =
				commonRenderOrder !== '' ? Number(commonRenderOrder) : (_task.renderOrder ?? 0) + 0.01;
			const def = createCategoryTask({
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				model: viewState.aiModel,
				renderOrder,
				persist: true,
				categoryNames: categoryNames.length > 0 ? categoryNames : undefined,
				maxItems
			});
			const taskId = `${_task.id} > ${Date.now()}`;
			const newTask = buildTask(def, taskId);
			workflowManager.addTask(targetRunId, newTask);
			void workflowManager.rerunTask(targetRunId, newTask.id);
			workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
		}
	}

	async function handleSaveRecursive() {
		if (!targetRunId) return;

		const deps = commonDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const renderOrder =
			commonRenderOrder !== '' ? Number(commonRenderOrder) : (_task.renderOrder ?? 0) + 0.01;

		const newTask = buildRecursiveTask(
			isEditingRecursive ? _task.id : `${_task.id} > ${Date.now()}`,
			{
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				chunkCount: Number(recChunkCount) || 4,
				userMessage: recUserMessage,
				finalUserMessage: recFinalUserMessage,
				model: viewState.aiModel,
				renderOrder,
				persist: true
			}
		);
		workflowManager.addTask(targetRunId, newTask);
		void workflowManager.rerunTask(targetRunId, newTask.id);

		if (!isEditingRecursive) {
			workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
		}
	}

	function handleCancel() {
		if (!targetRunId) return;
		if (isNew) {
			workflowManager.removeTask(targetRunId, _task.id);
		} else {
			workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
		}
	}
</script>

<div class="edit-task">
	<div class="row">
		<Label text="Options">
			<ToggleIcon
				name="TextCursor"
				bind:checked={commonStreamEnabled}
				size={20}
				tooltipProps={{ content: 'Stream' }}
			/>
			<ToggleIcon
				name="Speech"
				bind:checked={commonEnableTTS}
				size={20}
				tooltipProps={{ content: 'auto speech' }}
			/>
		</Label>
		<Input bind:value={commonName} label="Task name" />
		<Input id="render-order" bind:value={commonRenderOrder} label="Render order" />
	</div>

	<Input bind:value={commonSystemMessage} label="System message" />
	<Input bind:value={commonUserMessage} label="User message" />
	<Input bind:value={commonDependencies} label="Dependencies (comma-separated)" />

	<Spacer title="Completion Options" defaultOpen={false}>
		<div class="form-grid">
			<CompletionOptionsEditor completionOptions={commonCompletionOptions} showStream={false} />
		</div>
	</Spacer>

	<Tabs {tabs} bind:activeTab />

	{#if activeTab === 'custom'}
		<div class="tab-content">
			<div class="actions">
				<Button onClick={handleCancel}>Cancel</Button>
				<Button icon="Save" onClick={handleSave}>Save</Button>
			</div>
		</div>
	{:else if activeTab === 'extraction'}
		<div class="tab-content">
			<Input bind:value={extCount} label="Count" />
			<Input bind:value={extDescription} label="Description" />
			<div class="actions">
				<Button onClick={handleCancel}>Cancel</Button>
				<Button onClick={handleSaveExtraction}>Save</Button>
			</div>
		</div>
	{:else if activeTab === 'category'}
		<div class="tab-content">
			<Input
				bind:value={catCategories}
				label="Categories (comma-separated, leave empty for default)"
			/>
			<Input bind:value={catMaxItems} label="Max items" />
			<div class="actions">
				<Button onClick={handleCancel}>Cancel</Button>
				<Button onClick={handleSaveCategory}>Save</Button>
			</div>
		</div>
	{:else if activeTab === 'recursive'}
		<div class="tab-content">
			<Input bind:value={recChunkCount} label="Chunk count" />
			<Input bind:value={recUserMessage} label="Per-chunk prompt" />
			<Input bind:value={recFinalUserMessage} label="Final prompt" />
			<div class="actions">
				<Button onClick={handleCancel}>Cancel</Button>
				<Button onClick={handleSaveRecursive}>Save</Button>
			</div>
		</div>
	{/if}
</div>

<style>
	.edit-task {
		width: 100%;
		display: grid;
		gap: 0.75rem;
		border-radius: 15px;
	}

	.tab-content {
		display: grid;
		gap: 0.75rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.25rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.grow {
		flex: 1;
		min-width: 100px;
	}
</style>
