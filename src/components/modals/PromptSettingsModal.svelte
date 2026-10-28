<script lang="ts">
	import Modal from '@/components/Modal.svelte';
	import Textarea from '@/components/inputs/Textarea.component.svelte';
	import { promptState, PROMPT_DEFAULTS, type PromptKey } from '@/stores/promptStore.svelte';

	type Props = {
		show?: boolean;
		onClose: () => void;
	};

	let { show = false, onClose }: Props = $props();

	/**
	 * The three editable messages of the summariser, in the order the pipeline
	 * runs them: one system for every window, the instruction of a single
	 * window, and the instruction that merges them.
	 */
	const fields: { key: PromptKey; label: string; hint: string }[] = [
		{
			key: 'windowSystem',
			label: 'System prompt (all windows)',
			hint: 'Role given to every window call, including the final merge.'
		},
		{
			key: 'windowUser',
			label: 'Window instruction',
			hint: 'Asked for each window; the window text is appended below it.'
		},
		{
			key: 'finalUser',
			label: 'Final result instruction',
			hint: 'Asked once over the joined window summaries.'
		}
	];
</script>

<Modal {show} {onClose}>
	<div class="prompts-modal">
		<header class="prompts-header">
			<h2>Prompts</h2>
			<p class="prompts-note">
				Edits apply to the next run and are saved automatically. Clear a field to go back to its
				default. The response language is added to the message from Settings, never here.
			</p>
		</header>

		<div class="prompts-fields">
			{#each fields as field (field.key)}
				<section class="prompt-field" class:customized={promptState.isCustomized(field.key)}>
					<div class="prompt-heading">
						<span class="prompt-label">{field.label}</span>
						{#if promptState.isCustomized(field.key)}
							<button
								type="button"
								class="reset-btn"
								onclick={() => promptState.set(field.key, '')}
							>
								reset
							</button>
						{/if}
					</div>
					<p class="prompt-hint">{field.hint}</p>
					<Textarea
						rows={4}
						bind:value={promptState[field.key]}
						placeholder={PROMPT_DEFAULTS[field.key]}
					/>
				</section>
			{/each}
		</div>
	</div>
</Modal>

<style>
	.prompts-modal {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 0 1rem;
		width: min(46rem, 88vw);
	}

	.prompts-header h2 {
		margin: 0 0 0.5rem;
		font-family: var(--font-secondary);
		font-size: 1.05rem;
		color: var(--primary-color);
		text-transform: capitalize;
	}

	.prompts-note {
		margin: 0;
		font-size: 0.78rem;
		opacity: 0.65;
		line-height: 1.5;
	}

	.prompts-fields {
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
</style>
