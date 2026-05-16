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
	{#snippet children()}
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
			<TTSSettings />
		</div>
	{/snippet}
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
</style>
