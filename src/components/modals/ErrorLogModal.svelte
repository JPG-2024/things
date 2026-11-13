<script lang="ts">
	import { errorStore } from '@/stores/errorStore.svelte';
	import type { AppError } from '@/stores/errorStore.svelte';
	import Button from '@/components/inputs/Button.component.svelte';

	/** Newest first. */
	const ordered = $derived([...errorStore.errors].reverse());

	const featureLabels: Record<AppError['feature'], string> = {
		inference: 'inference',
		tts: 'tts',
		runner: 'runner',
		db: 'db',
		capture: 'capture',
		ui: 'ui'
	};

	function timeLabel(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString();
	}

	function detailText(entry: AppError): string {
		const details = entry.details;
		if (!details) return '';
		const lines: string[] = [];
		if (details.message) lines.push(details.message);
		for (const cause of details.causeChain) lines.push(`↳ ${cause}`);
		if (details.stack) lines.push('', details.stack);
		if (Object.keys(details.context).length > 0) {
			lines.push('', JSON.stringify(details.context, null, 2));
		}
		return lines.join('\n');
	}
</script>

<div class="error-log">
	<header class="error-log__header">
		<h2>Errors</h2>
		<Button onClick={() => errorStore.clear()} disabled={errorStore.errors.length === 0}>
			Clear all
		</Button>
	</header>

	{#if ordered.length === 0}
		<p class="error-log__empty">No errors logged this session.</p>
	{:else}
		<ul class="error-log__list">
			{#each ordered as entry (entry.id)}
				<li class="error-entry" class:error-entry--warn={entry.level === 'warn'}>
					<div class="error-entry__main">
						<span class="error-entry__tag">{featureLabels[entry.feature]}</span>
						<div class="error-entry__body">
							<p class="error-entry__message">{entry.userMessage}</p>
							<span class="error-entry__meta">
								{timeLabel(entry.timestamp)}{#if entry.count > 1}&nbsp;· ×{entry.count}{/if}
							</span>
						</div>
						<button
							type="button"
							class="error-entry__dismiss"
							onclick={() => errorStore.dismiss(entry.id)}
							aria-label="Dismiss error"
						>
							×
						</button>
					</div>
					{#if entry.details}
						<details class="error-entry__details">
							<summary>Details</summary>
							<pre>{detailText(entry)}</pre>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.error-log {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 2rem 2rem;
	}

	.error-log__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-right: 3rem;
	}

	.error-log__header h2 {
		margin: 0;
		font-family: var(--font-secondary);
		font-size: 1.1rem;
	}

	.error-log__empty {
		color: var(--gray-500);
		font-size: 0.85rem;
	}

	.error-log__list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.error-entry {
		border: 1px solid var(--article-border);
		border-radius: var(--radius-md);
		padding: 0.7rem 0.9rem;
	}

	.error-entry--warn {
		opacity: 0.75;
	}

	.error-entry__main {
		display: flex;
		align-items: flex-start;
		gap: 0.8rem;
	}

	.error-entry__tag {
		flex-shrink: 0;
		font-family: var(--font-secondary);
		font-size: 0.65rem;
		color: var(--gray-500);
		border: 1px solid var(--gray-700);
		border-radius: var(--radius-sm);
		padding: 0.15rem 0.45rem;
		margin-top: 0.1rem;
	}

	.error-entry__body {
		flex: 1;
		min-width: 0;
	}

	.error-entry__message {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.4;
		word-break: break-word;
	}

	.error-entry--warn .error-entry__message {
		color: var(--gray-200);
	}

	.error-entry__meta {
		font-family: var(--font-secondary);
		font-size: 0.65rem;
		color: var(--gray-500);
	}

	.error-entry__dismiss {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--gray-500);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.2rem;
	}

	.error-entry__dismiss:hover {
		color: var(--gray-100);
	}

	.error-entry__details {
		margin-top: 0.5rem;
	}

	.error-entry__details summary {
		cursor: pointer;
		font-family: var(--font-secondary);
		font-size: 0.7rem;
		color: var(--gray-500);
		user-select: none;
	}

	.error-entry__details pre {
		margin: 0.5rem 0 0;
		padding: 0.6rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		line-height: 1.4;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 240px;
		overflow-y: auto;
		color: var(--gray-200);
	}
</style>
