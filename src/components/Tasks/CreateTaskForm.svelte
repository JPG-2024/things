<script lang="ts">
	import Tabs from '@/components/Tabs.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import Textarea from '@/components/inputs/Textarea.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import CompletionOptionsEditor from '@/components/inputs/CompletionOptionsEditor.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { defineTask, buildTask } from '@/runners/shared/dynamicTasks';
	import { DEFAULT_IA_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';

	interface Props {
		runId?: string;
		parentTaskId?: string;
		parentRenderOrder?: number;
		onClose?: () => void;
	}

	let { runId, parentTaskId, parentRenderOrder = 0, onClose }: Props = $props();

	const tabs = [
		{ id: 'ia', label: 'ia' },
		{ id: 'extraction', label: 'extraction' }
	];

	let activeTab = $state('ia');

	let iaName = $state('');
	let iaSystemMessage = $state('You are a helpful AI assistant. Respond concisely and accurately.');
	let iaUserMessage = $state('');
	let iaDependencies = $state(parentTaskId ?? '');
	let iaEnableTTS = $state(false);
	let iaRenderOrder = $state(String(parentRenderOrder + 0.01));
	let iaCompletionOptions = $state<Record<string, unknown>>({
		...DEFAULT_IA_COMPLETION_OPTIONS,
		model: viewState.aiModel
	});

	let extName = $state('');
	let extCount = $state('3');
	let extDescription = $state('keywords');
	let extComponent = $state('keywords');
	let extDependencies = $state(parentTaskId ?? '');
	let extRenderOrder = $state(String(parentRenderOrder + 0.01));

	function handleSaveIa() {
		if (!runId) return;
		const deps = iaDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const renderOrder = parentRenderOrder + 0.01;
		const def = defineTask({
			name: iaName || undefined,
			dependencies: deps.length > 0 ? deps : undefined,
			systemMessage: iaSystemMessage,
			userMessage: iaUserMessage,
			model: viewState.aiModel,
			renderOrder,
			completionOptions: iaCompletionOptions
		});
		const taskId = `${parentTaskId ?? 'task'} > ${Date.now()}`;
		const newTask = buildTask(def, taskId);
		workflowManager.addTask(runId, newTask);
		void workflowManager.rerunTask(runId, newTask.id);
		onClose?.();
	}

	function handleSaveExtraction() {
		if (!runId) return;
		const deps = extDependencies
			.split(',')
			.map((d) => d.trim())
			.filter(Boolean);
		const count = Number(extCount) || 3;
		const renderOrder = parentRenderOrder + 0.01;
		const def = defineTask({
			name: extDescription,
			dependencies: deps.length > 0 ? deps : undefined,
			component: extComponent,
			model: viewState.aiModel,
			renderOrder,
			extractorConfig: { count, description: extDescription }
		});
		const taskId = `${parentTaskId ?? 'task'} > ${Date.now()}`;
		const newTask = buildTask(def, taskId);
		workflowManager.addTask(runId, newTask);
		void workflowManager.rerunTask(runId, newTask.id);
		onClose?.();
	}
</script>

<div class="create-task-form">
	<Tabs {tabs} bind:activeTab />

	{#if activeTab === 'ia'}
		<div class="tab-content">
			<Input bind:value={iaName} label="Task name" />
			<Textarea bind:value={iaSystemMessage} rows={4} label="System message" />
			<Textarea bind:value={iaUserMessage} rows={3} label="User message" />
			<Input bind:value={iaDependencies} label="Dependencies (comma-separated)" />
			<div class="tts-toggle">
				<ToggleIcon
					name="Speech"
					bind:checked={iaEnableTTS}
					size={20}
					tooltipProps={{ content: 'auto speech' }}
				/>
				<span class="tts-hint" class:muted={!viewState.autoSpeechEnabled}>
					{viewState.autoSpeechEnabled ? 'auto speech enabled' : 'auto speech disabled globally'}
				</span>
			</div>
			<Input bind:value={iaRenderOrder} label="Render order" />
			<Spacer title="Completion Options" defaultOpen={false}>
				<CompletionOptionsEditor completionOptions={iaCompletionOptions} showStream={false} />
			</Spacer>
			<div class="actions">
				<Button onClick={handleSaveIa}>Create IA Task</Button>
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
				<Button onClick={handleSaveExtraction}>Create Extraction Task</Button>
			</div>
		</div>
	{/if}
</div>

<style>
	.create-task-form {
		min-width: 320px;
		max-width: 400px;
		display: grid;
		gap: 1rem;
		padding: 1rem;
	}

	.tab-content {
		display: grid;
		gap: 1rem;
	}

	.tts-toggle {
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

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.25rem;
	}
</style>
