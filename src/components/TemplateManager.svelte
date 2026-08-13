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
	let showCreateSection = $state(false);
	let confirmDelete = $state(false);
	let confirmTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (show) {
			loadTemplates();
		}
	});

	$effect(() => {
		return () => {
			if (confirmTimeout) clearTimeout(confirmTimeout);
		};
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

	const templateOptions = $derived(
		templates.map((t) => ({
			label: t.id === initialTemplateId ? `${t.name} (assigned)` : t.name,
			value: t.id
		}))
	);

	const hasTasks = $derived((workflowStore.focusedRunTasks?.length ?? 0) > 0);

	const isAssigned = $derived(
		selectedTemplateId !== '' && selectedTemplateId === initialTemplateId
	);

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
			showCreateSection = false;
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
			showCreateSection = false;
		}
	}

	async function handleAssign() {
		if (!viewState.domainUrl || !selectedTemplateId) return;

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

	function handleDeleteClick() {
		if (!selectedTemplateId || deleting) return;
		if (confirmDelete) {
			handleDeleteTemplate();
		} else {
			confirmDelete = true;
			confirmTimeout = setTimeout(() => {
				confirmDelete = false;
				confirmTimeout = null;
			}, 3000);
		}
	}

	async function handleDeleteTemplate() {
		if (!selectedTemplateId || deleting) return;
		deleting = true;
		confirmDelete = false;
		if (confirmTimeout) {
			clearTimeout(confirmTimeout);
			confirmTimeout = null;
		}
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

	function toggleCreateSection() {
		showCreateSection = !showCreateSection;
		if (!showCreateSection) newName = '';
	}
</script>

<Modal {show} onClose={handleClose}>
	<div class="template-manager">
		<h3>Template Manager</h3>

		{#if loading}
			<div class="loading">Loading...</div>
		{:else}
			<section class="section">
				<div class="section-header">
					<span class="section-label">Select</span>
					{#if selectedTemplateId && isAssigned}
						<span class="assigned-badge">Assigned</span>
					{/if}
				</div>

				{#if templates.length === 0}
					<p class="empty-state">No templates yet. Create one from your current tasks.</p>
				{:else}
					<div class="select-row">
						<div class="dropdown-wrapper">
							<Dropdown
								options={templateOptions}
								bind:value={selectedTemplateId}
								placeholder="Select a template..."
							/>
						</div>
						<button
							class="delete-btn"
							disabled={deleting || !selectedTemplateId}
							onclick={handleDeleteClick}
							title={confirmDelete ? 'Click again to confirm' : 'Delete template'}
						>
							<Icon name="Trash2" size={18} color={confirmDelete ? '#ff5050' : 'currentColor'} />
							{#if confirmDelete}
								<span class="confirm-text">Confirm?</span>
							{/if}
						</button>
					</div>
				{/if}
			</section>

			{#if selectedTemplateId}
				<section class="section">
					<span class="section-label">Actions</span>
					<div class="actions-grid">
						<button
							class="action-btn primary"
							onclick={handleAssign}
							disabled={!viewState.domainUrl}
						>
							<Icon name="Link" size={16} />
							Assign to profile
						</button>
						<button class="action-btn" onclick={handleUpdate} disabled={!hasTasks}>
							<Icon name="Save" size={16} />
							Update template
						</button>
					</div>
				</section>
			{/if}
		{/if}

		<section class="section">
			<button class="toggle-create" onclick={toggleCreateSection}>
				<Icon name={showCreateSection ? 'ChevronDown' : 'Plus'} size={16} />
				<span>{showCreateSection ? 'New template' : 'New template'}</span>
			</button>

			{#if showCreateSection}
				<div class="create-form">
					<Input bind:value={newName} placeholder="Template name..." />
					<div class="create-actions">
						<Button onClick={handleCreate} disabled={!newName.trim() || !hasTasks}>Create</Button>
						{#if selectedTemplateId}
							<Button onClick={handleCloneSelected} disabled={!newName.trim()}>
								Clone selected
							</Button>
						{/if}
					</div>
				</div>
			{/if}
		</section>
	</div>
</Modal>

<style>
	.template-manager {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		min-width: 320px;
	}

	h3 {
		margin: 0;
		font-size: 1.2rem;
		color: var(--primary-color);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.section:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.section-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.5);
	}

	.assigned-badge {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: rgba(var(--primary-color-rgb, 0, 200, 255), 0.15);
		color: var(--primary-color);
		border: 1px solid rgba(var(--primary-color-rgb, 0, 200, 255), 0.3);
	}

	.select-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.dropdown-wrapper {
		flex: 1;
	}

	.delete-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		background: rgba(154, 154, 154, 0.12);
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		outline: none;
		transition: all 0.2s ease;
		flex-shrink: 0;
		height: fit-content;
	}

	.delete-btn:hover:not(:disabled) {
		background: rgba(255, 80, 80, 0.15);
		border-color: rgba(255, 80, 80, 0.3);
		color: #ff5050;
	}

	.delete-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.confirm-text {
		font-size: 0.75rem;
		color: #ff5050;
	}

	.empty-state {
		margin: 0;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.4);
		text-align: center;
		padding: 0.75rem 0;
	}

	.toggle-create {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: none;
		border: none;
		color: var(--primary-color);
		cursor: pointer;
		padding: 0.25rem 0;
		font-size: 0.85rem;
		font-weight: 500;
		width: fit-content;
	}

	.toggle-create:hover {
		opacity: 0.8;
	}

	.create-form {
		display: grid;
		gap: 0.5rem;
	}

	.create-actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		gap: 0.5rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		border: 1px solid var(--primary-color);
		border-radius: 12px;
		background: none;
		color: var(--primary-color);
		cursor: pointer;
		font-weight: bold;
		font-size: 0.85rem;
		transition: all 0.2s ease;
	}

	.action-btn:hover:not(:disabled) {
		background-color: var(--primary-color);
		color: black;
	}

	.action-btn.primary {
		background-color: var(--primary-color);
		color: black;
	}

	.action-btn.primary:hover:not(:disabled) {
		opacity: 0.85;
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.loading {
		text-align: center;
		padding: 1rem;
		opacity: 0.6;
	}
</style>
