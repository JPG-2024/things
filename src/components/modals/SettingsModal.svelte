<script lang="ts">
	import Modal from '../Modal.svelte';
	import Dropdown from '../inputs/Dropdown.component.svelte';
	import { viewState } from '../../stores/viewStore.svelte';
	import TTSSettings from './TTSSettings.svelte';
	import { invoke } from '@tauri-apps/api/core';

	let { show = false, onClose = () => {} } = $props();

	let browserProfile = $state<string>('Not loaded');

	$effect(() => {
		if (show) {
			invoke<string>('get_browser_profile')
				.then((path) => {
					browserProfile = path;
				})
				.catch((error) => {
					browserProfile = `Error: ${error}`;
				});
		}
	});

	function closeModal() {
		onClose();
	}
</script>

<Modal {show} onClose={closeModal}>
	<div class="modal-inner">
		<h2>Settings</h2>
		<Dropdown
			options={[
				{ label: 'Spanish', value: 'es' },
				{ label: 'English', value: 'en' }
			]}
			bind:value={viewState.language}
		/>
		<div class="profile-info">
			<label>Browser Profile</label>
			<span>{browserProfile}</span>
		</div>
		<div class="inference-section">
			<h3>Inference</h3>
			<div class="field">
				<label for="aiProvider">AI Provider</label>
				<select id="aiProvider" bind:value={viewState.aiProvider}>
					<option value="llama">Llama</option>
					<option value="openrouter">OpenRouter</option>
				</select>
			</div>
			<div class="field">
				<label for="aiUrl">AI URL</label>
				<input id="aiUrl" type="text" bind:value={viewState.aiUrl} />
			</div>
			<div class="field">
				<label for="aiModel">AI Model</label>
				<input id="aiModel" type="text" bind:value={viewState.aiModel} />
			</div>
		</div>
		<TTSSettings />
	</div>
</Modal>

<style>
	.modal-inner {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0 auto;
		width: min(100%, 32rem);
	}

	h2 {
		margin: 0;
	}

	.profile-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.profile-info label {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.profile-info code {
		background: var(--color-bg-secondary, #f5f5f5);
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		word-break: break-all;
		font-family: monospace;
	}

	.inference-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--color-bg-secondary, #f5f5f5);
		border-radius: 0.5rem;
	}

	.inference-section h3 {
		margin: 0;
		font-size: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.field input,
	.field select {
		padding: 0.5rem;
		border: 1px solid var(--color-border, #ccc);
		border-radius: 0.375rem;
		font-size: 0.875rem;
		background: var(--color-bg, #fff);
	}
</style>
