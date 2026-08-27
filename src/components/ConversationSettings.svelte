<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import Tooltip from '@/components/Tooltip.svelte';

	let localSystemPrompt = $state(viewState.conversationSystemPrompt);
	let localExtraUserPrompt = $state(viewState.conversationExtraUserPrompt);
	let localTemperature = $state(viewState.conversationTemperature);
	let localMaxTokens = $state(viewState.conversationMaxTokens);
	let localTopP = $state(viewState.conversationTopP);
	let localFrequencyPenalty = $state(viewState.conversationFrequencyPenalty);
	let localPresencePenalty = $state(viewState.conversationPresencePenalty);

	$effect(() => {
		viewState.conversationSystemPrompt = localSystemPrompt;
	});

	$effect(() => {
		viewState.conversationExtraUserPrompt = localExtraUserPrompt;
	});

	$effect(() => {
		viewState.conversationTemperature = localTemperature;
	});

	$effect(() => {
		viewState.conversationMaxTokens = localMaxTokens;
	});

	$effect(() => {
		viewState.conversationTopP = localTopP;
	});

	$effect(() => {
		viewState.conversationFrequencyPenalty = localFrequencyPenalty;
	});

	$effect(() => {
		viewState.conversationPresencePenalty = localPresencePenalty;
	});
</script>

<div class="panel">
	<h2>
		<Icon name="MessageSquare" size={30} color={viewState.primaryColor} />
		<span>Conversation Settings</span>
	</h2>

	<div class="field">
		<label class="field-label">System Prompt</label>
		<textarea
			class="field-textarea"
			rows={5}
			placeholder="Instructions for the assistant..."
			bind:value={localSystemPrompt}
		></textarea>
	</div>

	<div class="field">
		<label class="field-label">Extra User Prompt</label>
		<textarea
			class="field-textarea"
			rows={3}
			placeholder="Additional context prepended to each message..."
			bind:value={localExtraUserPrompt}
		></textarea>
	</div>

	<div class="field">
		<div class="field-row">
			<Tooltip
				content="Controls randomness. Lower values are more focused, higher values more creative."
				position="bottom"
			>
				<label class="field-label">Temperature</label>
			</Tooltip>
			<span class="field-value">{localTemperature}</span>
		</div>
		<input
			type="range"
			class="field-range"
			min={0}
			max={2}
			step={0.1}
			bind:value={localTemperature}
		/>
	</div>

	<div class="field">
		<div class="field-row">
			<Tooltip content="Maximum length of the response in tokens." position="bottom">
				<label class="field-label">Max Tokens</label>
			</Tooltip>
			<span class="field-value">{localMaxTokens}</span>
		</div>
		<input
			type="range"
			class="field-range"
			min={100}
			max={16000}
			step={100}
			bind:value={localMaxTokens}
		/>
	</div>

	<div class="field">
		<div class="field-row">
			<Tooltip
				content="Nucleus sampling. Lower values focus on more likely words."
				position="bottom"
			>
				<label class="field-label">Top P</label>
			</Tooltip>
			<span class="field-value">{localTopP}</span>
		</div>
		<input type="range" class="field-range" min={0} max={1} step={0.05} bind:value={localTopP} />
	</div>

	<div class="field">
		<div class="field-row">
			<Tooltip
				content="Reduces repetition of words based on how often they appear."
				position="bottom"
			>
				<label class="field-label">Frequency Penalty</label>
			</Tooltip>
			<span class="field-value">{localFrequencyPenalty}</span>
		</div>
		<input
			type="range"
			class="field-range"
			min={-2}
			max={2}
			step={0.1}
			bind:value={localFrequencyPenalty}
		/>
	</div>

	<div class="field">
		<div class="field-row">
			<Tooltip content="Encourages new topics by penalizing words already used." position="bottom">
				<label class="field-label">Presence Penalty</label>
			</Tooltip>
			<span class="field-value">{localPresencePenalty}</span>
		</div>
		<input
			type="range"
			class="field-range"
			min={-2}
			max={2}
			step={0.1}
			bind:value={localPresencePenalty}
		/>
	</div>
</div>

<style>
	.panel {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 3rem 1.5rem;
		border-radius: var(--radius-md);
		background-color: rgba(255, 255, 255, 0.02);
	}

	h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		color: var(--primary-color);
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		color: var(--primary-color);
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.field-textarea {
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: var(--radius-lg);
		background: transparent;
		box-shadow: inset 0 12px 14px rgba(var(--primary-color), 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 0.75rem;
		width: 100%;
		color: inherit;
		font-size: 0.9rem;
		font-family: inherit;
		resize: vertical;
		min-height: 80px;
	}

	.field-textarea:focus {
		box-shadow: inset 0 -1px 2px 0px var(--primary-color);
		transition: all 0.3s ease;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.field-value {
		color: var(--primary-color);
		font-size: 0.85rem;
		opacity: 0.9;
		font-variant-numeric: tabular-nums;
	}

	.field-range {
		width: 100%;
		height: 6px;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.1);
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.field-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--primary-color);
		cursor: pointer;
	}

	.field-range::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--primary-color);
		cursor: pointer;
		border: none;
	}
</style>
