<script lang="ts">
	import Modal from './Modal.svelte';
	import Dropdown from './inputs/Dropdown.component.svelte';
	import Input from './inputs/Input.component.svelte';
	import Button from './inputs/Button.component.svelte';
	import Icon from './Icon.svelte';
	import {
		listTemplates,
		saveTemplate,
		deleteTemplate,
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
	let newName = $state('');
	let templateChanged = $state(false);
	let loading = $state(false);
	let deleting = $state(false);

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

	async function handleCreate() {
		const tasks = workflowStore.focusedRunTasks;
		if (!tasks || tasks.length === 0 || !newName.trim()) return;

		const templateDefs = tasksToTemplateDefs(tasks);
		if (templateDefs.length === 0) return;

		const saved = await saveTemplate({
			id: newName.trim(),
			name: newName.trim(),
			tasks: templateDefs
		});

		if (saved) {
			templates = [...templates, saved];
			selectedTemplateId = saved.id;
			newName = '';
		}
	}

	async function handleCloneSelected() {
		if (!selectedTemplateId || !newName.trim()) return;
		const source = templates.find((t) => t.id === selectedTemplateId);
		if (!source) return;

		const saved = await saveTemplate({
			id: newName.trim(),
			name: newName.trim(),
			tasks: source.tasks
		});

		if (saved) {
			templates = [...templates, saved];
			selectedTemplateId = saved.id;
			newName = '';
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

	async function handleUpdate() {
		if (!selectedTemplateId) return;

		const tasks = workflowStore.focusedRunTasks;
		if (!tasks || tasks.length === 0) return;

		const templateDefs = tasksToTemplateDefs(tasks);
		if (templateDefs.length === 0) return;

		const existing = templates.find((t) => t.id === selectedTemplateId);
		if (!existing) return;

		const updated = await saveTemplate({
			id: existing.id,
			name: existing.name,
			description: existing.description,
			tasks: templateDefs
		});

		if (updated) {
			templates = templates.map((t) => (t.id === updated.id ? updated : t));
		}
	}

	async function handleDeleteTemplate() {
		if (!selectedTemplateId || deleting) return;
		deleting = true;
		try {
			const success = await deleteTemplate(selectedTemplateId);
			if (success) {
				templates = templates.filter((t) => t.id !== selectedTemplateId);
				if (selectedTemplateId === initialTemplateId) {
					initialTemplateId = null;
					templateChanged = true;
				}
				selectedTemplateId = '';
			}
		} finally {
			deleting = false;
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
			<div class="field row">
				<div class="dropdown-wrapper">
					<Dropdown
						options={templateOptions}
						bind:value={selectedTemplateId}
						placeholder="Select a template..."
						label="Templates"
					/>
				</div>
				<Icon
					name="Trash"
					size={20}
					tooltipProps={{ content: 'delete template' }}
					onClick={handleDeleteTemplate}
					color={deleting || !selectedTemplateId ? 'gray' : 'white'}
				/>
			</div>

			<div class="field row">
				<div class="input-wrapper">
					<Input bind:value={newName} placeholder="Template name..." label="Name" />
				</div>
				<Button
					onClick={handleCreate}
					disabled={!newName.trim() || !workflowStore.focusedRunTasks?.length}
				>
					Create
				</Button>
			</div>

			{#if selectedTemplateId}
				<div class="field">
					<Button onClick={handleCloneSelected} disabled={!newName.trim()}>Clone selected</Button>
				</div>
			{/if}

			<div class="field">
				<Button onClick={handleAssign} disabled={!viewState.domainUrl || !selectedTemplateId}>
					Assign to profile
				</Button>
			</div>

			<div class="field">
				<Button
					onClick={handleUpdate}
					disabled={!selectedTemplateId || !workflowStore.focusedRunTasks?.length}
				>
					Update template
				</Button>
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

	.field.row {
		flex-direction: row;
		align-items: center;
	}

	.dropdown-wrapper {
		flex: 1;
	}

	.input-wrapper {
		flex: 1;
	}

	.loading {
		text-align: center;
		padding: 1rem;
		opacity: 0.6;
	}
</style>
