<script lang="ts">
	import Icon from '@/components/Icon.svelte';
	import IconDropdown from '../inputs/IconDropdown.component.svelte';
	import { viewState } from '../../stores/viewStore.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';

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
					scrapStore.parallelVideosAmount = Math.min(
						10,
						Math.max(1, Math.trunc(isNaN(v) ? 2 : v))
					);
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

	.field label {
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
</style>
