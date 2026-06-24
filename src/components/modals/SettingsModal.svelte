<script lang="ts">
	import { onMount } from 'svelte';
	import Dropdown from '../inputs/Dropdown.component.svelte';
	import Icon from '@/components/Icon.svelte';
	import IconDropdown from '../inputs/IconDropdown.component.svelte';
	import { viewState } from '../../stores/viewStore.svelte';
	import { invoke } from '@tauri-apps/api/core';

	const providerOptions = [
		{ label: 'Llama', value: 'llama' },
		{ label: 'OpenRouter', value: 'openrouter' }
	];

	let browserProfile = $state<string>('Not loaded');

	onMount(() => {
		invoke<string>('get_browser_profile')
			.then((path) => {
				browserProfile = path;
			})
			.catch((error) => {
				browserProfile = `Error: ${error}`;
			});
	});
</script>

<div class="drawer-inner">
	<h2>
		<Icon name="Cog" size={30} color={viewState.primaryColor} />
		Settings
	</h2>
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
		<IconDropdown label="AI Provider" options={providerOptions} bind:value={viewState.aiProvider} />
		<div class="field">
			<label for="aiUrl">AI URL</label>
			<input id="aiUrl" type="text" bind:value={viewState.aiUrl} />
		</div>
		<div class="field">
			<label for="aiModel">AI Model</label>
			<input id="aiModel" type="text" bind:value={viewState.aiModel} />
		</div>
	</div>
</div>

<style>
	.drawer-inner {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 3rem 1.5rem;
		width: 100%;
	}

	h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		color: var(--primary-color);
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.profile-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.profile-info label {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--primary-color, #fae4c0);
	}

	.profile-info span {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.8rem;
		word-break: break-all;
	}

	.inference-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.5rem;
	}

	.inference-section h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--primary-color, #fae4c0);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-weight: 600;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.8);
	}

	.field input {
		padding: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.375rem;
		font-size: 0.875rem;
		background: rgba(0, 0, 0, 0.3);
		color: white;
	}

	.field input:focus {
		outline: none;
		border-color: var(--primary-color, #fae4c0);
	}
</style>
