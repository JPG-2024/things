<script lang="ts">
	import { onMount } from 'svelte';
	import { podcastState } from '@/features/podcast/podcastStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import Icon from '@/components/Icon.svelte';

	onMount(() => {
		void podcastState.loadProfiles();
	});

	function handleContextSourceChange(source: 'content' | 'summary' | 'none') {
		podcastState.config.contextSource = source;
	}
</script>

<div class="panel">
	<h2>
		<Icon name="Podcast" size={30} color={viewState.primaryColor} />
		<span>Podcast Settings</span>
	</h2>

	<div class="section">
		<div class="mode-toggle">
			<button
				type="button"
				class="mode-btn"
				class:selected={podcastState.config.mode === 'interview'}
				onclick={() => (podcastState.config.mode = 'interview')}
			>
				<Icon name="MessageCircleQuestionMark" size={18} />
				Interview
			</button>
			<button
				type="button"
				class="mode-btn"
				class:selected={podcastState.config.mode === 'smalltalk'}
				onclick={() => (podcastState.config.mode = 'smalltalk')}
			>
				<Icon name="MessagesSquare" size={18} />
				Small Talk
			</button>
			<button
				type="button"
				class="mode-btn"
				class:selected={podcastState.config.mode === 'guided'}
				disabled={!podcastState.hasQuestionsTask}
				title={podcastState.hasQuestionsTask ? '' : 'Requires a completed "questions" task'}
				onclick={() => (podcastState.config.mode = 'guided')}
			>
				<Icon name="ListCheck" size={18} />
				Guided
			</button>
		</div>
	</div>

	<div class="section">
		<div class="section-label">Context</div>
		<div class="mode-toggle">
			<button
				type="button"
				class="mode-btn"
				class:selected={podcastState.config.contextSource === 'content'}
				onclick={() => handleContextSourceChange('content')}
			>
				<Icon name="FileText" size={18} />
				Content
			</button>
			<button
				type="button"
				class="mode-btn"
				class:selected={podcastState.config.contextSource === 'summary'}
				onclick={() => handleContextSourceChange('summary')}
			>
				<Icon name="AlignLeft" size={18} />
				Summary
			</button>
			<button
				type="button"
				class="mode-btn"
				class:selected={podcastState.config.contextSource === 'none'}
				onclick={() => handleContextSourceChange('none')}
			>
				<Icon name="X" size={18} />
				None
			</button>
		</div>
	</div>

	<div class="section">
		<div class="section-label">Episode hooks (Host A)</div>
		{#each podcastState.hookSlots as slot}
			<div class="hook-row">
				<label class="hook-toggle">
					<input type="checkbox" bind:checked={podcastState.config.hooks[slot].enabled} />
					<span>{slot === 'initial' ? 'Opening hook' : 'Closing hook'}</span>
				</label>
				{#if podcastState.config.hooks[slot].enabled}
					<textarea
						class="hook-prompt"
						rows="4"
						value={podcastState.config.hooks[slot].prompts[podcastState.config.mode]}
						oninput={(e) =>
							(podcastState.config.hooks[slot].prompts[podcastState.config.mode] =
								e.currentTarget.value)}
					></textarea>
				{/if}
			</div>
		{/each}
	</div>

	{#if podcastState.config.mode !== 'guided'}
		<div class="section">
			<RangeSelector
				id="podcast-topics"
				label="Topics"
				value={podcastState.config.topicCount}
				min={1}
				max={10}
				step={1}
				format={(v) => v.toString()}
				onChange={(v) => (podcastState.config.topicCount = v)}
			/>
		</div>

		<div class="section">
			<RangeSelector
				id="podcast-interactions"
				label="Interactions per topic"
				value={podcastState.config.interactionsPerTopic}
				min={2}
				max={15}
				step={1}
				format={(v) => v.toString()}
				onChange={(v) => (podcastState.config.interactionsPerTopic = v)}
			/>
		</div>
	{/if}

	<div class="section">
		<RangeSelector
			id="podcast-topic-gap"
			label="Topic gap"
			value={podcastState.config.topicGapMs}
			min={0}
			max={5000}
			step={250}
			format={(v) => (v / 1000).toFixed(1) + 's'}
			onChange={(v) => (podcastState.config.topicGapMs = v)}
		/>
	</div>

	<div class="section">
		<RangeSelector
			id="podcast-exchange-gap"
			label="Exchange gap"
			value={podcastState.config.exchangeGapMs}
			min={0}
			max={3000}
			step={250}
			format={(v) => (v / 1000).toFixed(1) + 's'}
			onChange={(v) => (podcastState.config.exchangeGapMs = v)}
		/>
	</div>
</div>

<style>
	.panel {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 3rem 1.5rem;
		border-radius: var(--radius-md);
		background-color: rgba(255, 255, 255, 0.02);
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--primary-color);
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-label {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.hook-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.hook-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.75);
		cursor: pointer;
	}

	.hook-toggle input {
		width: 16px;
		height: 16px;
		accent-color: var(--primary-color);
	}

	.hook-prompt {
		width: 100%;
		resize: vertical;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.85);
		padding: 0.6rem;
		font-size: 0.8rem;
		font-family: inherit;
	}

	.mode-toggle {
		display: flex;
		gap: 0.5rem;
	}

	.mode-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.85rem;
		transition: all 0.2s;
	}

	.mode-btn:hover {
		border-color: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.8);
	}

	.mode-btn.selected {
		border-color: var(--primary-color);
		background: color-mix(in srgb, var(--primary-color) 15%, transparent);
		color: var(--primary-color);
	}
</style>
