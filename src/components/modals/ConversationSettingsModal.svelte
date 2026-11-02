<script lang="ts">
	import Modal from '@/components/Modal.svelte';
	import Textarea from '@/components/inputs/Textarea.component.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import {
		viewState,
		resolveConversationSystemPrompt,
		CONVERSATION_SYSTEM_PROMPT_DEFAULT,
		CONVERSATION_SAMPLING_DEFAULTS
	} from '@/stores/viewStore.svelte';

	type Props = {
		show?: boolean;
		onClose: () => void;
	};

	let { show = false, onClose }: Props = $props();

	/**
	 * The conversation editor: the system prompt that defines the assistant
	 * response style, the extra user prompt prepended in voice conversations,
	 * and the sampling params of every request. Values live on `viewState`, so
	 * edits apply to the next message and persist through `settingsStore`.
	 */

	const systemCustomized = $derived(
		resolveConversationSystemPrompt(viewState.conversationSystemPrompt) !==
			CONVERSATION_SYSTEM_PROMPT_DEFAULT
	);

	const completionCustomized = $derived(
		viewState.conversationTemperature !== CONVERSATION_SAMPLING_DEFAULTS.temperature ||
			viewState.conversationMaxTokens !== CONVERSATION_SAMPLING_DEFAULTS.maxTokens ||
			viewState.conversationTopP !== CONVERSATION_SAMPLING_DEFAULTS.topP ||
			viewState.conversationFrequencyPenalty !== CONVERSATION_SAMPLING_DEFAULTS.frequencyPenalty ||
			viewState.conversationPresencePenalty !== CONVERSATION_SAMPLING_DEFAULTS.presencePenalty
	);

	function resetSystemPrompt() {
		viewState.conversationSystemPrompt = '';
	}

	function resetCompletion() {
		viewState.conversationTemperature = CONVERSATION_SAMPLING_DEFAULTS.temperature;
		viewState.conversationMaxTokens = CONVERSATION_SAMPLING_DEFAULTS.maxTokens;
		viewState.conversationTopP = CONVERSATION_SAMPLING_DEFAULTS.topP;
		viewState.conversationFrequencyPenalty = CONVERSATION_SAMPLING_DEFAULTS.frequencyPenalty;
		viewState.conversationPresencePenalty = CONVERSATION_SAMPLING_DEFAULTS.presencePenalty;
	}
</script>

<Modal {show} {onClose}>
	<div class="conversation-modal">
		<header class="conversation-header">
			<h2>Conversation</h2>
			<p class="conversation-note">
				Edits apply to the next message and are saved automatically. Clear a field to go back to its
				default.
			</p>
		</header>

		<Spacer title="Style" icon="ScrollText" defaultOpen={true}>
			<div class="style-fields">
				<section class="prompt-field" class:customized={systemCustomized}>
					<div class="prompt-heading">
						<span class="prompt-label">System prompt</span>
						{#if systemCustomized}
							<button type="button" class="reset-btn" onclick={resetSystemPrompt}>reset</button>
						{/if}
					</div>
					<p class="prompt-hint">Rules the assistant follows in every reply.</p>
					<Textarea
						rows={6}
						bind:value={viewState.conversationSystemPrompt}
						placeholder={CONVERSATION_SYSTEM_PROMPT_DEFAULT}
					/>
				</section>

				<section
					class="prompt-field"
					class:customized={viewState.conversationExtraUserPrompt !== ''}
				>
					<div class="prompt-heading">
						<span class="prompt-label">Extra user prompt</span>
						{#if viewState.conversationExtraUserPrompt !== ''}
							<button
								type="button"
								class="reset-btn"
								onclick={() => (viewState.conversationExtraUserPrompt = '')}
							>
								reset
							</button>
						{/if}
					</div>
					<p class="prompt-hint">
						Prepended to every transcribed message in the voice conversation mode.
					</p>
					<Textarea
						rows={3}
						bind:value={viewState.conversationExtraUserPrompt}
						placeholder="Additional context prepended to each message..."
					/>
				</section>
			</div>
		</Spacer>

		<Spacer title="Completion" icon="SlidersHorizontal" defaultOpen={true}>
			{#if completionCustomized}
				<div class="completion-head">
					<button type="button" class="reset-btn" onclick={resetCompletion}>reset</button>
				</div>
			{/if}
			<div class="completion-grid">
				<RangeSelector
					id="conversation-temperature"
					label="Temperature"
					bind:value={viewState.conversationTemperature}
					min={0}
					max={2}
					step={0.1}
					format={(v) => v.toFixed(1)}
				/>
				<RangeSelector
					id="conversation-max-tokens"
					label="Max tokens"
					bind:value={viewState.conversationMaxTokens}
					min={100}
					max={16000}
					step={100}
					format={(v) => v.toString()}
				/>
				<RangeSelector
					id="conversation-top-p"
					label="Top P"
					bind:value={viewState.conversationTopP}
					min={0}
					max={1}
					step={0.05}
					format={(v) => v.toFixed(2)}
				/>
				<RangeSelector
					id="conversation-frequency-penalty"
					label="Frequency penalty"
					bind:value={viewState.conversationFrequencyPenalty}
					min={-2}
					max={2}
					step={0.1}
					format={(v) => v.toFixed(1)}
				/>
				<RangeSelector
					id="conversation-presence-penalty"
					label="Presence penalty"
					bind:value={viewState.conversationPresencePenalty}
					min={-2}
					max={2}
					step={0.1}
					format={(v) => v.toFixed(1)}
				/>
			</div>
		</Spacer>
	</div>
</Modal>

<style>
	.conversation-modal {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 0 1rem;
		width: 100%;
	}

	.conversation-header h2 {
		margin: 0 0 0.5rem;
		font-family: var(--font-secondary);
		font-size: 1.05rem;
		color: var(--primary-color);
		text-transform: capitalize;
	}

	.conversation-note {
		margin: 0;
		font-size: 0.78rem;
		opacity: 0.65;
		line-height: 1.5;
	}

	.style-fields {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.prompt-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.prompt-heading {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.prompt-label {
		font-family: var(--font-secondary);
		font-size: 0.82rem;
		font-weight: 600;
		opacity: 0.9;
	}

	.prompt-field.customized .prompt-label {
		color: var(--primary-color);
		opacity: 1;
	}

	.prompt-hint {
		margin: 0;
		font-size: 0.72rem;
		opacity: 0.5;
	}

	.reset-btn {
		margin-left: auto;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-size: 0.7rem;
		opacity: 0.6;
		color: var(--primary-color);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.reset-btn:hover {
		opacity: 1;
	}

	.completion-head {
		display: flex;
		margin-bottom: 0.5rem;
	}

	/* Same two-column layout as the VoiceSettingsModal synthesis blocks: an
	 * odd trailing control fills the row instead of leaving a hole. */
	.completion-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.25rem 2.2rem;
		align-items: start;
	}

	.completion-grid > :global(:last-child:nth-child(odd)) {
		grid-column: 1 / -1;
	}

	/* The dialog itself caps at 900px, so react to its width rather than the
	 * viewport: below 600px two columns would be too narrow and labels wrap. */
	@container (max-width: 600px) {
		.completion-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
