<script lang="ts">
	import { fly } from 'svelte/transition';
	import { loadingStore, type LoadingEntry } from '@/stores/loadingStore.svelte';

	const backend = $derived(loadingStore.backendEntries);
	const frontend = $derived(loadingStore.frontendEntries);
</script>

<!-- Live work only: the store removes entries on finish/fail/remove, so the
	float disappears by itself when the queue drains. Informational, never
	interactive: pointer-events stay off so it cannot block the UI below. -->
{#if loadingStore.busy}
	<div class="loading-status" role="status" aria-live="polite" in:fly={{ y: 20, duration: 200 }}>
		{#snippet section(title: string, entries: LoadingEntry[])}
			{#if entries.length > 0}
				<div class="loading-status__section">
					<span class="loading-status__title">{title}</span>
					{#each entries as entry (entry.id)}
						<div class="loading-status__entry">
							<span
								class="loading-status__dot"
								class:loading-status__dot--pending={entry.status === 'pending'}
							></span>
							<span class="loading-status__label" title={entry.label}>{entry.label}</span>
							{#if entry.message}
								<span class="loading-status__message">{entry.message}</span>
							{/if}
							{#if entry.progress}
								<span class="loading-status__progress">
									{entry.progress.done}/{entry.progress.total}
								</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/snippet}

		{@render section('backend', backend)}
		{@render section('frontend', frontend)}
	</div>
{/if}

<style>
	.loading-status {
		position: fixed;
		left: 50%;
		bottom: var(--float-anchor-bottom);
		transform: translateX(-50%);
		/* Above the app, below the modal layer (same layer as ErrorCenter). */
		z-index: 9000;
		display: flex;
		gap: 1.2rem;
		max-width: min(720px, calc(100vw - 3rem));
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--article-border);
		border-radius: var(--radius-md);
		background: rgba(0, 0, 0, 0.9);
		font-family: var(--font-secondary);
		font-size: 0.7rem;
		pointer-events: none;
	}

	.loading-status__section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.loading-status__title {
		color: var(--gray-500);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.6rem;
	}

	.loading-status__entry {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		color: var(--gray-100);
	}

	.loading-status__dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--primary-color);
		animation: loading-pulse 1.2s ease-in-out infinite;
	}

	.loading-status__dot--pending {
		background: var(--gray-500);
		animation: none;
	}

	.loading-status__label {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.loading-status__message {
		color: var(--gray-300);
		white-space: nowrap;
	}

	.loading-status__progress {
		color: var(--primary-color);
		white-space: nowrap;
	}

	@keyframes loading-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
</style>
