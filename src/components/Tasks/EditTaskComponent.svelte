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
		createExtractionTask,
		createIaTask
	} from '@/runners/shared/taskFactories';
	import type { RecursiveConfig } from '@/runners/shared/taskFactories';
	import { stringArrayGbnf, arrayToGbnf } from '@/lib/utils/gbnf';
	import Input from '@/components/inputs/Input.component.svelte';
	import Label from '@/components/inputs/Label.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';

	type Props = {
		task: Task;
		runId?: string;
		componentProps?: TaskComponentProps;
		onClose?: () => void;
		mode?: 'create' | 'edit';
	};

	let {
		task: _task,
		runId: _runId = undefined,
		componentProps: _componentProps = {},
		onClose = undefined,
		mode = 'edit'
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

	let commonId = $state('');
	let commonName = $state('');
	let commonComponent = $state('');
	let commonSystemMessage = $state('');
	let commonUserMessage = $state('');
	let commonRenderOrder = $state('');
	let commonDependencies = $state('');
	let commonStreamEnabled = $state(false);
	let commonEnableTTS = $state(false);
	let commonCompletionOptions = $state<Record<string, unknown>>({});

	let originalId = $state('');
	let originalName = $state('');
	let originalComponent = $state('');
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

	let recWindowSize = $state('2000');
	let recOverlap = $state('200');
	let recUserMessage = $state('');
	let recFinalUserMessage = $state('');
	let recOriginalWindowSize = $state('');
	let recOriginalOverlap = $state('');
	let recOriginalUserMessage = $state('');
	let recOriginalFinalUserMessage = $state('');

	$effect(() => {
		commonId = _task.id ?? '';
		originalId = _task.id ?? '';
		commonName = _task.name ?? '';
		commonComponent = _task.component ?? '';
		commonRenderOrder = _task.renderOrder != null ? String(_task.renderOrder) : '';
		commonDependencies = (_task.dependencies ?? []).join(', ');
		commonEnableTTS = _task.enableTTS ?? false;

		originalName = _task.name ?? '';
		originalComponent = _task.component ?? '';
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
			recWindowSize = cfg ? String(cfg.windowSize) : '1000';
			recOverlap = cfg ? String(cfg.overlap) : '100';
			recUserMessage = cfg?.userMessage ?? 'Summarize this section concisely.';
			recFinalUserMessage =
				cfg?.finalUserMessage ?? 'Combine these section summaries into one coherent summary.';
			recOriginalWindowSize = recWindowSize;
			recOriginalOverlap = recOverlap;
			recOriginalUserMessage = recUserMessage;
			recOriginalFinalUserMessage = recFinalUserMessage;
		} else {
			recWindowSize = '1000';
			recOverlap = '100';
			recUserMessage = 'Summarize this section concisely.';
			recFinalUserMessage = 'Combine these section summaries into one coherent summary.';
			recOriginalWindowSize = '';
			recOriginalOverlap = '';
			recOriginalUserMessage = '';
			recOriginalFinalUserMessage = '';
		}
	});

	$effect(() => {
		commonCompletionOptions.stream = commonStreamEnabled;
	});

	void _componentProps;

	async function handleSave() {
		if (!targetRunId) return;

		const deps = commonDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);

		if (mode === 'create') {
			const def = createIaTask({
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				component: commonComponent.trim() || undefined,
				systemMessage: commonSystemMessage || undefined,
				userMessage: commonUserMessage || undefined,
				completionOptions: commonCompletionOptions,
				model: viewState.aiModel,
				renderOrder: commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined,
				persist: true,
				enableTTS: commonEnableTTS || undefined
			});
			const taskId = commonId.trim() || `${_task.id} > ${Date.now()}`;
			const newTask = buildTask(def, taskId);
			workflowManager.addTask(targetRunId, newTask);
			void workflowManager.rerunTask(targetRunId, newTask.id);
			onClose?.();
			return;
		}

		if (!isEditableIa) return;

		const patch: Record<string, unknown> = {};

		if (commonName !== originalName) patch.name = commonName;
		const trimmedComponent = commonComponent.trim();
		const origComponent = originalComponent.trim();
		if (trimmedComponent !== origComponent) patch.component = trimmedComponent || undefined;
		if (JSON.stringify(commonCompletionOptions) !== originalCompletionOptions)
			patch.completionOptions = commonCompletionOptions;
		if (commonSystemMessage !== originalSystemMessage) patch.systemMessage = commonSystemMessage;
		if (commonUserMessage !== originalUserMessage) patch.userMessage = commonUserMessage;

		const editedRenderOrder = commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined;
		if (editedRenderOrder !== originalRenderOrder) patch.renderOrder = editedRenderOrder;
		if (commonEnableTTS !== originalEnableTTS) patch.enableTTS = commonEnableTTS;
		if (commonId.trim() !== '' && commonId !== originalId) patch.id = commonId.trim();

		const origDeps = originalDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		if (JSON.stringify(deps) !== JSON.stringify(origDeps)) patch.dependencies = deps;

		if (Object.keys(patch).length === 0) {
			onClose?.();
			return;
		}
		void workflowManager.rerunTask(targetRunId, _task.id, patch as TaskRerunPatch);
		onClose?.();
	}

	async function handleSaveExtraction() {
		if (!targetRunId) return;

		if (isEditingExtraction) {
			const patch: Record<string, unknown> = {};

			if (commonName !== originalName) patch.name = commonName;
			if (commonId.trim() !== '' && commonId !== originalId) patch.id = commonId.trim();
			const trimmedComponent = commonComponent.trim();
			const origComponent = originalComponent.trim();
			if (trimmedComponent !== origComponent) patch.component = trimmedComponent || undefined;

			const countChanged = extCount !== extOriginalCount;
			const descChanged = extDescription !== extOriginalDescription;
			if (countChanged || descChanged) {
				const newCount = Number(extCount) || 3;
				(patch as IaTask).extractorConfig = {
					count: newCount,
					description: extDescription
				};
				patch.systemMessage = `You are a data extraction assistant. Return only a JSON array of exactly ${newCount} ${extDescription}. No markdown, no explanations.`;
				patch.userMessage = `Extract ${newCount} ${extDescription}. Respond in JSON format.`;
				patch.completionOptions = {
					...(commonCompletionOptions as Record<string, unknown>),
					grammar: stringArrayGbnf(newCount)
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

			if (Object.keys(patch).length === 0) {
				onClose?.();
				return;
			}
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
			if (mode === 'edit') {
				workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
			}
		}
		onClose?.();
	}

	async function handleSaveCategory() {
		if (!targetRunId) return;

		if (isEditingCategory) {
			const patch: Record<string, unknown> = {};

			if (commonName !== originalName) patch.name = commonName;
			if (commonId.trim() !== '' && commonId !== originalId) patch.id = commonId.trim();
			const trimmedComponent = commonComponent.trim();
			const origComponent = originalComponent.trim();
			if (trimmedComponent !== origComponent) patch.component = trimmedComponent || undefined;

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
			const maxChanged = maxItems !== origMaxItems;

			const categoryNames = catCategories
				.split(',')
				.map((c) => c.trim())
				.filter(Boolean);
			const origNames = catOriginalCategories
				.split(',')
				.map((c) => c.trim())
				.filter(Boolean);
			const namesChanged = JSON.stringify(categoryNames) !== JSON.stringify(origNames);

			if (maxChanged || namesChanged) {
				const effectiveNames =
					categoryNames.length > 0 ? categoryNames : viewState.categories.map((c) => c.name);
				const catDesc = maxItems === 1 ? 'category' : 'categories';
				const countBasedSysMsg =
					maxItems === 1 ? 'a single category name' : `${maxItems} category names`;
				const countBasedUserMsg = maxItems === 1 ? 'a category' : `${maxItems} categories`;

				(patch as IaTask).extractorConfig = {
					count: maxItems,
					description: catDesc
				};
				patch.categoryNames = categoryNames.length > 0 ? categoryNames : undefined;
				patch.systemMessage = `You are a data extraction assistant. Return only a JSON array with exactly ${countBasedSysMsg}. No markdown, no explanations.`;
				patch.userMessage = `Give ${countBasedUserMsg} from this ones: ${effectiveNames.join(', ')}.`;
				patch.completionOptions = {
					...(commonCompletionOptions as Record<string, unknown>),
					grammar: arrayToGbnf(effectiveNames, { minItems: maxItems, maxItems })
				};
			}

			const editedRenderOrder = commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined;
			if (editedRenderOrder !== originalRenderOrder) patch.renderOrder = editedRenderOrder;

			if (Object.keys(patch).length === 0) {
				onClose?.();
				return;
			}
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
			if (mode === 'edit') {
				workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
			}
		}
		onClose?.();
	}

	async function handleSaveRecursive() {
		if (!targetRunId) return;

		const deps = commonDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const renderOrder =
			commonRenderOrder !== '' ? Number(commonRenderOrder) : (_task.renderOrder ?? 0) + 0.01;

		if (isEditingRecursive) {
			const effectiveId = commonId.trim() || _task.id;

			if (effectiveId !== _task.id) {
				workflowManager.renameTaskId(targetRunId, _task.id, effectiveId);
			}

			const newTask = buildRecursiveTask(effectiveId, {
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				component: commonComponent.trim() || undefined,
				windowSize: Number(recWindowSize) || 1000,
				overlap: Number(recOverlap) || 100,
				userMessage: recUserMessage,
				finalUserMessage: recFinalUserMessage,
				model: viewState.aiModel,
				renderOrder:
					commonRenderOrder !== '' ? Number(commonRenderOrder) : (_task.renderOrder ?? 0),
				persist: true
			});
			workflowManager.addTask(targetRunId, newTask);
			void workflowManager.rerunTask(targetRunId, effectiveId);
		} else {
			const newTask = buildRecursiveTask(`${_task.id} > ${Date.now()}`, {
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				windowSize: Number(recWindowSize) || 1000,
				overlap: Number(recOverlap) || 100,
				userMessage: recUserMessage,
				finalUserMessage: recFinalUserMessage,
				model: viewState.aiModel,
				renderOrder,
				persist: true
			});
			workflowManager.addTask(targetRunId, newTask);
			void workflowManager.rerunTask(targetRunId, newTask.id);
			if (mode === 'edit') {
				workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
			}
		}
		onClose?.();
	}

	function handleCancel() {
		if (mode === 'create') {
			onClose?.();
			return;
		}
		if (!targetRunId) return;
		if (isNew) {
			workflowManager.removeTask(targetRunId, _task.id);
		} else {
			workflowManager.addTask(targetRunId, { ..._task, status: 'done' });
		}
		onClose?.();
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
		<Input bind:value={commonComponent} label="Component" />
		<Input bind:value={commonId} label="Task id" />
		<Input id="render-order" bind:value={commonRenderOrder} label="Render order" />
	</div>

	<Input bind:value={commonSystemMessage} label="System message" />
	<Input bind:value={commonUserMessage} label="User message" />
	<Input bind:value={commonDependencies} label="Dependencies (comma-separated)" />

	<div class="completion-options-container">
		<Spacer title="Completion Options" defaultOpen={false}>
			<div class="form-grid">
				<CompletionOptionsEditor completionOptions={commonCompletionOptions} showStream={false} />
			</div>
		</Spacer>
	</div>

	<div class="edit-tabs-container">
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
				<Input bind:value={recWindowSize} label="Window size (chars)" />
				<Input bind:value={recOverlap} label="Overlap (chars)" />
				<Input bind:value={recUserMessage} label="Per-chunk prompt" />
				<Input bind:value={recFinalUserMessage} label="Final prompt" />
				<div class="actions">
					<Button onClick={handleCancel}>Cancel</Button>
					<Button onClick={handleSaveRecursive}>Save</Button>
				</div>
			</div>
		{/if}
	</div>
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

	.edit-tabs-container {
		padding: 2rem;
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

	.completion-options-container {
		padding-top: 1rem;
	}
</style>
