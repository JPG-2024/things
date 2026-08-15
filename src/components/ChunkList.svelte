<script lang="ts">
	import type { Snippet } from 'svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import DetailsPanel from '@/components/DetailsPanel.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';

	export type ChunkEntry = {
		id: string | number;
		summary: string;
		raw?: string;
		thumbnail?: string | null;
		meta?: string | null;
	};

	type Props = {
		title?: string;
		defaultOpen?: boolean;
		chunks: ChunkEntry[];
		showRaw?: boolean;
		onItemOpen?: (chunk: ChunkEntry, index: number) => void;
		itemContent?: Snippet<[ChunkEntry, number]>;
	};

	let {
		title = 'Chunks',
		defaultOpen = false,
		chunks,
		showRaw = $bindable(false),
		onItemOpen,
		itemContent
	}: Props = $props();

	const hasRaw = $derived(chunks.some((c) => typeof c.raw === 'string'));

	function chunkHint(text: string): string {
		return text.length > 80 ? text.slice(0, 80) + '…' : text;
	}
</script>

<Spacer {title} {defaultOpen}>
	{#if hasRaw}
		<div class="view-toggle">
			<button class="toggle-btn" class:active={!showRaw} onclick={() => (showRaw = false)}>
				Summary
			</button>
			<button class="toggle-btn" class:active={showRaw} onclick={() => (showRaw = true)}>
				Raw
			</button>
		</div>
	{/if}
	<div class="chunks-stack">
		{#each chunks as chunk, i (chunk.id)}
			{@const displayed = showRaw && typeof chunk.raw === 'string' ? chunk.raw : chunk.summary}
			<DetailsPanel
				label={chunk.thumbnail ? (chunk.meta ?? '') : `Chunk ${i + 1}`}
				hint={chunkHint(displayed)}
			>
				{#snippet leading()}
					{#if chunk.thumbnail}
						{#if onItemOpen}
							<button
								type="button"
								class="chunk-thumb-btn"
								aria-label="Open article"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									onItemOpen(chunk, i);
								}}
							>
								<img class="chunk-thumb" src={chunk.thumbnail} alt="" />
							</button>
						{:else}
							<img class="chunk-thumb" src={chunk.thumbnail} alt="" />
						{/if}
					{/if}
				{/snippet}
				{#if itemContent}
					{@render itemContent(chunk, i)}
				{:else}
					<MarkdownRenderer content={displayed} />
				{/if}
			</DetailsPanel>
		{/each}
	</div>
</Spacer>

<style>
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

	.chunk-thumb-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.chunk-thumb {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		object-fit: cover;
		flex-shrink: 0;
	}
</style>
