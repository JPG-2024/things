<script lang="ts">
	import type { IaTask, Task, TaskComponentProps, TaskRerunPatch } from '@/types/taskRunner.types';
	import Spacer from '@/components/Spacer.component.svelte';
	import CompletionOptionsEditor from '@/components/inputs/CompletionOptionsEditor.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import ToolbarDivider from '@/components/ToolbarDivider.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { updateTaskDataById } from '@/stores/webStore';
	import {
		buildTask,
		buildRecursiveTask,
		createCategoryTask,
		createExtractionTask,
		createIaTask
	} from '@/runners/shared/taskFactories';
	import type { RecursiveConfig } from '@/runners/shared/taskFactories';
	import { getProcessorTypes } from '@/runners/shared/processors';
	import type { ProcessorType, CombineMode } from '@/runners/shared/processors';
	import { stringArrayGbnf, arrayToGbnf } from '@/lib/utils/gbnf';
	import Input from '@/components/inputs/Input.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import Dropdown from '@/components/inputs/Dropdown.component.svelte';
	import KeyValuePanel from '@/components/KeyValuePanel.svelte';
	import DetailsPanel from '@/components/DetailsPanel.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';
	import { formatDuration, dataPreview, formatData } from '@/lib/utils/tasks/taskStats';

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

	const slugifyId = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '-');

	const tabs = [
		{ id: 'custom', label: 'Custom', icon: 'TextAlignStart' },
		{ id: 'extraction', label: 'Extraction', icon: 'GripVertical' },
		{ id: 'category', label: 'Category', icon: 'Tag' },
		{ id: 'recursive', label: 'Recursive', icon: 'ListCollapse' }
	];

	let activeTab = $state('custom');
	let initialized = false;

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
	let commonVisible = $state(true);
	let commonCompletionOptions = $state<Record<string, unknown>>({});
	let commonEmbeddings = $state(false);
	let originalEmbeddings = $state(false);

	let originalName = $state('');
	let originalSystemMessage = $state('');
	let originalUserMessage = $state('');
	let originalRenderOrder = $state<number | undefined>(undefined);
	let originalDependencies = $state('');
	let originalEnableTTS = $state(false);
	let originalVisible = $state(true);
	let originalCompletionOptions = $state('');

	let extCount = $state('3');
	let extDescription = $state('keywords');
	let extOriginalCount = $state('');
	let extOriginalDescription = $state('');

	let catCategories = $state('');
	let catMaxItems = $state('8');
	let catOriginalCategories = $state('');
	let catOriginalMaxItems = $state('');

	let recWindowSize = $state('2000');
	let recOverlap = $state('200');
	let recSplitByString = $state('');
	let recUserMessage = $state('');
	let recFinalUserMessage = $state('');
	let recOriginalWindowSize = $state('');
	let recOriginalOverlap = $state('');
	let recOriginalSplitByString = $state('');
	let recOriginalUserMessage = $state('');
	let recOriginalFinalUserMessage = $state('');

	let recProcessorType = $state<ProcessorType>('summarize');
	let recCombineMode = $state<CombineMode>('llm');
	let recExtCount = $state('3');
	let recExtDescription = $state('keywords');
	let recTargetLang = $state('Spanish');
	let recCustomSystemMsg = $state('');
	let recOriginalProcessorType = $state<ProcessorType>('summarize');
	let recOriginalCombineMode = $state<CombineMode>('llm');
	let recOriginalExtCount = $state('');
	let recOriginalExtDescription = $state('');
	let recOriginalTargetLang = $state('');
	let recOriginalCustomSystemMsg = $state('');

	$effect(() => {
		if (initialized) return;
		initialized = true;

		commonName = _task.name ?? '';
		commonRenderOrder = _task.renderOrder != null ? String(_task.renderOrder) : '';
		commonDependencies = (_task.dependencies ?? []).join(', ');
		commonEnableTTS = _task.enableTTS ?? false;
		commonVisible = _task.visible ?? true;

		commonEmbeddings = _task.embeddings ?? false;
		originalEmbeddings = _task.embeddings ?? false;

		originalName = _task.name ?? '';
		originalRenderOrder = _task.renderOrder;
		originalDependencies = (_task.dependencies ?? []).join(', ');
		originalEnableTTS = _task.enableTTS ?? false;
		originalVisible = _task.visible ?? true;

		if (isIaTask) {
			const iaTask = _task as IaTask;
			const resolveCtx = { context: undefined, state: {} };

			commonSystemMessage =
				typeof iaTask.systemMessage === 'function'
					? iaTask.systemMessage(resolveCtx)
					: (iaTask.systemMessage ?? '');
			commonUserMessage =
				typeof iaTask.userMessage === 'function'
					? iaTask.userMessage(resolveCtx)
					: (iaTask.userMessage ?? '');
			const resolvedCompletion =
				typeof iaTask.completionOptions === 'function'
					? iaTask.completionOptions(resolveCtx)
					: iaTask.completionOptions;
			commonStreamEnabled = resolvedCompletion?.stream === true;
			commonCompletionOptions = { ...(resolvedCompletion ?? {}) };

			originalSystemMessage = commonSystemMessage;
			originalUserMessage = commonUserMessage;
			originalCompletionOptions = JSON.stringify(resolvedCompletion);

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
			recSplitByString = cfg?.splitByString ?? '';
			recUserMessage = cfg?.userMessage ?? 'Summarize this section concisely.';
			recFinalUserMessage =
				cfg?.finalUserMessage ?? 'Combine these section summaries into one coherent summary.';
			recOriginalWindowSize = recWindowSize;
			recOriginalOverlap = recOverlap;
			recOriginalSplitByString = recSplitByString;
			recOriginalUserMessage = recUserMessage;
			recOriginalFinalUserMessage = recFinalUserMessage;

			recProcessorType = cfg?.processorType ?? 'summarize';
			recCombineMode = cfg?.combineMode ?? 'llm';
			const extCfg = cfg?.extractorConfig;
			recExtCount = extCfg ? String(extCfg.count) : '3';
			recExtDescription = extCfg?.description ?? 'keywords';
			recTargetLang = cfg?.targetLang ?? 'Spanish';
			recCustomSystemMsg = cfg?.customSystemMsg ?? '';
			recOriginalProcessorType = recProcessorType;
			recOriginalCombineMode = recCombineMode;
			recOriginalExtCount = recExtCount;
			recOriginalExtDescription = recExtDescription;
			recOriginalTargetLang = recTargetLang;
			recOriginalCustomSystemMsg = recCustomSystemMsg;
		} else {
			recWindowSize = '1000';
			recOverlap = '100';
			recSplitByString = '';
			recUserMessage = 'Summarize this section concisely.';
			recFinalUserMessage = 'Combine these section summaries into one coherent summary.';
			recOriginalWindowSize = '';
			recOriginalOverlap = '';
			recOriginalSplitByString = '';
			recOriginalUserMessage = '';
			recOriginalFinalUserMessage = '';

			recProcessorType = 'summarize';
			recCombineMode = 'llm';
			recExtCount = '3';
			recExtDescription = 'keywords';
			recTargetLang = 'Spanish';
			recCustomSystemMsg = '';
			recOriginalProcessorType = 'summarize';
			recOriginalCombineMode = 'llm';
			recOriginalExtCount = '';
			recOriginalExtDescription = '';
			recOriginalTargetLang = '';
			recOriginalCustomSystemMsg = '';
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
				systemMessage: commonSystemMessage || undefined,
				userMessage: commonUserMessage || undefined,
				completionOptions: commonCompletionOptions,
				model: viewState.aiModel,
				renderOrder: commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined,
				persist: true,
				enableTTS: commonEnableTTS || undefined
			});
			const taskId = slugifyId(commonName) || `${_task.id} > ${Date.now()}`;
			const newTask = buildTask(def, taskId);
			newTask.embeddings = commonEmbeddings;
			newTask.visible = commonVisible;
			workflowManager.addTask(targetRunId, newTask);
			void workflowManager.rerunTask(targetRunId, newTask.id);
			onClose?.();
			return;
		}

		if (!isEditableIa) return;

		const effectiveId = slugifyId(commonName) || _task.id;
		if (effectiveId !== _task.id) {
			workflowManager.renameTaskId(targetRunId, _task.id, effectiveId);
		}

		const patch: Record<string, unknown> = {};

		if (commonName !== originalName) patch.name = commonName;
		if (JSON.stringify(commonCompletionOptions) !== originalCompletionOptions)
			patch.completionOptions = commonCompletionOptions;
		if (commonSystemMessage !== originalSystemMessage) patch.systemMessage = commonSystemMessage;
		if (commonUserMessage !== originalUserMessage) patch.userMessage = commonUserMessage;

		const editedRenderOrder = commonRenderOrder !== '' ? Number(commonRenderOrder) : undefined;
		if (editedRenderOrder !== originalRenderOrder) patch.renderOrder = editedRenderOrder;
		if (commonEnableTTS !== originalEnableTTS) patch.enableTTS = commonEnableTTS;
		if (commonVisible !== originalVisible) patch.visible = commonVisible;

		if (commonEmbeddings !== originalEmbeddings) patch.embeddings = commonEmbeddings;

		const origDeps = originalDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		if (JSON.stringify(deps) !== JSON.stringify(origDeps)) patch.dependencies = deps;

		if (Object.keys(patch).length === 0 && effectiveId === _task.id) {
			onClose?.();
			return;
		}
		const summary = await workflowManager.rerunTask(
			targetRunId,
			effectiveId,
			patch as TaskRerunPatch
		);
		const updatedTask = summary.tasks.find((t) => t.id === effectiveId);
		if (updatedTask?.persist) {
			await updateTaskDataById(targetRunId, effectiveId, updatedTask.data);
		}
		onClose?.();
	}

	async function handleSaveExtraction() {
		if (!targetRunId) return;

		if (isEditingExtraction) {
			const effectiveId = slugifyId(commonName) || _task.id;
			if (effectiveId !== _task.id) {
				workflowManager.renameTaskId(targetRunId, _task.id, effectiveId);
			}

			const patch: Record<string, unknown> = {};

			if (commonName !== originalName) patch.name = commonName;
			if (commonEmbeddings !== originalEmbeddings) patch.embeddings = commonEmbeddings;

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
			if (commonEnableTTS !== originalEnableTTS) patch.enableTTS = commonEnableTTS;
			if (commonVisible !== originalVisible) patch.visible = commonVisible;

			if (Object.keys(patch).length === 0 && effectiveId === _task.id) {
				onClose?.();
				return;
			}
			const summary = await workflowManager.rerunTask(
				targetRunId,
				effectiveId,
				patch as TaskRerunPatch
			);
			const updatedTask = summary.tasks.find((t) => t.id === effectiveId);
			if (updatedTask?.persist) {
				await updateTaskDataById(targetRunId, effectiveId, updatedTask.data);
			}
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
				extractor: { count, description: extDescription },
				enableTTS: commonEnableTTS || undefined
			});
			const taskId = slugifyId(commonName) || `${_task.id} > ${Date.now()}`;
			const newTask = buildTask(def, taskId);
			newTask.embeddings = commonEmbeddings;
			newTask.visible = commonVisible;
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
			const effectiveId = slugifyId(commonName) || _task.id;
			if (effectiveId !== _task.id) {
				workflowManager.renameTaskId(targetRunId, _task.id, effectiveId);
			}

			const patch: Record<string, unknown> = {};

			if (commonName !== originalName) patch.name = commonName;
			if (commonEmbeddings !== originalEmbeddings) patch.embeddings = commonEmbeddings;

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
			if (commonEnableTTS !== originalEnableTTS) patch.enableTTS = commonEnableTTS;
			if (commonVisible !== originalVisible) patch.visible = commonVisible;

			if (Object.keys(patch).length === 0 && effectiveId === _task.id) {
				onClose?.();
				return;
			}
			const summary = await workflowManager.rerunTask(
				targetRunId,
				effectiveId,
				patch as TaskRerunPatch
			);
			const updatedTask = summary.tasks.find((t) => t.id === effectiveId);
			if (updatedTask?.persist) {
				await updateTaskDataById(targetRunId, effectiveId, updatedTask.data);
			}
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
				maxItems,
				enableTTS: commonEnableTTS || undefined
			});
			const taskId = slugifyId(commonName) || `${_task.id} > ${Date.now()}`;
			const newTask = buildTask(def, taskId);
			newTask.embeddings = commonEmbeddings;
			newTask.visible = commonVisible;
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

		const extractorConfig =
			recProcessorType === 'extraction'
				? { count: Number(recExtCount) || 3, description: recExtDescription || 'keywords' }
				: undefined;

		if (isEditingRecursive) {
			const effectiveId = slugifyId(commonName) || _task.id;

			if (effectiveId !== _task.id) {
				workflowManager.renameTaskId(targetRunId, _task.id, effectiveId);
			}

			const existingCfg = (_task.componentProps as Record<string, unknown>)?.recursiveConfig as
				| RecursiveConfig
				| undefined;

			const newTask = buildRecursiveTask(effectiveId, {
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				windowSize: Number(recWindowSize) || 1000,
				windowDivisor: existingCfg?.windowDivisor,
				overlap: Number(recOverlap) || 100,
				splitByString: recSplitByString.trim() || undefined,
				processorType: recProcessorType,
				combineMode: recCombineMode,
				userMessage: recUserMessage,
				finalUserMessage: recFinalUserMessage,
				model: viewState.aiModel,
				extractorConfig,
				targetLang: recProcessorType === 'translate' ? recTargetLang : undefined,
				customSystemMsg: recProcessorType === 'custom' ? recCustomSystemMsg : undefined,
				renderOrder:
					commonRenderOrder !== '' ? Number(commonRenderOrder) : (_task.renderOrder ?? 0),
				embeddings: commonEmbeddings,
				persist: true,
				enableTTS: commonEnableTTS || undefined
			});
			newTask.visible = commonVisible;
			workflowManager.addTask(targetRunId, newTask);
			const summary = await workflowManager.rerunTask(targetRunId, effectiveId);
			const updatedTask = summary.tasks.find((t) => t.id === effectiveId);
			if (updatedTask?.persist) {
				await updateTaskDataById(targetRunId, effectiveId, updatedTask.data);
			}
		} else {
			const taskId = slugifyId(commonName) || `${_task.id} > ${Date.now()}`;
			const newTask = buildRecursiveTask(taskId, {
				name: commonName || undefined,
				dependencies: deps.length > 0 ? deps : undefined,
				windowSize: Number(recWindowSize) || 1000,
				overlap: Number(recOverlap) || 100,
				splitByString: recSplitByString.trim() || undefined,
				processorType: recProcessorType,
				combineMode: recCombineMode,
				userMessage: recUserMessage,
				finalUserMessage: recFinalUserMessage,
				model: viewState.aiModel,
				extractorConfig,
				targetLang: recProcessorType === 'translate' ? recTargetLang : undefined,
				customSystemMsg: recProcessorType === 'custom' ? recCustomSystemMsg : undefined,
				renderOrder,
				embeddings: commonEmbeddings,
				persist: true,
				enableTTS: commonEnableTTS || undefined
			});
			newTask.visible = commonVisible;
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
	<div class="task-info">
		<div class="task-stats">
			<KeyValuePanel
				row
				items={[
					{ key: 'id', value: _task.id },
					{ key: 'type', value: _task.type },
					{
						key: 'duration',
						value: formatDuration(
							_task.startedAt && _task.endedAt ? _task.endedAt - _task.startedAt : null
						)
					},
					{ key: 'dependencies', value: _task.dependencies.join(', ') },
					...(_task.renderOrder != null ? [{ key: 'renderOrder', value: _task.renderOrder }] : []),
					...(_task.component ? [{ key: 'component', value: _task.component }] : [])
				]}
			/>

			{#if _task.data != null}
				<div class="data-block-container">
					<DetailsPanel label="data:" hint={dataPreview(_task.data)}>
						<pre class="result-data">{formatData(_task.data)}</pre>
					</DetailsPanel>
				</div>
			{/if}

			{#if _task.embeddings}
				<SimilarEmbeddingsComponent
					id={_task.id}
					data={_task.data}
					enabled={_task.embeddings === true}
				/>
			{/if}

			{#if _task.status === 'failed'}
				<div class="error-block">
					<p class="error-message">{_task.error ?? 'Unknown error'}</p>
					{#if _task.debug}
						<details class="debug-block">
							<summary>Debug</summary>
							<pre>{_task.debug}</pre>
						</details>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="completion-options-container">
		<Spacer title="Completion Options" defaultOpen={false}>
			<div class="form-grid">
				<CompletionOptionsEditor completionOptions={commonCompletionOptions} showStream={false} />
			</div>
		</Spacer>
	</div>

	<div class="row">
		<Input bind:value={commonName} label="Task name" />
		<Input bind:value={commonRenderOrder} label="Render order" />
		<Input bind:value={commonDependencies} label="Dependencies (comma-separated)" />
	</div>

	<div class="edit-tabs-container">
		<div class="tabs-row">
			<Tabs {tabs} bind:activeTab iconOnly />
			<ToolbarDivider />
			<div class="options-toolbar">
				<ToggleIcon
					name="Eye"
					bind:checked={commonVisible}
					size={20}
					tooltipProps={{ content: 'Visible' }}
				/>
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
					tooltipProps={{ content: 'Auto speech' }}
				/>
				<ToggleIcon
					name="FileDigit"
					bind:checked={commonEmbeddings}
					size={20}
					tooltipProps={{ content: 'Auto generate embeddings' }}
				/>
			</div>
		</div>
	</div>

	<div class="edit-tabs-container">
		{#if activeTab === 'custom'}
			<div class="tab-content">
				<Input bind:value={commonSystemMessage} label="System message" />
				<Input bind:value={commonUserMessage} label="User message" />
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
				<Input
					bind:value={recSplitByString}
					label="Split by string (leave empty for window-based)"
				/>
				{#if !recSplitByString}
					<Input bind:value={recWindowSize} label="Window size (chars)" />
					<Input bind:value={recOverlap} label="Overlap (chars)" />
				{/if}
				<Dropdown
					label="Combine mode"
					bind:value={recCombineMode}
					options={[
						{ label: 'Default (LLM)', value: 'llm' },
						{ label: 'Join', value: 'join' },
						{ label: 'Dedupe', value: 'dedupe' }
					]}
				/>
				<Dropdown
					label="Processor type"
					bind:value={recProcessorType}
					options={[
						{ label: 'Summarize', value: 'summarize' },
						{ label: 'Extraction', value: 'extraction' },
						{ label: 'Translate', value: 'translate' },
						{ label: 'Custom', value: 'custom' }
					]}
				/>
				{#if recProcessorType === 'extraction'}
					<Input bind:value={recExtCount} label="Extract count" />
					<Input bind:value={recExtDescription} label="Extract description" />
				{:else if recProcessorType === 'translate'}
					<Input bind:value={recTargetLang} label="Target language" />
				{:else if recProcessorType === 'custom'}
					<Input bind:value={recCustomSystemMsg} label="System message" />
				{/if}
				{#if recProcessorType === 'summarize'}
					<Input bind:value={recUserMessage} label="Per-chunk prompt" />
					<Input bind:value={recFinalUserMessage} label="Final prompt" />
				{/if}
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
		gap: 1rem;
		border-radius: var(--radius-lg);
	}

	.task-info {
	}

	.task-stats {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		font-size: 0.82rem;
	}

	.data-block-container {
		margin-top: 0.5rem;
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
		border-radius: var(--radius-md);
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
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.03);
		padding: 0.4rem 0.6rem;
	}

	.options-toolbar {
		padding: 0 1rem;
		display: flex;
		align-items: center;
		gap: 1rem;
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

	.tab-content {
		display: grid;
		gap: 1.4rem;
	}

	.tabs-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.edit-tabs-container {
		padding: 1rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
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
		padding: 1rem 0;
	}
</style>
