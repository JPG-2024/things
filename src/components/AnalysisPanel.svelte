<script lang="ts">
	import { fly } from 'svelte/transition';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Modal from '@/components/Modal.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import { articleState } from '@/stores/articleStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleManager } from '@/runners/articleManager.svelte';
	import { readRawWindow } from '@/lib/utils/rawContent';
	import { detectSource } from '@/runners/articleSources';
	import {
		clampWindowLevel,
		WINDOW_DIVISOR_LADDER,
		windowLevelForDivisor
	} from '@/lib/utils/windowAnalysis';
	import type { ArticleWindow } from '@/types/articleAnalysis.types';

	type Props = {
		/** Windows to render. Defaults to the ones of the open article. */
		windows?: ArticleWindow[];
	};

	let { windows = undefined }: Props = $props();

	const article = $derived(articleState.currentArticle);
	const visibleWindows = $derived(windows ?? article.analysis?.windows ?? []);
	const summary = $derived(article.analysis?.summary ?? '');

	/**
	 * Web articles split by markdown headings and have no knob: the slider is
	 * only offered for the sources that split by level (raw and YouTube).
	 */
	const showLevelControl = $derived(article.url ? detectSource(article.url) !== 'web' : false);

	/**
	 * The slider always shows the level the run *executed*, never the one that
	 * was requested: the context-overflow ladder may have climbed past it.
	 */
	const executedLevel = $derived(
		windowLevelForDivisor(article.analysis?.divisor ?? null) ??
			clampWindowLevel(viewState.windowLevel)
	);

	// Writable derived: the slider follows the executed level, and the user
	// can drag it to request a different one.
	let sliderIndex = $derived(executedLevel);

	const previewDivisor = $derived(WINDOW_DIVISOR_LADDER[sliderIndex] ?? executedLevel);

	const isRunning = $derived(article.status === 'running' && article.step === 'analysis');
	const progress = $derived(article.progress);

	/**
	 * Denominator of the per-chunk labels. While a run streams, the whole
	 * total is known from the start, so the labels count up (`3/6`) instead of
	 * renumbering after every arrival (`3/3` → `3/4` → …).
	 */
	const windowTotal = $derived(
		isRunning && progress !== null && progress.total > 0
			? Math.max(progress.total, visibleWindows.length)
			: visibleWindows.length
	);

	/**
	 * The accordion opens when an analysis starts and closes when it ends, so
	 * the windows stream in visibly and then get out of the way. Only the run
	 * drives it: a manual toggle afterwards is never fought, because the
	 * effect reacts to `isRunning`, never to `windowsOpen`.
	 */
	let windowsOpen = $state(false);
	let runActive = false;

	$effect(() => {
		if (isRunning) {
			runActive = true;
			windowsOpen = true;
			return;
		}
		if (!runActive) return;
		runActive = false;
		// A finished analysis collapses; a failed one keeps its partial windows
		// on screen, so there is something to inspect or to re-run.
		windowsOpen = !summary;
	});

	let rawModalIndex = $state<number | null>(null);
	let rawModalText = $state('');

	async function openRawText(index: number) {
		rawModalIndex = index;
		rawModalText = '';
		const window = visibleWindows[index];
		if (!window) return;
		rawModalText = await readRawWindow(article.url, window.start, window.end);
	}

	/**
	 * Re-runs only the analysis (windows) and the title of the article. The
	 * category is never overwritten by a rerun.
	 */
	async function applyLevel(levelId: string) {
		const level = Number(levelId);
		if (!Number.isFinite(level) || level < 1) return;
		if (isRunning) return;

		const index = clampWindowLevel(
			WINDOW_DIVISOR_LADDER.indexOf(level as (typeof WINDOW_DIVISOR_LADDER)[number])
		);
		if (index === executedLevel) return;

		viewState.windowLevel = index;
		articleManager.rerunAnalysis(article.url, { windowLevel: index });
	}
</script>

{#if visibleWindows.length > 0 || summary || isRunning}
	<div class="analysis-shell">
		{#if showLevelControl}
			<div class="level-row">
				<span class="level-label">window ÷</span>
				<div class="level-slider">
					<RangeSelector
						id="window-level"
						min={0}
						max={WINDOW_DIVISOR_LADDER.length - 1}
						step={1}
						bind:value={sliderIndex}
						disabled={isRunning}
						onCommit={(i) => void applyLevel(String(WINDOW_DIVISOR_LADDER[i]))}
					/>
				</div>
				<span class="level-label">÷{previewDivisor}</span>
			</div>
		{/if}

		{#if isRunning && progress && progress.total > 0}
			<div class="progress-row">
				<span class="progress-label">analysing windows</span>
				<span class="progress-count">{progress.done}/{progress.total}</span>
			</div>
		{/if}

		{#if visibleWindows.length > 0 || isRunning}
			<!-- Owns the `@container` context of the grid: it reacts to the width
				 of this column, not of the window (the filters panel makes those
				 differ). Kept off `.analysis-shell` so the fixed backdrop of the
				 raw-text modal is not trapped by the containment. -->
			<div class="windows-container">
				<Spacer title="Windows" bind:opened={windowsOpen}>
					<div class="chunks-grid">
						{#if isRunning && visibleWindows.length === 0}
							<div class="chunk-pending">waiting for the first window…</div>
						{/if}
						{#each [...visibleWindows].reverse() as window, reversedIndex (window.index)}
							{@const originalIndex = visibleWindows.length - 1 - reversedIndex}
							<div class="chunk-item" transition:fly={{ duration: 300, y: 100 }}>
								<div class="chunk-heading">
									<span class="chunk-index">{originalIndex + 1}/{windowTotal}</span>
									{#if window.data.title}
										<span class="chunk-title">{window.data.title}</span>
									{/if}
									<Button icon="FileText" onClick={() => void openRawText(originalIndex)}>
										View raw text
									</Button>
								</div>
								<div class="chunk-summary">
									<MarkdownRenderer content={window.data.summary} />
								</div>
							</div>
						{/each}
					</div>
				</Spacer>
			</div>
		{/if}

		{#if !isRunning && summary}
			<div class="final-section">
				<MarkdownRenderer content={summary} />
			</div>
		{/if}

		<Modal show={rawModalIndex !== null} onClose={() => (rawModalIndex = null)}>
			{#if rawModalIndex !== null}
				<div class="raw-text-modal-container">
					<div class="chunk-raw-text">{rawModalText}</div>
				</div>
			{/if}
		</Modal>
	</div>
{/if}

<style>
	.analysis-shell {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.level-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.level-slider {
		flex: 1;
		max-width: 16rem;
	}

	.level-label {
		font-size: 0.82rem;
		opacity: 0.7;
	}

	.progress-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.82rem;
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}

	.progress-count {
		font-weight: bold;
	}

	.windows-container {
		width: 100%;
		/* Anchors the `@container` rule below: the grid reacts to the width of
		 * this column, not to the width of the window — the filters panel makes
		 * those differ. */
		container-type: inline-size;
	}

	.chunks-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		align-items: start;
	}

	/* Narrow column: a single column instead of two ~290px cards. */
	@container (max-width: 44rem) {
		.chunks-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.chunk-item {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.chunk-item:last-child {
		padding-bottom: 0;
		border-bottom: none;
	}

	.chunk-pending {
		font-size: 0.75rem;
		opacity: 0.5;
		font-style: italic;
	}

	.chunk-heading {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		margin-bottom: 0.4rem;
		font-family: var(--font-secondary);
		white-space: wrap;
	}

	.chunk-heading :global(button) {
		margin-left: auto;
		font-size: 0.7rem;
		padding: 0;
	}

	.chunk-title {
		flex: 1;
		min-width: 0;
		font-size: 0.78rem;
		font-weight: 600;
		opacity: 0.85;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chunk-index {
		font-size: 0.7rem;
		opacity: 0.45;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.raw-text-modal-container {
		padding: 0 1rem;
	}

	.chunk-raw-text {
		font-size: 0.75rem;
		white-space: pre-wrap;
		padding: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		color: gray;
	}

	.final-section {
	}
</style>
