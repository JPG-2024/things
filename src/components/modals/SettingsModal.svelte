<script lang="ts">
	import Icon from '@/components/Icon.svelte';
	import IconDropdown from '../inputs/IconDropdown.component.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import { viewState } from '../../stores/viewStore.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';
	import { rebuildCategoryIndex } from '@/lib/utils/categoryEmbeddings';
	import { onMount } from 'svelte';
	import { open } from '@tauri-apps/plugin-dialog';
	import {
		ensureLlamaServers,
		listLlamaModels,
		reconcileLlamaModels
	} from '@/lib/utils/llamaHealth';
	import { partitionModels, type LlamaModelEntry } from '@/lib/utils/llamaModels';

	let rebuildingCategories = $state(false);
	let models = $state<LlamaModelEntry[]>([]);
	let modelsError = $state<string | null>(null);
	let loadingModels = $state(false);
	let showAllModels = $state(false);
	let restarting = $state(false);

	function toOptions(entries: LlamaModelEntry[]) {
		return entries.map((model) => ({ label: model.name, value: model.name }));
	}

	function ensureSelected(entries: LlamaModelEntry[], selected: string) {
		const options = toOptions(entries);
		if (
			selected &&
			!options.some((option) => option.value === selected) &&
			models.some((model) => model.name === selected)
		) {
			options.push({ label: selected, value: selected });
		}
		return options;
	}

	const inferenceOptions = $derived(
		ensureSelected(
			showAllModels ? models : partitionModels(models).chat,
			viewState.llamaInferenceModel
		)
	);

	const embeddingsOptions = $derived(
		ensureSelected(
			showAllModels ? models : partitionModels(models).embedding,
			viewState.llamaEmbeddingsModel
		)
	);

	async function refreshModels() {
		loadingModels = true;
		modelsError = null;
		try {
			const listing = await listLlamaModels(viewState.llamaModelsDir);
			models = listing.models;
		} catch (error) {
			modelsError = error instanceof Error ? error.message : String(error);
			models = [];
		} finally {
			loadingModels = false;
		}
	}

	async function handlePickModelsDir() {
		const selected = await open({ directory: true, multiple: false });
		if (typeof selected === 'string' && selected.trim()) {
			viewState.llamaModelsDir = selected;
			await refreshModels();
		}
	}

	async function handleRestartServers() {
		if (restarting) return;
		restarting = true;
		try {
			await ensureLlamaServers(true);
		} finally {
			restarting = false;
		}
	}

	onMount(() => {
		void reconcileLlamaModels().then(() => refreshModels());
	});

	async function handleRebuildCategoryIndex() {
		if (rebuildingCategories) return;
		rebuildingCategories = true;
		try {
			await rebuildCategoryIndex();
		} catch (error) {
			console.error('Error rebuilding category index:', error);
		} finally {
			rebuildingCategories = false;
		}
	}

	const providerOptions = [
		{ label: 'Llama', value: 'llama' },
		{ label: 'OpenRouter', value: 'openrouter' }
	];

	const languageOptions = [
		{ label: 'Spanish', value: 'es', emoji: '🇪🇸' },
		{ label: 'English', value: 'en', emoji: '🇬🇧' },
		{ label: 'French', value: 'fr', emoji: '🇫🇷' },
		{ label: 'German', value: 'de', emoji: '🇩🇪' },
		{ label: 'Portuguese', value: 'pt', emoji: '🇵🇹' },
		{ label: 'Italian', value: 'it', emoji: '🇮🇹' },
		{ label: 'Japanese', value: 'ja', emoji: '🇯🇵' }
	];
</script>

<div class="drawer-inner">
	<h2>
		<Icon name="Cog" size={30} color={viewState.primaryColor} />
		Settings
	</h2>
	<IconDropdown
		label="Language"
		options={languageOptions}
		iconSize={20}
		bind:value={viewState.language}
	/>
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
	<div class="inference-section">
		<h3>Local models (llama.cpp)</h3>
		<div class="field">
			<label for="llama-models-dir">Models directory</label>
			<div class="dir-row">
				<input
					id="llama-models-dir"
					type="text"
					bind:value={viewState.llamaModelsDir}
					onchange={() => void refreshModels()}
					placeholder="~/Downloads/models"
				/>
				<Button onClick={() => void handlePickModelsDir()} icon="FolderOpen">Browse</Button>
			</div>
		</div>
		<div class="field">
			<span class="field-label">Inference model</span>
			<IconDropdown
				bind:value={viewState.llamaInferenceModel}
				options={inferenceOptions}
				placeholder={loadingModels ? 'Loading…' : 'Select a model'}
			/>
		</div>
		<div class="field">
			<label for="llama-inference-port">Inference port</label>
			<input
				id="llama-inference-port"
				type="number"
				min="1024"
				max="65535"
				value={viewState.llamaInferencePort}
				oninput={(e) => {
					const v = Number((e.target as HTMLInputElement).value);
					viewState.llamaInferencePort = Math.min(
						65535,
						Math.max(1024, Math.trunc(isNaN(v) ? 8080 : v))
					);
				}}
			/>
		</div>
		<div class="field">
			<span class="field-label">Embeddings model</span>
			<IconDropdown
				bind:value={viewState.llamaEmbeddingsModel}
				options={embeddingsOptions}
				placeholder={loadingModels ? 'Loading…' : 'Select a model'}
			/>
		</div>
		<div class="field">
			<label for="llama-embeddings-port">Embeddings port</label>
			<input
				id="llama-embeddings-port"
				type="number"
				min="1024"
				max="65535"
				value={viewState.llamaEmbeddingsPort}
				oninput={(e) => {
					const v = Number((e.target as HTMLInputElement).value);
					viewState.llamaEmbeddingsPort = Math.min(
						65535,
						Math.max(1024, Math.trunc(isNaN(v) ? 8083 : v))
					);
				}}
			/>
		</div>
		<div class="field checkbox-field">
			<label>
				<input type="checkbox" bind:checked={showAllModels} />
				Show all models
			</label>
		</div>
		{#if modelsError}
			<p class="error-text">{modelsError}</p>
		{/if}
		{#if viewState.llamaServersStatus.length > 0}
			<ul class="server-status">
				{#each viewState.llamaServersStatus as status (status.name)}
					<li>
						<span class="status-name">{status.name}</span>
						{#if status.error}
							<span class="error-text">{status.error}</span>
						{:else}
							<span class="status-port">
								{status.healthy ? 'online' : 'starting…'} · :{status.port}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<Button onClick={() => void handleRestartServers()} disabled={restarting} icon="RefreshCw">
			{restarting ? 'Restarting…' : 'Restart servers'}
		</Button>
	</div>
	<div class="inference-section">
		<h3>Category classification</h3>
		<div class="field">
			<label for="category-topN">Top categories</label>
			<input
				id="category-topN"
				type="number"
				min="1"
				max="10"
				value={viewState.categoryTopN}
				oninput={(e) => {
					const v = Number((e.target as HTMLInputElement).value);
					viewState.categoryTopN = Math.min(10, Math.max(1, Math.trunc(isNaN(v) ? 3 : v)));
				}}
			/>
		</div>
		<div class="field">
			<label for="category-minSimilarity">Min similarity</label>
			<input
				id="category-minSimilarity"
				type="number"
				min="0"
				max="1"
				step="0.05"
				value={viewState.categoryMinSimilarity}
				oninput={(e) => {
					const v = Number((e.target as HTMLInputElement).value);
					viewState.categoryMinSimilarity = Math.min(1, Math.max(0, isNaN(v) ? 0.35 : v));
				}}
			/>
		</div>
		<Button onClick={handleRebuildCategoryIndex} disabled={rebuildingCategories} icon="RefreshCw">
			{rebuildingCategories ? 'Rebuilding…' : 'Rebuild category index'}
		</Button>
	</div>
	<div class="inference-section">
		<h3>Media</h3>
		<div class="field">
			<label for="media-thumbnail-reduction">Thumbnail Reduction</label>
			<input
				id="media-thumbnail-reduction"
				type="number"
				min="1"
				max="8"
				value={viewState.thumbnailReductionMagnitud}
				oninput={(e) => {
					const v = Number((e.target as HTMLInputElement).value);
					viewState.thumbnailReductionMagnitud = Math.min(
						8,
						Math.max(1, Math.trunc(isNaN(v) ? 1 : v))
					);
				}}
			/>
		</div>
	</div>
	<div class="inference-section">
		<h3>Scraping</h3>
		<div class="field checkbox-field">
			<label>
				<input type="checkbox" bind:checked={scrapStore.parallelFetch} />
				Parallel Fetch
			</label>
		</div>
		<div class="field">
			<label for="scrap-maxVideos">Max Videos</label>
			<input
				id="scrap-maxVideos"
				type="number"
				min="1"
				max="50"
				value={scrapStore.maxVideos}
				oninput={(e) => {
					const v = Number((e.target as HTMLInputElement).value);
					scrapStore.maxVideos = Math.min(50, Math.max(1, Math.trunc(isNaN(v) ? 5 : v)));
				}}
			/>
		</div>
		<div class="field">
			<label for="scrap-parallelAmount">Parallel Videos Amount</label>
			<input
				id="scrap-parallelAmount"
				type="number"
				min="1"
				max="10"
				value={scrapStore.parallelVideosAmount}
				disabled={!scrapStore.parallelFetch}
				oninput={(e) => {
					const v = Number((e.target as HTMLInputElement).value);
					scrapStore.parallelVideosAmount = Math.min(10, Math.max(1, Math.trunc(isNaN(v) ? 2 : v)));
				}}
			/>
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

	.inference-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: var(--radius-md);
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

	.field label,
	.field .field-label {
		font-weight: 600;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.8);
	}

	.field input {
		padding: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		background: rgba(0, 0, 0, 0.3);
		color: white;
	}

	.field input:focus {
		outline: none;
		border-color: var(--primary-color, #fae4c0);
	}

	.field input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.checkbox-field label {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.checkbox-field input[type='checkbox'] {
		width: 16px;
		height: 16px;
		padding: 0;
	}

	.dir-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.dir-row input {
		flex: 1;
		min-width: 0;
	}

	.error-text {
		margin: 0;
		font-size: 0.8rem;
		color: rgb(255, 140, 109);
		word-break: break-word;
	}

	.server-status {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
	}

	.server-status li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.status-name {
		text-transform: capitalize;
		color: rgba(255, 255, 255, 0.8);
	}

	.status-port {
		color: rgba(255, 255, 255, 0.6);
	}
</style>
