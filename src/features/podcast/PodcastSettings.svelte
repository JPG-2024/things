<script lang="ts">
	import { onMount } from 'svelte';
	import { podcastState } from '@/features/podcast/podcastStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import Icon from '@/components/Icon.svelte';
	import DetailsPanel from '@/components/DetailsPanel.svelte';
	import Dropdown from '@/components/inputs/Dropdown.component.svelte';
	import Textarea from '@/components/inputs/Textarea.component.svelte';
	import type { HostPersona } from '@/features/podcast/types';

	interface PersonaPreset {
		label: string;
		value: string;
		persona: HostPersona;
	}

	const personaPresets: PersonaPreset[] = [
		{
			label: 'Catedrático (calm analytical)',
			value: 'catedratico',
			persona: {
				personality: 'calm analytical professor, breaks everything into first principles',
				humorStyle: 'dry one-liners delivered with a straight face, about once per turn',
				catchphrases: 'says "look" before key points, uses "posta" when surprised',
				speechQuirks: 'always numbers his points ("three things here"), turns of 3-4 sentences'
			}
		},
		{
			label: 'Hype Man (energetic)',
			value: 'hype',
			persona: {
				personality: 'hyper-enthusiastic hype man, gets excited about every detail',
				humorStyle: 'mock outrage at mildly inconvenient facts',
				catchphrases:
					'exclaims "no me digas" when shocked, says "dale" to agree, "un golazo" for great ideas',
				speechQuirks: 'talks fast when excited, interjects with "ooh ooh" when an idea pops up'
			}
		},
		{
			label: 'Skeptic (sarcastic)',
			value: 'skeptic',
			persona: {
				personality: 'sarcastic and skeptical, questions everything',
				humorStyle: 'deadpan delivery, never laughs at her own jokes',
				catchphrases: 'says "big if true" after bold claims, uses "I mean..." to pivot',
				speechQuirks: 'ends turns with a rhetorical question to the co-host, short punchy sentences'
			}
		},
		{
			label: 'Storyteller (dramatic)',
			value: 'storyteller',
			persona: {
				personality: 'dramatic storyteller, treats every fact like a plot twist',
				humorStyle: 'absurdist tangents that derail the topic for one sentence',
				catchphrases:
					'opens with "okay, so here\'s where it gets weird", says "mirá vos" when surprised',
				speechQuirks: 'pauses mid-thought with "...actually, no wait", turns of 4-5 sentences'
			}
		},
		{
			label: 'Grumpy (curmudgeon)',
			value: 'grumpy',
			persona: {
				personality: 'grumpy old-school curmudgeon, complains things were better before',
				humorStyle: 'observational humor about everyday absurdities',
				catchphrases: 'says "en mi época" before comparisons, mutters "what a time to be alive"',
				speechQuirks: 'starts reactions with "ugh", speaks in short punchy sentences'
			}
		},
		{
			label: 'Warm (encouraging)',
			value: 'warm',
			persona: {
				personality: 'warm and encouraging, always finds the silver lining',
				humorStyle: 'self-deprecating, makes himself the butt of the joke',
				catchphrases:
					'says "to be honest" at least once per turn, exclaims "que bueno esto" when happy',
				speechQuirks: 'repeats the key term twice for emphasis, slows down for important points'
			}
		},
		{
			label: 'El Posta (rioplatense)',
			value: 'posta',
			persona: {
				personality: 'laid-back slacker, casually brilliant but never seems to try',
				humorStyle: 'playful teasing of his co-host, never mean-spirited',
				catchphrases:
					'uses "che" and "boludo" naturally but sparingly, says "posta" when surprised, ends thoughts with "todo bien"',
				speechQuirks: 'says "escuchá" before important points, turns of 3-4 sentences'
			}
		}
	];

	const presetOptions = [
		{ label: '— Select preset —', value: '' },
		...personaPresets.map((p) => ({ label: p.label, value: p.value }))
	];

	function applyPreset(speaker: 'A' | 'B', presetValue: string): void {
		const preset = personaPresets.find((p) => p.value === presetValue);
		if (!preset) return;
		if (speaker === 'A') {
			podcastState.config.hostAPersona = { ...preset.persona };
		} else {
			podcastState.config.hostBPersona = { ...preset.persona };
		}
	}

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

	<DetailsPanel label="Host A persona" defaultOpen={false}>
		<div class="persona-content">
			<Dropdown
				options={presetOptions}
				placeholder="Select preset..."
				onChange={(v) => applyPreset('A', v)}
			/>
			<Textarea
				label="Personality"
				bind:value={podcastState.config.hostAPersona.personality}
				rows={2}
			/>
			<Textarea
				label="Humor style"
				bind:value={podcastState.config.hostAPersona.humorStyle}
				rows={2}
			/>
			<Textarea
				label="Catchphrases"
				bind:value={podcastState.config.hostAPersona.catchphrases}
				rows={2}
			/>
			<Textarea
				label="Speech quirks"
				bind:value={podcastState.config.hostAPersona.speechQuirks}
				rows={2}
			/>
			<div class="divider"></div>
			<Textarea
				label="System prompt override"
				placeholder="Leave empty to use persona fields above. Write a full system prompt to override everything. Use __NAME__ and __SPEAKER__ as placeholders."
				bind:value={podcastState.config.hostASystemPromptOverride}
				rows={6}
			/>
			<div class="override-hint">
				Overrides all persona fields above. Use <code>__NAME__</code> and
				<code>__SPEAKER__</code> as placeholders.
			</div>
		</div>
	</DetailsPanel>

	<DetailsPanel label="Host B persona" defaultOpen={false}>
		<div class="persona-content">
			<Dropdown
				options={presetOptions}
				placeholder="Select preset..."
				onChange={(v) => applyPreset('B', v)}
			/>
			<Textarea
				label="Personality"
				bind:value={podcastState.config.hostBPersona.personality}
				rows={2}
			/>
			<Textarea
				label="Humor style"
				bind:value={podcastState.config.hostBPersona.humorStyle}
				rows={2}
			/>
			<Textarea
				label="Catchphrases"
				bind:value={podcastState.config.hostBPersona.catchphrases}
				rows={2}
			/>
			<Textarea
				label="Speech quirks"
				bind:value={podcastState.config.hostBPersona.speechQuirks}
				rows={2}
			/>
			<div class="divider"></div>
			<Textarea
				label="System prompt override"
				placeholder="Leave empty to use persona fields above. Write a full system prompt to override everything. Use __NAME__ and __SPEAKER__ as placeholders."
				bind:value={podcastState.config.hostBSystemPromptOverride}
				rows={6}
			/>
			<div class="override-hint">
				Overrides all persona fields above. Use <code>__NAME__</code> and
				<code>__SPEAKER__</code> as placeholders.
			</div>
		</div>
	</DetailsPanel>

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

	.persona-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 0.75rem;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0.5rem 0;
	}

	.override-hint {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1.4;
	}

	.override-hint code {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-size: 0.7rem;
	}
</style>
