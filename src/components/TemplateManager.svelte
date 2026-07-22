<script lang="ts">
	import Modal from './Modal.svelte';
	import Dropdown from './inputs/Dropdown.component.svelte';
	import Input from './inputs/Input.component.svelte';
	import Button from './inputs/Button.component.svelte';
	import {
		listTemplates,
		saveTemplate,
		assignTemplateToProfile,
		getProfileTemplateId,
		tasksToTemplateDefs
	} from '@/stores/templateStore';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import type { Template } from '@/types/template.types';

	interface Props {
		show: boolean;
		onClose: () => void;
	}

	let { show, onClose }: Props = $props();

	let templates = $state<Template[]>([]);
	let selectedTemplateId = $state('');
	let initialTemplateId = $state<string | null>(null);
	let cloneName = $state('');
	let templateChanged = $state(false);
	let loading = $state(false);

	$effect(() => {
		if (show) {
			loadTemplates();
		}
	});

	async function loadTemplates() {
		loading = true;
		try {
			templates = await listTemplates();
			if (viewState.domainUrl) {
				initialTemplateId = await getProfileTemplateId(viewState.domainUrl);
				selectedTemplateId = initialTemplateId ?? '';
			}
		} finally {
			loading = false;
		}
	}

	const templateOptions = $derived(templates.map((t) => ({ label: t.name, value: t.id })));

	async function handleClone() {
		const tasks = workflowStore.focusedRunTasks;
		if (!tasks || tasks.length === 0 || !cloneName.trim()) return;

		const templateDefs = tasksToTemplateDefs(tasks);
		if (templateDefs.length === 0) return;

		const saved = await saveTemplate({
			id: cloneName.trim(),
			name: cloneName.trim(),
			tasks: templateDefs
		});

		if (saved) {
			templates = [...templates, saved];
			selectedTemplateId = saved.id;
			cloneName = '';
		}
	}

	async function handleAssign() {
		if (!viewState.domainUrl || !selectedTemplateId) return;

		console.log(viewState.domainUrl, selectedTemplateId);
		const success = await assignTemplateToProfile(viewState.domainUrl, selectedTemplateId);
		if (success) {
			templateChanged = selectedTemplateId !== initialTemplateId;
		}
	}

	function handleClose() {
		if (templateChanged && viewState.url) {
			void urlRouter(viewState.url, { forceRunTasks: true });
		}
		onClose();
	}
</script>

<Modal {show} onClose={handleClose}>
	<div class="template-manager">
		<h3>Template Manager</h3>

		{#if loading}
			<div class="loading">Loading...</div>
		{:else}
			<div class="field">
				<Dropdown
					options={templateOptions}
					bind:value={selectedTemplateId}
					placeholder="Select a template..."
					label="Templates"
				/>
			</div>

			<div class="field">
				<Button onClick={handleAssign} disabled={!viewState.domainUrl || !selectedTemplateId}>
					Assign to profile
				</Button>
			</div>

			<div class="divider"></div>

			<div class="field">
				<Input bind:value={cloneName} placeholder="Template name..." label="Clone current tasks" />
			</div>

			<div class="field">
				<Button onClick={handleClone} disabled={!cloneName.trim()}>Clone</Button>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.template-manager {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 300px;
	}

	h3 {
		margin: 0;
		font-size: 1.2rem;
		color: var(--primary-color);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0.5rem 0;
	}

	.loading {
		text-align: center;
		padding: 1rem;
		opacity: 0.6;
	}
</style>
