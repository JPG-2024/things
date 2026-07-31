<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import type { RecursiveContentResult } from '@/runners/shared/taskFactories';
	import DetailsPanel from '@/components/DetailsPanel.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void runId;
	void componentProps;

	let showRaw = $state(false);

	const recursiveData = $derived.by((): RecursiveContentResult | null => {
		const data = task.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		const chunks = data.chunks;
		const rawChunks = data.rawChunks;
		const finalResponse = data.finalResponse;
		if (!Array.isArray(chunks) || !Array.isArray(rawChunks) || typeof finalResponse !== 'string')
			return null;
		return { chunks, rawChunks, finalResponse };
	});

	const chunks = $derived(recursiveData?.chunks ?? []);
	const rawChunks = $derived(recursiveData?.rawChunks ?? []);
	const finalResponse = $derived(recursiveData?.finalResponse ?? '');

	function chunkHint(text: string): string {
		return text.length > 80 ? text.slice(0, 80) + '…' : text;
	}
</script>

{#if recursiveData}
	<div class="recursive-shell">
		<div class="view-toggle">
			<button
				class="toggle-btn"
				class:active={!showRaw}
				onclick={() => (showRaw = false)}
			>
				Summary
			</button>
			<button
				class="toggle-btn"
				class:active={showRaw}
				onclick={() => (showRaw = true)}
			>
				Raw
			</button>
		</div>

		{#if chunks.length > 0}
			<div class="chunks-stack">
				{#each chunks as chunk, i (i)}
					<DetailsPanel
						label="Chunk {i + 1}"
						hint={chunkHint(showRaw ? (rawChunks[i] ?? '') : chunk)}
					>
						<MarkdownRenderer content={showRaw ? (rawChunks[i] ?? '') : chunk} />
					</DetailsPanel>
				{/each}
			</div>
		{/if}

		{#if finalResponse && !showRaw}
			<div class="final-response">
				<MarkdownRenderer content={finalResponse} />
			</div>
		{/if}
	</div>
{/if}

<style>
	.recursive-shell {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.view-toggle {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 6px;
		width: fit-content;
	}

	.toggle-btn {
		padding: 0.4rem 0.9rem;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		opacity: 0.6;
		transition:
			background 0.2s ease,
			opacity 0.2s ease;
	}

	.toggle-btn:hover {
		opacity: 0.85;
	}

	.toggle-btn.active {
		background: rgba(255, 255, 255, 0.1);
		opacity: 1;
	}

	.chunks-stack {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.final-response {
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
</style>
