<script lang="ts">
	import type { IaTask, Task, TaskComponentProps, TaskRerunPatch } from '@/types/taskRunner.types';
	import Spacer from '@/components/Spacer.component.svelte';
	import CompletionOptionsEditor from '@/components/inputs/CompletionOptionsEditor.svelte';
	import Checkbox from '@/components/inputs/Checkbox.component.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import {
		buildTask,
		createCategoryTask,
		createExtractionTask
	} from '@/runners/shared/taskFactories';
	import Input from '@/components/inputs/Input.component.svelte';
	import Textarea from '@/components/inputs/Textarea.component.svelte';
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
	const isNew = $derived(isIaTask && (_task as IaTask).userMessage === '');
	const targetRunId = $derived(_runId ?? workflowStore.focusedRunId);

	const tabs = [
		{ id: 'custom', label: 'custom' },
		{ id: 'extraction', label: 'extraction' },
		{ id: 'category', label: 'category' }
	];

	let activeTab = $state('custom');

	$effect(() => {
		if (isEditingExtraction) {
			activeTab = 'extraction';
		} else if (isEditingCategory) {
			activeTab = 'category';
		}
	});

	let editedTask = $state<IaTask>({
		...(_task as IaTask),
		name: (_task as IaTask).name ?? '',
		enableTTS: (_task as IaTask).enableTTS ?? false
	});
	let localRenderOrder = $state('');
	let originalCompletionOptions = $state('');
	let originalSystemMessage = $state('');
	let originalUserMessage = $state('');
	let originalRenderOrder = $state<number | undefined>(undefined);
	let originalName = $state('');
	let originalEnableTTS = $state(false);

	const derivedId = $derived(
		editedTask.name?.trim() ? editedTask.name.toLowerCase().replace(/\s+/g, '-') : (_task.id ?? '')
	);

	let extName = $state('');
	let extCount = $state('3');
	let extDescription = $state('keywords');
	let extComponent = $state('keywords');
	let extDependencies = $state('');
	let extRenderOrder = $state(String((_task.renderOrder ?? 0) + 0.01));
	let extOriginalName = $state('');
	let extOriginalCount = $state('');
	let extOriginalDescription = $state('');
	let extOriginalComponent = $state('');
	let extOriginalDependencies = $state('');
	let extOriginalRenderOrder = $state<number | undefined>(undefined);

	let catName = $state('');
	let catCategories = $state('');
	let catMaxItems = $state('1');
	let catDependencies = $state('');
	let catRenderOrder = $state('');
	let catOriginalName = $state('');
	let catOriginalCategories = $state('');
	let catOriginalMaxItems = $state('');
	let catOriginalDependencies = $state('');
	let catOriginalRenderOrder = $state<number | undefined>(undefined);

	$effect(() => {
		if (isEditableIa) {
			const iaTask = _task as IaTask;
			editedTask = {
				...iaTask,
				completionOptions: { ...iaTask.completionOptions },
				name: iaTask.name ?? '',
				enableTTS: iaTask.enableTTS ?? false
			} as IaTask;
			localRenderOrder = iaTask.renderOrder != null ? String(iaTask.renderOrder) : '';
			originalCompletionOptions = JSON.stringify(iaTask.completionOptions);
			originalSystemMessage = iaTask.systemMessage ?? '';
			originalUserMessage = iaTask.userMessage ?? '';
			originalRenderOrder = iaTask.renderOrder;
			originalName = iaTask.name ?? '';
			originalEnableTTS = iaTask.enableTTS ?? false;
		}
	});

	$effect(() => {
		if (isEditingCategory) {
			const ia = _task as IaTask;
			const ec = ia.extractorConfig;
			catName = ia.name ?? '';
			catCategories = (ia.categoryNames ?? []).join(', ');
			catMaxItems = String(ec?.count ?? 1);
			catDependencies = (ia.dependencies ?? []).join(', ');
			catRenderOrder = ia.renderOrder != null ? String(ia.renderOrder) : '';
			catOriginalName = ia.name ?? '';
			catOriginalCategories = (ia.categoryNames ?? []).join(', ');
			catOriginalMaxItems = String(ec?.count ?? 1);
			catOriginalDependencies = (ia.dependencies ?? []).join(', ');
			catOriginalRenderOrder = ia.renderOrder;
		}
	});

	$effect(() => {
		if (isEditingExtraction) {
			const ia = _task as IaTask;
			const ec = ia.extractorConfig!;
			extName = ia.name ?? '';
			extCount = String(ec.count);
			extDescription = ec.description;
			extComponent = ia.component ?? 'keywords';
			extDependencies = (ia.dependencies ?? []).join(', ');
			extRenderOrder = ia.renderOrder != null ? String(ia.renderOrder) : '';
			extOriginalName = ia.name ?? '';
			extOriginalCount = String(ec.count);
			extOriginalDescription = ec.description;
			extOriginalComponent = ia.component ?? 'keywords';
			extOriginalDependencies = (ia.dependencies ?? []).join(', ');
			extOriginalRenderOrder = ia.renderOrder;
		}
	});

	async function handleSave() {
		if (!targetRunId || !isEditableIa) return;

		const patch: Record<string, unknown> = {};

		if (editedTask.name !== originalName) {
			patch.name = editedTask.name;
		}
		if (JSON.stringify(editedTask.completionOptions) !== originalCompletionOptions) {
			patch.completionOptions = editedTask.completionOptions;
		}
		if (editedTask.systemMessage !== originalSystemMessage) {
			patch.systemMessage = editedTask.systemMessage;
		}
		if (editedTask.userMessage !== originalUserMessage) {
			patch.userMessage = editedTask.userMessage;
		}
		const editedRenderOrder = localRenderOrder !== '' ? Number(localRenderOrder) : undefined;
		if (editedRenderOrder !== originalRenderOrder) {
			patch.renderOrder = editedRenderOrder;
		}
		if (editedTask.enableTTS !== originalEnableTTS) {
			patch.enableTTS = editedTask.enableTTS;
		}
		if (derivedId !== _task.id) {
			patch.id = derivedId;
		}

		if (Object.keys(patch).length === 0) return;
		void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
	}

	async function handleSaveExtraction() {
		if (!targetRunId || !isEditingExtraction) return;

		const patch: Record<string, unknown> = {};

		if (extName !== extOriginalName) {
			patch.name = extName;
		}

		const countChanged = extCount !== extOriginalCount;
		const descChanged = extDescription !== extOriginalDescription;
		if (countChanged || descChanged) {
			(patch as IaTask).extractorConfig = {
				count: Number(extCount) || 3,
				description: extDescription
			};
		}

		if (extComponent !== extOriginalComponent) {
			patch.component = extComponent;
		}

		const deps = extDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const originalDeps = extOriginalDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		if (JSON.stringify(deps) !== JSON.stringify(originalDeps)) {
			patch.dependencies = deps;
		}

		const editedRenderOrder = extRenderOrder !== '' ? Number(extRenderOrder) : undefined;
		if (editedRenderOrder !== extOriginalRenderOrder) {
			patch.renderOrder = editedRenderOrder;
		}

		if (Object.keys(patch).length === 0) return;
		void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
	}

	function handleCancel() {
		if (!targetRunId) return;
		if (isNew) {
			workflowManager.removeTask(targetRunId, _task.id);
		} else {
			workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
		}
	}

	function handleDelete() {
		if (!targetRunId) return;
		workflowManager.removeTask(targetRunId, _task.id);
	}

	function handleCreateExtraction() {
		if (!targetRunId) return;
		const deps = extDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const count = Number(extCount) || 3;
		const renderOrder =
			extRenderOrder !== '' ? Number(extRenderOrder) : (_task.renderOrder ?? 0) + 0.01;
		const def = createExtractionTask({
			name: extName || undefined,
			dependencies: deps.length > 0 ? deps : undefined,
			component: extComponent,
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

	function handleCreateCategory() {
		if (!targetRunId) return;
		const deps = catDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const maxItems = Number(catMaxItems) || 1;
		const categoryNames = catCategories
			.split(',')
			.map((c) => c.trim())
			.filter(Boolean);
		const renderOrder =
			catRenderOrder !== '' ? Number(catRenderOrder) : (_task.renderOrder ?? 0) + 0.01;
		const def = createCategoryTask({
			name: catName || undefined,
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

	async function handleSaveCategory() {
		if (!targetRunId || !isEditingCategory) return;

		const patch: Record<string, unknown> = {};

		if (catName !== catOriginalName) {
			patch.name = catName;
		}

		const deps = catDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const originalDeps = catOriginalDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		if (JSON.stringify(deps) !== JSON.stringify(originalDeps)) {
			patch.dependencies = deps;
		}

		const maxItems = Number(catMaxItems) || 1;
		const originalMaxItems = Number(catOriginalMaxItems) || 1;
		if (maxItems !== originalMaxItems) {
			(patch as IaTask).extractorConfig = {
				count: maxItems,
				description: maxItems === 1 ? 'category' : 'categories'
			};
		}

		const categoryNames = catCategories
			.split(',')
			.map((c) => c.trim())
			.filter(Boolean);
		const originalNames = catOriginalCategories
			.split(',')
			.map((c) => c.trim())
			.filter(Boolean);
		if (JSON.stringify(categoryNames) !== JSON.stringify(originalNames)) {
			patch.categoryNames = categoryNames.length > 0 ? categoryNames : undefined;
		}

		const editedRenderOrder = catRenderOrder !== '' ? Number(catRenderOrder) : undefined;
		if (editedRenderOrder !== catOriginalRenderOrder) {
			patch.renderOrder = editedRenderOrder;
		}

		if (Object.keys(patch).length === 0) return;
		void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
	}

	void _componentProps;
</script>

<div class="edit-task">
	<Tabs {tabs} bind:activeTab />

	{#if activeTab === 'custom'}
		<div class="tab-content">
			<Input bind:value={editedTask.name} label="Task name" />

			<div class="derived-id">
				<span class="derived-id-label">Task id:</span>
				<span class="derived-id-value">{derivedId}</span>
			</div>

			<Input bind:value={editedTask.systemMessage} label="System message" />

			<Input bind:value={editedTask.userMessage} label="User message" />

			<Checkbox
				id="edit-stream"
				label="Stream"
				checked={editedTask.completionOptions?.stream === true}
				onChange={(v) => (editedTask.completionOptions.stream = v)}
			/>

			<div class="task-toolbar">
				<ToggleIcon
					name="Speech"
					bind:checked={editedTask.enableTTS}
					size={20}
					tooltipProps={{ content: 'auto speech' }}
				/>
				<span class="tts-hint" class:muted={!viewState.autoSpeechEnabled}>
					{viewState.autoSpeechEnabled ? 'auto speech enabled' : 'auto speech disabled globally'}
				</span>
			</div>

			<Input id="render-order" bind:value={localRenderOrder} label="Render order" />

			<Spacer title="Completion Options" defaultOpen={false}>
				<div class="form-grid">
					<CompletionOptionsEditor
						completionOptions={editedTask.completionOptions}
						showStream={false}
					/>
				</div>
			</Spacer>

			<div class="actions">
				<Button onClick={handleDelete}>Delete</Button>
				<Button onClick={handleCancel}>Cancel</Button>
				<Button onClick={handleSave}>{isNew ? 'Create' : 'Save'}</Button>
			</div>
		</div>
	{:else if activeTab === 'extraction'}
		<div class="tab-content">
			<Input bind:value={extName} label="Task name" />
			<Input bind:value={extCount} label="Count" />
			<Input bind:value={extDescription} label="Description" />
			<Input bind:value={extComponent} label="Component" />
			<Input bind:value={extDependencies} label="Dependencies (comma-separated)" />
			<Input bind:value={extRenderOrder} label="Render order" />
			<div class="actions">
				<Button onClick={handleCancel}>Cancel</Button>
				{#if isEditingExtraction}
					<Button onClick={handleSaveExtraction}>Save</Button>
				{:else}
					<Button onClick={handleCreateExtraction}>Create Extraction Task</Button>
				{/if}
			</div>
		</div>
	{:else if activeTab === 'category'}
		<div class="tab-content">
			<Input bind:value={catName} label="Task name" />
			<Input
				bind:value={catCategories}
				label="Categories (comma-separated, leave empty for default)"
			/>
			<Input bind:value={catMaxItems} label="Max items" />
			<Input bind:value={catDependencies} label="Dependencies (comma-separated)" />
			<Input bind:value={catRenderOrder} label="Render order" />
			<div class="actions">
				<Button onClick={handleCancel}>Cancel</Button>
				{#if isEditingCategory}
					<Button onClick={handleSaveCategory}>Save</Button>
				{:else}
					<Button onClick={handleCreateCategory}>Create Category Task</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.edit-task {
		width: 100%;
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgba(255, 255, 0, 0.169);
		padding: 1rem;
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

	.task-toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.25rem 0;
	}

	.tts-hint {
		font-size: 0.8rem;
		color: var(--primary-color);
		opacity: 0.8;
	}

	.tts-hint.muted {
		opacity: 0.4;
	}

	.derived-id {
		font-size: 0.8rem;
		color: var(--text-color-secondary, #888);
		opacity: 0.7;
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		margin-top: -0.5rem;
	}

	.derived-id-label {
		font-weight: 500;
	}

	.derived-id-value {
		font-family: monospace;
	}
</style>
