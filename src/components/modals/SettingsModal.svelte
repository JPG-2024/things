<script lang="ts">
	import Icon from '@/components/Icon.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import DatabaseManager from '@/components/DatabaseManager.svelte';
	import GlobalShortcutSettings from '@/components/GlobalShortcutSettings.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import CheckboxField from '@/components/inputs/fields/CheckboxField.component.svelte';
	import DropdownField from '@/components/inputs/fields/DropdownField.component.svelte';
	import FieldsRow from '@/components/inputs/fields/FieldsRow.component.svelte';
	import NumberField from '@/components/inputs/fields/NumberField.component.svelte';
	import TextField from '@/components/inputs/fields/TextField.component.svelte';
	import ToggleField from '@/components/inputs/fields/ToggleField.component.svelte';
	import { viewState } from '../../stores/viewStore.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
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
	import type { ExternalServiceName } from '@/lib/utils/externalServicesHealth';
	import { partitionModels, type LlamaModelEntry } from '@/lib/utils/llamaModels';
	import { WINDOW_DIVISOR_LADDER } from '@/lib/utils/windowAnalysis';
	import {
		getTTSApiKey,
		setTTSApiKey,
		clearTTSApiKey,
		validateTTSApiKey
	} from '@/lib/utils/ttsAuth';

	let rebuildingCategories = $state(false);
	let models = $state<LlamaModelEntry[]>([]);
	let modelsError = $state<string | null>(null);
	let loadingModels = $state(false);
	let showAllModels = $state(false);
	let restarting = $state(false);
	let starting = $state(false);
	let stopping = $state(false);
	let ttsApiKey = $state('');
	let ttsAuthStatus = $state<{ valid: boolean; error?: string } | null>(null);
	let validatingTTSKey = $state(false);

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

	/** Dot color: `up` green, `warn` amber (starting / auth required), `down` red. */
	type DotTone = 'up' | 'warn' | 'down';
	/** Status text color: `ok` green, `warn` amber, `error` red, `muted` gray. */
	type StatusTone = 'ok' | 'warn' | 'error' | 'muted';

	interface ServiceHealthRow {
		key: string;
		label: string;
		dot: DotTone;
		status: string;
		statusTone: StatusTone;
		/** Configured model file; only present for the local llama.cpp services. */
		model?: string;
	}

	const LLAMA_SERVICES = [
		{ key: 'inference', label: 'Inference service' },
		{ key: 'embeddings', label: 'Embeddings service' }
	] as const;

	const EXTERNAL_SERVICES = [
		{ key: 'scrap', label: 'Scrap service' },
		{ key: 'tts', label: 'TTS service' },
		{ key: 'whisper', label: 'Whisper service' }
	] as const;

	function externalServiceUp(name: ExternalServiceName): boolean {
		switch (name) {
			case 'scrap':
				return viewState.scrapServiceUp;
			case 'tts':
				return viewState.ttsServiceUp;
			case 'whisper':
				return viewState.whisperServiceUp;
		}
	}

	/**
	 * Health rows rendered at the top of the modal: HTTP flags for the dot plus
	 * `llamaServersStatus` for the port/starting/stopped detail and the error.
	 */
	const llamaHealthRows = $derived(
		LLAMA_SERVICES.map(({ key, label }): ServiceHealthRow => {
			const up = key === 'inference' ? viewState.inferenceServiceUp : viewState.embeddingsServiceUp;
			const model =
				key === 'inference' ? viewState.llamaInferenceModel : viewState.llamaEmbeddingsModel;
			const status = viewState.llamaServersStatus.find((entry) => entry.name === key);
			if (status?.error) {
				return { key, label, model, dot: 'down', status: status.error, statusTone: 'error' };
			}
			if (status?.healthy) {
				return {
					key,
					label,
					model,
					dot: 'up',
					status: `online · :${status.port}`,
					statusTone: 'ok'
				};
			}
			if (status?.running) {
				return {
					key,
					label,
					model,
					dot: 'warn',
					status: `starting… · :${status.port}`,
					statusTone: 'warn'
				};
			}
			if (status) {
				return {
					key,
					label,
					model,
					dot: 'down',
					status: `stopped · :${status.port}`,
					statusTone: 'muted'
				};
			}
			return {
				key,
				label,
				model,
				dot: up ? 'up' : 'down',
				status: up ? 'online' : 'offline',
				statusTone: up ? 'ok' : 'error'
			};
		})
	);

	const externalHealthRows = $derived(
		EXTERNAL_SERVICES.map(({ key, label }): ServiceHealthRow => {
			const up = externalServiceUp(key);
			if (key === 'tts' && up && viewState.ttsAuthRequired) {
				return { key, label, dot: 'warn', status: 'online · auth required', statusTone: 'warn' };
			}
			return {
				key,
				label,
				dot: up ? 'up' : 'down',
				status: up ? 'online' : 'offline',
				statusTone: up ? 'ok' : 'error'
			};
		})
	);

	const healthRows = $derived([...llamaHealthRows, ...externalHealthRows]);

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
		void getTTSApiKey().then((key) => {
			if (key) ttsApiKey = key;
		});
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

	async function handleSaveTTSKey() {
		const key = ttsApiKey.trim();
		if (key) {
			await setTTSApiKey(key);
		} else {
			await clearTTSApiKey();
		}
		ttsAuthStatus = null;
		viewState.ttsAuthRequired = !key;
		if (key) {
			// The boot loaders bailed out on the pre-key 401 (or hold a list
			// fetched with the previous key), so refill from the fresh key.
			void ttsState.initVoiceProfiles(true);
		}
	}

	async function handleValidateKey() {
		validatingTTSKey = true;
		ttsAuthStatus = await validateTTSApiKey(ttsApiKey.trim() || undefined);
		validatingTTSKey = false;
	}

	const providerOptions = [
		{ label: 'Llama', value: 'llama' },
		{ label: 'OpenRouter', value: 'openrouter' }
	];

	const windowLevelOptions = WINDOW_DIVISOR_LADDER.map((divisor, index) => ({
		label: `÷${divisor}`,
		value: String(index)
	}));

	// The raw text of the field: the store keeps the parsed list, but the
	// input needs the text the user is typing (a trailing comma included).
	let embeddingFieldsText = $state(viewState.embeddingFields.join(', '));

	function handleEmbeddingFields(value: string): void {
		embeddingFieldsText = value;
		viewState.embeddingFields = value
			.split(',')
			.map((field) => field.trim())
			.filter(Boolean);
	}

	const languageOptions = [
		{ label: 'Spanish', value: 'es' },
		{ label: 'English', value: 'en' },
		{ label: 'French', value: 'fr' },
		{ label: 'German', value: 'de' },
		{ label: 'Portuguese', value: 'pt' },
		{ label: 'Italian', value: 'it' },
		{ label: 'Japanese', value: 'ja' }
	];
</script>

<div class="drawer-inner">
	<h2>
		<Icon name="SlidersHorizontal" size={30} color={viewState.primaryColor} />
		Settings
	</h2>
	<DropdownField
		label="Language"
		options={languageOptions}
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
			<section class="services-block" aria-label="Service health">
				<span class="services-title">Services</span>
				<ul class="services-list">
					{#each healthRows as row (row.key)}
						<li class="service-row">
							<span class="health-dot" class:up={row.dot === 'up'} class:warn={row.dot === 'warn'}
							></span>
							<div class="service-main">
								<span class="service-label">{row.label}</span>
								{#if row.model !== undefined}
									<span
										class="service-model"
										class:empty={!row.model}
										title={row.model || 'No model selected'}
									>
										{row.model || 'no model selected'}
									</span>
								{/if}
							</div>
							<span
								class="service-status"
								class:ok={row.statusTone === 'ok'}
								class:warn={row.statusTone === 'warn'}
								class:error={row.statusTone === 'error'}
							>
								{row.status}
							</span>
						</li>
					{/each}
				</ul>
			</section>
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
			<ToggleField
				label="Reasoning"
				tooltip="Pass --reasoning on/off to the inference server. Turning it off disables model thinking; applies after restarting the servers."
				bind:checked={viewState.llamaReasoning}
			/>
			<CheckboxField label="Show all models" bind:checked={showAllModels} />
			{#if modelsError}
				<p class="error-text">{modelsError}</p>
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
			<DropdownField
				label="Window level"
				options={windowLevelOptions}
				tooltip="How many windows the article is split into (÷1, ÷2, ÷4, ÷8, ÷16). One LLM call per window. Applies to raw text and YouTube videos; web articles split by markdown headings."
				value={String(viewState.windowLevel)}
				onChange={(v) => (viewState.windowLevel = Number(v))}
			/>
		</div>
	</Spacer>
	<Spacer title="Embeddings" icon="FileDigit">
		<div class="inference-section">
			<TextField
				label="Embedding fields"
				tooltip="Comma-separated list of analysis fields to index. Each field is embedded in its own LanceDB table, named after the field."
				value={embeddingFieldsText}
				onChange={handleEmbeddingFields}
			/>
			<CheckboxField
				label="Store chunk text"
				tooltip="Store the embedded text next to each vector so search results can show it without reading the raw content."
				bind:checked={viewState.embeddingStoreChunkText}
			/>
		</div>
	</Spacer>
	<Spacer title="Chat context" icon="FileDigit">
		<div class="inference-section">
			<FieldsRow columns={2}>
				<CheckboxField
					label="Search embeddings"
					tooltip="Retrieve chunks from the embedding tables and use them as context for chat answers."
					bind:checked={viewState.chatSearchEnabled}
				/>
				<TextField
					label="Embedding tables"
					tooltip="Comma-separated LanceDB tables (task ids) the chat searches. A table that was never indexed is skipped."
					bind:value={viewState.chatSearchTables}
				/>
			</FieldsRow>
			<FieldsRow columns={2}>
				<NumberField
					label="Max sources"
					min={1}
					max={20}
					tooltip="How many retrieved chunks (grouped into source articles) a chat answer may show."
					bind:value={viewState.chatSearchMaxResults}
				/>
				<NumberField
					label="Max distance"
					min={0}
					max={2}
					step={0.05}
					integer={false}
					precision={2}
					tooltip="L2 distance cutoff for retrieved chunks. Lower = stricter (only very similar chunks)."
					bind:value={viewState.chatSearchMaxDistance}
				/>
			</FieldsRow>
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
	<Spacer title="Global shortcut" icon="Keyboard">
		<div class="inference-section">
			<GlobalShortcutSettings />
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
	<Spacer title="Filters" icon="Filter">
		<div class="inference-section">
			<NumberField
				label="Panel width"
				min={240}
				max={720}
				step={20}
				tooltip="Width in pixels of the filters left panel column."
				bind:value={viewState.filtersPanelWidth}
			/>
		</div>
	</Spacer>
	<Spacer title="Scraping" icon="Globe">
		<div class="inference-section">
			<NumberField
				label="Max Videos"
				min={1}
				max={50}
				tooltip="Most missing videos captured per profile refresh."
				bind:value={scrapStore.maxVideos}
			/>
		</div>
	</Spacer>
	<Spacer title="TTS Authentication" icon="Key" defaultOpen={false}>
		<div class="inference-section">
			<TextField
				label="API Key"
				type="password"
				placeholder="sk-..."
				bind:value={ttsApiKey}
				tooltip="API key for the TTS service. Stored in the local settings file."
			>
				{#snippet suffix()}
					<Button onClick={handleValidateKey} disabled={validatingTTSKey || !ttsApiKey}>
						{validatingTTSKey ? 'Validating...' : 'Validate'}
					</Button>
				{/snippet}
			</TextField>
			{#if ttsAuthStatus}
				<p
					class="auth-status"
					class:success={ttsAuthStatus.valid}
					class:error={!ttsAuthStatus.valid}
				>
					{ttsAuthStatus.valid ? '✓ API key is valid' : `✗ ${ttsAuthStatus.error}`}
				</p>
			{/if}
			<div class="server-actions">
				<Button onClick={handleSaveTTSKey} icon="Save">Save</Button>
			</div>
			<p class="helper-text">API key for the TTS service. Stored in the local settings file.</p>
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

	.services-block {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.services-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
	}

	.services-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.service-row {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.health-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		margin-top: 0.3rem;
		flex-shrink: 0;
		background: rgb(255, 140, 109);
		transition:
			background 0.2s,
			box-shadow 0.2s;
	}

	.health-dot.up {
		background: rgb(120, 220, 140);
		box-shadow: 0 0 6px rgb(120, 220, 140);
	}

	.health-dot.warn {
		background: rgb(255, 200, 100);
		box-shadow: 0 0 6px rgb(255, 200, 100);
	}

	.service-main {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		min-width: 0;
	}

	.service-label {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.85);
	}

	.service-model {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.45);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.service-model.empty {
		color: rgb(255, 200, 100);
		font-style: italic;
	}

	.service-status {
		flex-shrink: 0;
		max-width: 55%;
		font-size: 0.8rem;
		text-align: right;
		word-break: break-word;
		color: rgba(255, 255, 255, 0.6);
	}

	.service-status.ok {
		color: rgb(140, 220, 160);
	}

	.service-status.warn {
		color: rgb(255, 200, 100);
	}

	.service-status.error {
		color: rgb(255, 140, 109);
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

	.server-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.auth-status {
		margin: 0;
		font-size: 0.85rem;
		padding: 0.5rem;
		border-radius: 0.375rem;
		word-break: break-word;
	}

	.auth-status.success {
		color: rgb(140, 220, 160);
		background: rgba(140, 220, 160, 0.1);
	}

	.auth-status.error {
		color: rgb(255, 140, 109);
		background: rgba(255, 140, 109, 0.1);
	}

	.helper-text {
		margin: 0;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}
</style>
