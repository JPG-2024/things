<script lang="ts">
	import { onMount } from 'svelte';
	import { podcastState } from '@/features/podcast/podcastStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import { getImage } from '@/lib/utils/ttsService';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import Icon from '@/components/Icon.svelte';

	let { onStart }: { onStart?: () => void } = $props();

	let loading = $state(false);

	onMount(() => {
		void podcastState.loadProfiles();
	});

	function hashHue(input: string): number {
		let hash = 5381;
		for (let i = 0; i < input.length; i++) {
			hash = (hash * 33) ^ input.charCodeAt(i);
		}
		return Math.abs(hash) % 360;
	}

	function colorFor(id: string): string {
		return `hsl(${hashHue(id)}, 60%, 50%)`;
	}

	function initialFor(label: string): string {
		const trimmed = label.trim();
		return trimmed.length ? trimmed[0].toUpperCase() : '?';
	}

	function handleContextSourceChange(source: 'content' | 'summary' | 'none') {
		podcastState.config.contextSource = source;
	}

	async function handleStart() {
		loading = true;
		drawersState.close('podcast-settings');
		await podcastState.start();
		loading = false;
		onStart?.();
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

	<div class="section">
		<div class="host-label">
			<span class="host-indicator host-a"></span>
			Host A — {podcastState.getProfileName('A')}
		</div>
		<div class="voice-grid">
			{#each podcastState.profiles as profile (profile.id)}
				<button
					type="button"
					class="voice-grid-item"
					class:selected={profile.id === podcastState.config.hostAProfileId}
					onclick={() => (podcastState.config.hostAProfileId = profile.id)}
				>
					<div class="avatar-wrap">
						{#if profile.image_src}
							<img class="avatar" src={getImage(profile.image_src)} alt={profile.name_prefix} />
						{:else}
							<div class="avatar fallback" style="background: {colorFor(profile.id)}">
								<span class="fallback-letter">{initialFor(profile.name_prefix)}</span>
							</div>
						{/if}
					</div>
					<span class="label">{profile.name_prefix}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="section">
		<div class="host-label">
			<span class="host-indicator host-b"></span>
			Host B — {podcastState.getProfileName('B')}
		</div>
		<div class="voice-grid">
			{#each podcastState.profiles as profile (profile.id)}
				<button
					type="button"
					class="voice-grid-item"
					class:selected={profile.id === podcastState.config.hostBProfileId}
					onclick={() => (podcastState.config.hostBProfileId = profile.id)}
				>
					<div class="avatar-wrap">
						{#if profile.image_src}
							<img class="avatar" src={getImage(profile.image_src)} alt={profile.name_prefix} />
						{:else}
							<div class="avatar fallback" style="background: {colorFor(profile.id)}">
								<span class="fallback-letter">{initialFor(profile.name_prefix)}</span>
							</div>
						{/if}
					</div>
					<span class="label">{profile.name_prefix}</span>
				</button>
			{/each}
		</div>
	</div>

	{#if podcastState.errorMessage}
		<p class="error">{podcastState.errorMessage}</p>
	{/if}

	<div class="actions">
		<Button disabled={loading} onClick={handleStart}>
			{loading ? 'Starting...' : 'Start Podcast'}
		</Button>
	</div>
</div>

<style>
	.panel {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 3rem 1.5rem;
		border-radius: 8px;
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
		border-radius: 8px;
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
		border-radius: 8px;
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

	.host-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}

	.host-indicator {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.host-a {
		background: hsl(220, 70%, 60%);
	}

	.host-b {
		background: hsl(160, 70%, 50%);
	}

	.voice-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
		gap: 0.75rem;
		max-height: 200px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.voice-grid-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem;
		background: transparent;
		border: none;
		cursor: pointer;
		border-radius: 10px;
		transition: transform 0.15s ease;
		color: inherit;
	}

	.voice-grid-item:hover {
		transform: translateY(-2px);
	}

	.voice-grid-item.selected .avatar-wrap {
		outline: 2px solid var(--primary-color);
		outline-offset: 2px;
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 25%, transparent);
	}

	.avatar-wrap {
		width: 52px;
		height: 52px;
		border-radius: 999px;
		overflow: hidden;
	}

	.avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.2rem;
	}

	.label {
		font-size: 0.7rem;
		text-align: center;
		opacity: 0.8;
		max-width: 72px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.voice-grid-item.selected .label {
		opacity: 1;
		font-weight: bold;
	}

	.error {
		color: #ff5a5a;
		font-size: 0.85rem;
		margin: 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 0.5rem;
	}
</style>
