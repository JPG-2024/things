<script lang="ts">
	import { fly } from 'svelte/transition';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Modal from '@/components/Modal.svelte';
	import Icon from '@/components/Icon.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import PromptSettingsModal from '@/components/modals/PromptSettingsModal.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import { articleState } from '@/stores/articleStore.svelte';
	import { ANALYSIS_TABS, viewState } from '@/stores/viewStore.svelte';
	import { articleManager } from '@/runners/articleManager.svelte';
	import { readRawWindow } from '@/lib/utils/rawContent';
	import { detectSource } from '@/runners/articleSources';
	import {
		clampWindowLevel,
		WINDOW_DIVISOR_LADDER,
		windowLevelForDivisor
	} from '@/lib/utils/windowAnalysis';
	import type { AnalysisType, ArticleWindow } from '@/types/articleAnalysis.types';

	type Props = {
		/** Windows to render. Defaults to the ones of the open article. */
		windows?: ArticleWindow[];
	};

	let { windows = undefined }: Props = $props();

	const article = $derived(articleState.currentArticle);
	// The synthetic window of a level-1 direct final block is storage detail:
	// the panel shows the final block once, never a duplicate card.
	const visibleWindows = $derived(
		(windows ?? article.analysis?.windows ?? []).filter((window) => !window.data?.direct)
	);
	const summary = $derived(article.analysis?.summary ?? '');
	const isRunning = $derived(article.status === 'running' && article.step === 'analysis');
	const isStreamingFinal = $derived(isRunning && article.finalStreaming !== null);
	const finalBlock = $derived(isRunning ? (article.finalStreaming ?? '') : summary);

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

	/**
	 * Auto-follow: while a run streams, windows append at the bottom of the
	 * grid in chronological order. The page itself scrolls (`#layout-main`),
	 * so following means keeping the grid bottom in view. The decision is
	 * measured *before* the new card is laid out: that is what makes "scrolled
	 * up to read an earlier window" pause the follow until the user returns
	 * to the bottom.
	 */
	const FOLLOW_SLACK_PX = 48;
	let gridEl = $state<HTMLDivElement | null>(null);
	let lastWindowCount = -1;
	let pendingFollow = false;

	function gridBottomVisible(): boolean {
		if (!gridEl) return true;
		const scroller = document.getElementById('layout-main');
		const bottom = scroller?.getBoundingClientRect().bottom ?? window.innerHeight;
		return gridEl.getBoundingClientRect().bottom <= bottom + FOLLOW_SLACK_PX;
	}

	$effect.pre(() => {
		const count = visibleWindows.length;
		if (count === lastWindowCount) return;
		const grew = count > lastWindowCount;
		// The first window of a run always follows, even when the panel starts
		// below the fold; later ones only follow while the bottom stays in view.
		pendingFollow = grew && (count === 1 || gridBottomVisible());
		lastWindowCount = count;
	});

	$effect(() => {
		// A finished run must not leave a pending follow behind: the next run
		// would spend it on the previous generation of windows.
		if (!isRunning) {
			pendingFollow = false;
			return;
		}
		if (visibleWindows.length === 0 || !pendingFollow) return;
		pendingFollow = false;
		// `nearest` leaves the page alone when the card is already visible and
		// reveals a card taller than the viewport from its top instead of
		// overshooting to the page bottom.
		gridEl?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	});

	let rawModalIndex = $state<number | null>(null);
	let rawModalText = $state('');
	let promptsOpen = $state(false);

	async function openRawText(index: number) {
		rawModalIndex = index;
		rawModalText = '';
		const window = visibleWindows[index];
		if (!window) return;
		rawModalText = await readRawWindow(article.url, window.start, window.end);
	}

	/**
	 * The tab selects which processor runs. Switching it re-runs the analysis
	 * with the other analytic, which regenerates the final block — and with it
	 * the title — from that processor's result.
	 */
	function handleTabChange(tabId: string) {
		const url = article.url;
		const analysisType = tabId as AnalysisType;
		if (!url || isRunning || analysisType === article.analysis?.analysisType) return;
		viewState.analysisTab = analysisType;
		articleManager.rerunAnalysis(url, { analysisType });
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
		articleManager.rerunAnalysis(article.url, {
			windowLevel: index,
			analysisType: viewState.analysisTab
		});
	}
</script>

<div class="analysis-shell">
	<!-- Always rendered, so both the analysis type and the prompts are
		 configurable even before the first run. -->
	<div class="analysis-tabs">
		<Tabs
			tabs={ANALYSIS_TABS}
			bind:activeTab={viewState.analysisTab}
			disabled={isRunning}
			onTabChange={handleTabChange}
		/>
		{#if showLevelControl}
			<span class="level-label">window</span>
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
		{/if}
		<span class="prompts-trigger">
			<Icon
				name="Text"
				size={16}
				ariaLabel="Edit prompts"
				tooltipProps={{ content: 'edit prompts' }}
				onClick={() => (promptsOpen = true)}
			/>
		</span>
	</div>

	{#if viewState.analysisTab === 'summary'}
		{#if isRunning && progress && progress.total > 0}
			<div class="progress-row">
				<span class="progress-label">analysing windows</span>
				<span class="progress-count">{progress.done}/{progress.total}</span>
			</div>
		{/if}

		{#if visibleWindows.length > 0 || (isRunning && !isStreamingFinal)}
			<!-- Owns the `@container` context of the grid: it reacts to the width
			 of this column, not of the window (the filters panel makes those
			 differ). Kept off `.analysis-shell` so the fixed backdrop of the
			 raw-text modal is not trapped by the containment. -->
			<div class="windows-container">
				<Spacer title="Windows" bind:opened={windowsOpen}>
					<div class="chunks-grid" bind:this={gridEl}>
						{#if isRunning && visibleWindows.length === 0}
							<div class="chunk-pending">waiting for the first window…</div>
						{/if}
						{#each visibleWindows as window, index (window.index)}
							<div class="chunk-item" transition:fly={{ duration: 300, y: 100 }}>
								<div class="chunk-heading">
									<span class="chunk-index">{index + 1}/{windowTotal}</span>
									{#if window.data.title}
										<span class="chunk-title">{window.data.title}</span>
									{/if}
								</div>
								<div class="chunk-summary">
									<MarkdownRenderer content={window.data.summary} fontSize={0.7} />
								</div>

								<div class="chunk-action">
									<Button icon="FileText" onClick={() => void openRawText(index)}>
										View raw text
									</Button>
								</div>
							</div>
						{/each}
					</div>
				</Spacer>
			</div>
		{/if}
	{/if}

	{#if finalBlock}
		<div class="final-section">
			<MarkdownRenderer content={finalBlock} />
			{#if isStreamingFinal}
				<span class="typing-cursor" aria-hidden="true">▍</span>
			{/if}
		</div>
	{:else if isStreamingFinal}
		<div class="chunk-pending">generating final block…</div>
	{/if}

	<Modal show={rawModalIndex !== null} onClose={() => (rawModalIndex = null)}>
		{#if rawModalIndex !== null}
			<div class="raw-text-modal-container">
				<div class="chunk-raw-text">{rawModalText}</div>
			</div>
		{/if}
	</Modal>

	<PromptSettingsModal show={promptsOpen} onClose={() => (promptsOpen = false)} />
</div>

<style>
	.analysis-shell {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.analysis-tabs {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.level-slider {
		flex: 1;
		max-width: 16rem;
	}

	.level-label {
		font-size: 0.82rem;
		opacity: 0.7;
		font-family: var(--font-secondary);
	}

	/* Panel-level action: pinned to the right edge of the tabs row. */
	.prompts-trigger {
		display: inline-flex;
		align-items: center;
		margin-left: auto;
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
		margin-bottom: 1rem;
		font-family: var(--font-secondary);
		white-space: wrap;
	}

	/* Full-width footer action for the window card. */
	.chunk-action {
		margin-top: 0.4rem;
	}

	.chunk-action :global(button) {
		width: 100%;
		font-size: 0.7rem;
		padding: 0.35rem 0.5rem;
	}

	/* Wraps to as many lines as needed: truncating here would hide part of
	 * the window title, and the grid lets the cards grow. */
	.chunk-title {
		flex: 1;
		min-width: 0;
		font-size: 0.8rem;
		font-weight: bold;
		color: var(--primary-color);
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

	.typing-cursor {
		color: var(--primary-color);
		animation: blink 1s steps(2, start) infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
