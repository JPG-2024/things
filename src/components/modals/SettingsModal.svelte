<script lang="ts">
	import Icon from '@/components/Icon.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import DatabaseManager from '@/components/DatabaseManager.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import CheckboxField from '@/components/inputs/fields/CheckboxField.component.svelte';
	import DropdownField from '@/components/inputs/fields/DropdownField.component.svelte';
	import FieldsRow from '@/components/inputs/fields/FieldsRow.component.svelte';
	import IconDropdownField from '@/components/inputs/fields/IconDropdownField.component.svelte';
	import NumberField from '@/components/inputs/fields/NumberField.component.svelte';
	import TextField from '@/components/inputs/fields/TextField.component.svelte';
	import ToggleField from '@/components/inputs/fields/ToggleField.component.svelte';
	import { viewState } from '../../stores/viewStore.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';
	import {
		CARD_COLUMN_MAX,
		CARD_COLUMN_MIN,
		CARD_ROW_MAX,
		CARD_ROW_MIN,
		CELL_WIDTH_MAX,
		CELL_WIDTH_MIN,
		WHEEL_CARDS_MAX,
		WHEEL_CARDS_MIN,
		type CardTab
	} from '@/constants';
	import { rebuildCategoryIndex } from '@/lib/utils/categoryEmbeddings';
	import { onMount } from 'svelte';
	import { open } from '@tauri-apps/plugin-dialog';
	import {
		ensureLlamaServers,
		listLlamaModels,
		reconcileLlamaModels,
		startLlamaServers,
		stopLlamaServers
	} from '@/lib/utils/llamaHealth';
	import { partitionModels, type LlamaModelEntry } from '@/lib/utils/llamaModels';
	import { MAX_ANALYSIS_DEPTH, MIN_ANALYSIS_DEPTH } from '@/runners/shared/analysisConstants';

	let rebuildingCategories = $state(false);
	let models = $state<LlamaModelEntry[]>([]);
	let modelsError = $state<string | null>(null);
	let loadingModels = $state(false);
	let showAllModels = $state(false);
	let restarting = $state(false);
	let starting = $state(false);
	let stopping = $state(false);

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

	async function handleStartServers() {
		if (starting) return;
		starting = true;
		try {
			await startLlamaServers();
		} finally {
			starting = false;
		}
	}

	async function handleStopServers() {
		if (stopping) return;
		stopping = true;
		try {
			await stopLlamaServers();
		} finally {
			stopping = false;
		}
	}

	// Enabling auto-start starts the servers right away; disabling only affects the
	// next app launch and never stops servers that are already running.
	function handleAutoStartChange(checked: boolean) {
		if (checked) void startLlamaServers();
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
		<Icon name="SlidersHorizontal" size={30} color={viewState.primaryColor} />
		Settings
	</h2>
	<IconDropdownField
		label="Language"
		options={languageOptions}
		iconSize={20}
		tooltip="Language used for generated text and labels."
		bind:value={viewState.language}
	/>
	<Spacer title="Openrouter" icon="Cloud">
		<div class="inference-section">
			<DropdownField
				label="AI Provider"
				options={providerOptions}
				tooltip="Where inference requests are sent."
				bind:value={viewState.aiProvider}
			/>
			<TextField
				label="AI URL"
				tooltip="Base URL of the OpenAI-compatible endpoint."
				bind:value={viewState.aiUrl}
			/>
			<TextField label="AI Model" bind:value={viewState.aiModel} />
		</div>
	</Spacer>
	<Spacer title="Llama.cpp" icon="Cpu" defaultOpen={false}>
		<div class="inference-section">
			<ToggleField
				label="Launch servers automatically"
				tooltip="Start the local llama.cpp servers when the app opens."
				bind:checked={viewState.llamaAutoStart}
				onChange={handleAutoStartChange}
			/>
			<TextField
				label="Models directory"
				placeholder="~/Downloads/models"
				bind:value={viewState.llamaModelsDir}
				onBlur={() => void refreshModels()}
			>
				{#snippet suffix()}
					<Button onClick={() => void handlePickModelsDir()} icon="FolderOpen">Browse</Button>
				{/snippet}
			</TextField>
			<FieldsRow columns={2}>
				<DropdownField
					label="Inference model"
					bind:value={viewState.llamaInferenceModel}
					options={inferenceOptions}
					placeholder={loadingModels ? 'Loading…' : 'Select a model'}
				/>
				<DropdownField
					label="Embeddings model"
					bind:value={viewState.llamaEmbeddingsModel}
					options={embeddingsOptions}
					placeholder={loadingModels ? 'Loading…' : 'Select a model'}
				/>
			</FieldsRow>
			<FieldsRow columns={2}>
				<NumberField
					label="Inference port"
					min={1024}
					max={65535}
					bind:value={viewState.llamaInferencePort}
				/>
				<NumberField
					label="Embeddings port"
					min={1024}
					max={65535}
					bind:value={viewState.llamaEmbeddingsPort}
				/>
			</FieldsRow>
			<FieldsRow columns={2}>
				<NumberField
					label="Inference context"
					min={512}
					max={131072}
					tooltip="Maximum context in tokens. Smaller values use less KV-cache RAM, but prompts longer than this get truncated. Applies after restarting the servers."
					bind:value={viewState.llamaInferenceCtxSize}
				/>
				<NumberField
					label="Prompt cache (MB)"
					min={0}
					max={65536}
					tooltip="RAM reserved to reuse already processed prompts (0 disables it). Lower values use less RAM but repeated long prompts get re-processed. Applies after restarting the servers."
					bind:value={viewState.llamaCacheRamMb}
				/>
			</FieldsRow>
			<CheckboxField label="Show all models" bind:checked={showAllModels} />
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
								<span class="status-port" class:up={status.healthy}>
									{status.running ? (status.healthy ? 'online' : 'starting…') : 'stopped'} · :{status.port}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<div class="server-actions">
				<Button
					onClick={() => void handleStartServers()}
					disabled={starting || stopping || restarting}
					icon="Play"
				>
					{starting ? 'Starting…' : 'Start'}
				</Button>
				<Button
					onClick={() => void handleStopServers()}
					disabled={starting || stopping || restarting}
					icon="Square"
				>
					{stopping ? 'Stopping…' : 'Stop'}
				</Button>
				<Button
					onClick={() => void handleRestartServers()}
					disabled={starting || stopping || restarting}
					icon="RefreshCw"
				>
					{restarting ? 'Restarting…' : 'Restart servers'}
				</Button>
			</div>
		</div>
	</Spacer>
	<Spacer title="Analysis" icon="ScanSearch">
		<div class="inference-section">
			<NumberField
				label="Default depth"
				min={MIN_ANALYSIS_DEPTH}
				max={MAX_ANALYSIS_DEPTH}
				tooltip="Starting depth for new topic-analysis tasks. Each level splits the content into more windows (÷1, ÷2, ÷4, ÷8, ÷16) and asks each window for topics."
				bind:value={viewState.analysisDepth}
			/>
		</div>
	</Spacer>
	<Spacer title="Category classification" icon="Tags">
		<div class="inference-section">
			<FieldsRow columns={3}>
				<NumberField
					label="Top categories"
					min={1}
					max={10}
					tooltip="How many categories are considered when classifying an article."
					bind:value={viewState.categoryTopN}
				/>
				<NumberField
					label="Min similarity"
					min={0}
					max={1}
					step={0.05}
					integer={false}
					precision={2}
					tooltip="Minimum cosine similarity between the article and a category's fed examples required to assign it."
					bind:value={viewState.categoryMinSimilarity}
				/>
				<NumberField
					label="Min margin"
					min={0}
					max={1}
					step={0.01}
					integer={false}
					precision={2}
					tooltip="Minimum gap between the best and second category. Below it the result is ambiguous and nothing is assigned."
					bind:value={viewState.categoryMargin}
				/>
			</FieldsRow>
			<Button onClick={handleRebuildCategoryIndex} disabled={rebuildingCategories} icon="RefreshCw">
				{rebuildingCategories ? 'Rebuilding…' : 'Rebuild category index'}
			</Button>
		</div>
	</Spacer>
	<Spacer title="Media" icon="Image">
		<div class="inference-section">
			<NumberField
				label="Thumbnail Reduction"
				min={1}
				max={8}
				tooltip="Downscale factor applied to generated thumbnails."
				bind:value={viewState.thumbnailReductionMagnitud}
			/>
		</div>
	</Spacer>
	<Spacer title="Databases" icon="Database">
		<div class="inference-section">
			<DatabaseManager />
		</div>
	</Spacer>
	<Spacer title="Cards" icon="LayoutGrid">
		<div class="inference-section">
			{#snippet cardLayoutFields(tab: CardTab, title: string)}
				<div class="card-layout-group">
					<span class="card-layout-title">{title}</span>
					<FieldsRow columns={4}>
						<NumberField
							label="Columnas"
							min={CARD_COLUMN_MIN}
							max={CARD_COLUMN_MAX}
							value={viewState.cardLayout[tab].columns}
							onCommit={(value) => viewState.setCardLayout(tab, { columns: value })}
						/>
						<NumberField
							label="Filas"
							min={CARD_ROW_MIN}
							max={CARD_ROW_MAX}
							value={viewState.cardLayout[tab].rows}
							onCommit={(value) => viewState.setCardLayout(tab, { rows: value })}
						/>
						<NumberField
							label="Wheel filas"
							min={WHEEL_CARDS_MIN}
							max={WHEEL_CARDS_MAX}
							tooltip="Cards apiladas verticalmente por columna del wheel."
							value={viewState.cardLayout[tab].cardsPerColumn}
							onCommit={(value) => viewState.setCardLayout(tab, { cardsPerColumn: value })}
						/>
						<NumberField
							label="Cell width (px)"
							min={CELL_WIDTH_MIN}
							max={CELL_WIDTH_MAX}
							tooltip="Ancho objetivo de cada thumbnail; con él se calcula el ancho de la card."
							value={viewState.cardLayout[tab].cellWidth}
							onCommit={(value) => viewState.setCardLayout(tab, { cellWidth: value })}
						/>
					</FieldsRow>
					<p class="cards-helper">
						{viewState.cardLayout[tab].columns} columnas × {viewState.cardLayout[tab].rows} filas = {viewState
							.cardLayout[tab].columns * viewState.cardLayout[tab].rows} artículos por card
					</p>
				</div>
			{/snippet}
			{@render cardLayoutFields('profiles', 'Profiles')}
			{@render cardLayoutFields('domains', 'Domains')}
			{@render cardLayoutFields('categories', 'Categories')}
		</div>
	</Spacer>
	<Spacer title="Scraping" icon="Globe">
		<div class="inference-section">
			<CheckboxField label="Parallel Fetch" bind:checked={scrapStore.parallelFetch} />
			<FieldsRow columns={2}>
				<NumberField label="Max Videos" min={1} max={50} bind:value={scrapStore.maxVideos} />
				<NumberField
					label="Parallel Videos Amount"
					min={1}
					max={10}
					disabled={!scrapStore.parallelFetch}
					tooltip="Enabled only when Parallel Fetch is on."
					bind:value={scrapStore.parallelVideosAmount}
				/>
			</FieldsRow>
		</div>
	</Spacer>
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
		font-family: var(--font-secondary);
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

	.card-layout-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.card-layout-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
	}

	.cards-helper {
		margin: 0;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.45);
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

	.status-port.up {
		color: rgb(140, 220, 160);
	}

	.server-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
