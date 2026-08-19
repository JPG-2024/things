import { extractTopics, generateFreeTopics } from '@/features/podcast/topicExtractor';
import { generateTopicSummary, generateChunkSummary } from '@/features/podcast/summaryGenerator';
import {
	generateExchange,
	type DialogExchange,
	type GenerateExchangeParams
} from '@/features/podcast/dialogGenerator';
import { extractDependencyText } from '@/lib/utils/helpers/tasks';
import {
	fetchVoiceProfiles,
	fetchVoiceChunks,
	generateSpeech,
	buildSpeechParams,
	type VoiceProfile,
	type Voice
} from '@/lib/utils/ttsService';
import {
	createAnalyserNode,
	teardownSource,
	teardownAnalyser,
	decodeBlob,
	waitMs
} from '@/lib/audioNodeHelpers';
import { splitTextIntoChunksMeta, reconstructChunks } from '@/lib/utils/splitText';
import { ensureAudioContext, getAudioContext, closeAudioContext } from '@/lib/audioContextManager';
import { SvelteSet } from 'svelte/reactivity';
import { ttsState } from '@/stores/ttsStore.svelte';
import { workflowStore } from '@/stores/workflowStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import type { TurnPlan, HookSlot, PodcastHookConfig } from '@/features/podcast/types';

export interface PodcastConfig {
	topicCount: number;
	interactionsPerTopic: number;
	topicGapMs: number;
	exchangeGapMs: number;
	mode: 'interview' | 'smalltalk' | 'guided';
	hostAProfileId: string;
	hostBProfileId: string;
	contextSource: 'content' | 'summary' | 'none';
	hooks: Record<HookSlot, PodcastHookConfig>;
}

export type PodcastStatus = 'idle' | 'extracting' | 'generating' | 'playing' | 'paused';

interface AudioBlobEntry {
	blobs: Blob[];
	combined: Blob | null;
	chunkEndsParagraph: boolean[];
}

class PodcastState {
	status = $state<PodcastStatus>('idle');
	errorMessage = $state('');
	topics = $state<string[]>([]);
	currentTopicIndex = $state(0);
	currentExchangeIndex = $state(0);
	dialogs = $state<DialogExchange[][]>([]);

	chunkRawTexts = $state<string[]>([]);
	chunkQuestions = $state<string[][]>([]);
	exchangeCounts = $state<number[]>([]);
	activeSpeaker = $state<'A' | 'B' | null>(null);
	isGenerating = $state(false);
	progress = $state({ current: 0, total: 0 });

	config = $state<PodcastConfig>({
		topicCount: 3,
		interactionsPerTopic: 4,
		topicGapMs: 2000,
		exchangeGapMs: 1500,
		mode: 'interview',
		hostAProfileId: '',
		hostBProfileId: '',
		contextSource: 'content',
		hooks: {
			initial: {
				enabled: true,
				prompts: {
					interview:
						'Just say welcome to "things" podcast. or something similar mentioning always the name of the podcast. maximum 10 words. Do not ask a question.',
					smalltalk:
						'You are opening a casual podcast episode. Welcome the audience in a relaxed, friendly tone and hint at what you and your co-host will chat about. 2-3 sentences. Do not ask a question.',
					guided:
						'You are opening a guided walkthrough episode. Welcome listeners and preview the sections you will cover. 2-3 sentences. Do not ask a question.'
				}
			},
			final: {
				enabled: false,
				prompts: {
					interview:
						'You are closing a podcast interview episode. Thank the guest and the audience, recap the highlights briefly, and sign off warmly. 2-3 sentences. Do not ask a question.',
					smalltalk:
						'You are closing a casual podcast episode. Wrap up the chat warmly and thank the audience. 2-3 sentences. Do not ask a question.',
					guided:
						'You are closing a guided walkthrough episode. Summarize what was covered and thank the listeners. 2-3 sentences. Do not ask a question.'
				}
			}
		}
	});

	profiles = $state<VoiceProfile[]>([]);

	private _voiceChunks: Map<string, Voice[]> = new Map();
	private _blobs: Map<string, AudioBlobEntry> = new Map();
	private _preparePromises: Map<string, Promise<void>> = new Map();
	private _turnPlans: TurnPlan[][] = [];
	private _blobReady: (() => void) | null = null;
	private _genAbort: AbortController | null = null;
	private _llmAbort: AbortController | null = null;
	private _session = 0;
	private _currentSource: AudioBufferSourceNode | null = null;
	private _analyserNode: AnalyserNode | null = null;
	private _playbackAbort: AbortController | null = null;

	get hostAProfile(): VoiceProfile | undefined {
		return this.profiles.find((p) => p.id === this.config.hostAProfileId);
	}

	get hostBProfile(): VoiceProfile | undefined {
		return this.profiles.find((p) => p.id === this.config.hostBProfileId);
	}

	get currentExchanges(): DialogExchange[] {
		return this.dialogs[this.currentTopicIndex] ?? [];
	}

	get currentExchange(): DialogExchange | undefined {
		return this.currentExchanges[this.currentExchangeIndex];
	}

	get currentTopic(): string | undefined {
		return this.topics[this.currentTopicIndex];
	}

	async loadProfiles(): Promise<void> {
		try {
			this.profiles = await fetchVoiceProfiles();
			for (const profile of this.profiles) {
				try {
					const chunks = await fetchVoiceChunks(profile.id);
					this._voiceChunks.set(profile.id, chunks);
				} catch {
					// silently skip profiles with failed chunks
				}
			}
		} catch (err) {
			this.errorMessage = err instanceof Error ? err.message : 'Failed to load voice profiles';
		}
	}

	getVoiceRef(speaker: 'A' | 'B'): { ref_audio: string; ref_text: string } {
		const profileId = speaker === 'A' ? this.config.hostAProfileId : this.config.hostBProfileId;
		const chunks = this._voiceChunks.get(profileId) ?? [];

		if (chunks.length > 0) {
			const c = chunks[Math.floor(Math.random() * chunks.length)];
			return { ref_audio: c.audio_file, ref_text: c.text_reference };
		}

		return { ref_audio: '', ref_text: '' };
	}

	getProfileName(speaker: 'A' | 'B'): string {
		const profile = speaker === 'A' ? this.hostAProfile : this.hostBProfile;
		return profile?.name_prefix ?? `Host ${speaker}`;
	}

	getProfileImage(speaker: 'A' | 'B'): string | undefined {
		const profile = speaker === 'A' ? this.hostAProfile : this.hostBProfile;
		return profile?.image_src;
	}

	get contentTaskText(): string {
		const seen = new Set<string>();
		const allTasks = [
			...workflowStore.stackedTasks.map((e) => e.task),
			...workflowStore.focusedRunTasks
		].filter((t) => {
			if (seen.has(t.id)) return false;
			seen.add(t.id);
			return true;
		});

		const contentTask = allTasks.find((t) => t.id === 'content' && t.status === 'done' && t.data);
		if (contentTask) return extractDependencyText(contentTask.data) ?? '';

		return allTasks
			.filter((t) => t.status === 'done' && t.data)
			.map((t) => extractDependencyText(t.data))
			.filter(Boolean)
			.join('\n\n');
	}

	private _topicSummaries: Map<number, string> = new Map();

	get contextText(): string {
		return this.topicContext(this.currentTopicIndex);
	}

	private topicContext(topicIdx: number): string {
		const { contextSource } = this.config;
		if (contextSource === 'content') return this.contentTaskText;
		if (contextSource === 'summary') return this._topicSummaries.get(topicIdx) ?? '';
		return '';
	}

	private async ensureTopicSummary(topicIdx: number, session: number): Promise<void> {
		if (this.config.contextSource !== 'summary') return;
		if (this._topicSummaries.has(topicIdx)) return;

		const topic = this.topics[topicIdx];
		const content = this.contentTaskText;
		const summary = await generateTopicSummary(topic, content, this._llmAbort?.signal);
		if (this._session !== session) return;
		this._topicSummaries.set(topicIdx, summary);
	}

	private async resolveTopics(content: string, signal: AbortSignal): Promise<string[]> {
		const topicsTask = workflowStore.stackedTasks.find(({ task }) => task.id === 'topics');
		if (topicsTask) {
			const fromTask = normalizeTopicsFromData(topicsTask.task.data);
			if (fromTask) return fromTask;
		}

		const focusedTopicsTask = workflowStore.focusedRunTasks.find((task) => task.id === 'topics');
		if (focusedTopicsTask) {
			if (focusedTopicsTask) return focusedTopicsTask.data.finalResponse;
		}

		if (!content) {
			return generateFreeTopics(this.config.topicCount, signal);
		}

		return extractTopics(content, this.config.topicCount, signal);
	}

	private getAllTasks(): Task[] {
		const seen = new SvelteSet<string>();
		return [
			...workflowStore.stackedTasks.map((e) => e.task),
			...workflowStore.focusedRunTasks
		].filter((t) => {
			if (seen.has(t.id)) return false;
			seen.add(t.id);
			return true;
		});
	}

	get hasQuestionsTask(): boolean {
		return this.getAllTasks().some((t) => t.id === 'questions' && t.status === 'done' && t.data);
	}

	private getQuestionsTask(): Task | undefined {
		return this.getAllTasks().find((t) => t.id === 'questions' && t.status === 'done' && t.data);
	}

	private getTaskById(id: string): Task | undefined {
		return this.getAllTasks().find((t) => t.id === id);
	}

	private getSourceText(taskId: string): string {
		const task = this.getTaskById(taskId);
		if (!task || !task.data) return '';
		return extractDependencyText(task.data) ?? '';
	}

	private normalizeChunkQuestions(data: unknown): string[] {
		if (Array.isArray(data)) {
			return data
				.filter((q): q is string => typeof q === 'string')
				.map((q) => q.trim())
				.filter(Boolean);
		}

		if (typeof data === 'string') {
			const trimmed = data.trim();
			if (!trimmed) return [];
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return parsed
						.filter((q): q is string => typeof q === 'string')
						.map((q) => q.trim())
						.filter(Boolean);
				}
			} catch {
				// fall through to line-split fallback
			}
			return trimmed
				.split(/\r?\n/)
				.map((q) => q.trim())
				.filter(Boolean);
		}

		return [];
	}

	private buildQuestionsSegments(): boolean {
		const questionsTask = this.getQuestionsTask();
		if (!questionsTask) return false;

		const data = questionsTask.data as
			| { chunks?: Array<{ key?: { startOffset: number; endOffset: number }; data?: unknown }> }
			| undefined;
		const chunks = data?.chunks;
		if (!Array.isArray(chunks) || chunks.length === 0) return false;

		const sourceId = questionsTask.dependencies?.[0];
		const sourceText = sourceId ? this.getSourceText(sourceId) : this.contentTaskText;
		if (!sourceText) return false;

		const rawTexts: string[] = [];
		const questions: string[][] = [];
		const labels: string[] = [];
		const counts: number[] = [];

		for (const chunk of chunks) {
			const key = chunk.key;
			const raw =
				key && typeof key.startOffset === 'number' && typeof key.endOffset === 'number'
					? (reconstructChunks(sourceText, [key])[0] ?? '')
					: '';
			if (!raw) continue;

			const qs = this.normalizeChunkQuestions(chunk.data);
			if (qs.length === 0) continue;

			rawTexts.push(raw);
			questions.push(qs);
			const label = raw.slice(0, 70).trim();
			labels.push(label + (raw.length > 70 ? '…' : ''));
			counts.push(qs.length * 2);
		}

		if (rawTexts.length === 0) return false;

		this.chunkRawTexts = rawTexts;
		this.chunkQuestions = questions;
		this.exchangeCounts = counts;
		this.topics = labels;
		return true;
	}

	private buildInterviewTurnPlans(): void {
		const plans: TurnPlan[][] = [];
		for (let t = 0; t < this.topics.length; t++) {
			const qs = this.chunkQuestions[t] ?? [];
			const topicPlans: TurnPlan[] = [{ role: 'hook', speaker: 'A' }];
			for (const q of qs) {
				topicPlans.push({ role: 'question', speaker: 'A', question: q });
				topicPlans.push({ role: 'answer', speaker: 'B' });
			}
			plans.push(topicPlans);
		}
		this._turnPlans = plans;
		this.exchangeCounts = plans.map((p) => p.length);
	}

	private getInteractionCount(t: number): number {
		if (this.config.mode === 'guided') return this.exchangeCounts[t] ?? 0;
		if (this._turnPlans.length > 0) return this._turnPlans[t]?.length ?? 0;
		return this.config.interactionsPerTopic;
	}

	get hookSlots(): HookSlot[] {
		return ['initial', 'final'];
	}

	private activeHookSlots(phase: 'pre' | 'post'): HookSlot[] {
		return this.hookSlots.filter((slot) => {
			const cfg = this.config.hooks[slot];
			if (!cfg.enabled) return false;
			if (phase === 'pre') return slot === 'initial';
			return slot === 'final';
		});
	}

	private get totalExchangeCount(): number {
		let base = 0;
		if (this._turnPlans.length > 0 || this.config.mode === 'guided') {
			base = this.exchangeCounts.reduce((acc, n) => acc + n, 0);
		} else {
			base = this.topics.length * this.config.interactionsPerTopic;
		}
		const hookCount = this.hookSlots.filter((s) => this.config.hooks[s].enabled).length;
		return base + hookCount;
	}

	async start(): Promise<void> {
		if (!this.config.hostAProfileId || !this.config.hostBProfileId) {
			this.errorMessage = 'Please select both host voices';
			return;
		}

		let source = '';
		if (this.config.mode !== 'guided') {
			source = this.config.contextSource === 'none' ? '' : this.contentTaskText;
			if (this.config.contextSource !== 'none' && !source) {
				this.errorMessage = 'No source content available for the selected context';
				return;
			}
		}

		this.stop();
		this._session++;
		const session = this._session;
		this.status = 'extracting';
		this.errorMessage = '';

		try {
			const llmAbort = new AbortController();
			this._llmAbort = llmAbort;

			if (this.config.mode === 'guided') {
				const ok = this.buildQuestionsSegments();
				if (!ok) {
					this.errorMessage = 'No questions task available to drive the guided podcast';
					this.status = 'idle';
					return;
				}
				this._turnPlans = [];
			} else if (this.config.mode === 'interview') {
				const ok = this.buildQuestionsSegments();
				if (ok) {
					this.topics = await Promise.all(
						this.chunkRawTexts.map((raw) => generateChunkSummary(raw, llmAbort.signal))
					);
					if (this._session !== session) return;
					this.buildInterviewTurnPlans();
				} else {
					this.topics = await this.resolveTopics(source, llmAbort.signal);
					this.chunkRawTexts = [];
					this.chunkQuestions = [];
					this.exchangeCounts = [];
					this._turnPlans = [];
				}
			} else {
				this.topics = await this.resolveTopics(source, llmAbort.signal);
				this.chunkRawTexts = [];
				this.chunkQuestions = [];
				this.exchangeCounts = [];
				this._turnPlans = [];
			}
			console.log(this.topics);
			this.dialogs = [];
			this.currentTopicIndex = 0;
			this.currentExchangeIndex = 0;
			this.progress = {
				current: 0,
				total: this.totalExchangeCount
			};

			await this.playAllTopics();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			this.errorMessage = err instanceof Error ? err.message : 'Failed to generate podcast';
			this.status = 'idle';
		} finally {
			this._llmAbort = null;
		}
	}

	private async playAllTopics(): Promise<void> {
		const session = this._session;

		for (const slot of this.activeHookSlots('pre')) {
			await this.playHook(slot, session);
			if (this._session !== session) return;
			this.progress.current = Math.max(this.progress.current, 1);
		}

		for (let t = this.currentTopicIndex; t < this.topics.length; t++) {
			if (this._session !== session) return;

			this.currentTopicIndex = t;
			if (!this.dialogs[t]) {
				this.dialogs[t] = [];
			}

			const interactionCount = this.getInteractionCount(t);

			for (let e = 0; e < interactionCount; e++) {
				if (this._session !== session) return;

				this.currentExchangeIndex = e;

				this.status = 'generating';
				this.isGenerating = true;
				await this.prepareExchange(t, e, session);
				this.isGenerating = false;
				if (this._session !== session) return;

				const exchange = this.dialogs[t][e];
				this.activeSpeaker = exchange.speaker;

				if (e + 1 < interactionCount) {
					void this.prepareExchange(t, e + 1, session);
				} else if (t + 1 < this.topics.length) {
					void this.prepareExchange(t + 1, 0, session);
				}

				await this.playExchange(t, e, session);
				if (this._session !== session) return;

				const priorExchanges =
					this.config.mode === 'guided' || this._turnPlans.length > 0
						? this.exchangeCounts.slice(0, t).reduce((acc, n) => acc + n, 0)
						: t * this.config.interactionsPerTopic;
				this.progress.current = priorExchanges + e + 1;

				const hasNextExchange = e + 1 < interactionCount || t + 1 < this.topics.length;
				if (hasNextExchange) {
					this.activeSpeaker = null;
					const isLastExchangeOfTopic = e + 1 >= interactionCount;
					if (isLastExchangeOfTopic && t + 1 < this.topics.length) {
						await waitMs(this.config.topicGapMs, this._playbackAbort?.signal);
					} else {
						await waitMs(this.config.exchangeGapMs, this._playbackAbort?.signal);
					}
					if (this._session !== session) return;
				}
			}
		}

		for (const slot of this.activeHookSlots('post')) {
			await this.playHook(slot, session);
			if (this._session !== session) return;
			this.progress.current = Math.max(this.progress.current, this.progress.total);
		}

		this.status = 'idle';
		this.activeSpeaker = null;
	}

	private buildExchangeParams(
		topicIdx: number,
		exchangeIdx: number,
		interactionCount: number
	): GenerateExchangeParams {
		const plans = this._turnPlans[topicIdx];
		const plan = plans?.[exchangeIdx];
		const speaker: 'A' | 'B' = plan ? plan.speaker : exchangeIdx % 2 === 0 ? 'A' : 'B';
		const isFirst = exchangeIdx === 0;
		const isLast = exchangeIdx + 1 === interactionCount;
		const previousExchanges = (this.dialogs[topicIdx] ?? []).slice(0, exchangeIdx);

		if (this.config.mode === 'guided') {
			const raw = this.chunkRawTexts[topicIdx] ?? '';
			const questions = this.chunkQuestions[topicIdx] ?? [];
			const questionIndex = Math.floor(exchangeIdx / 2);
			const question = speaker === 'A' ? (questions[questionIndex] ?? '') : '';

			return {
				topic: this.topics[topicIdx] ?? '',
				mode: this.config.mode,
				previousExchanges,
				speaker,
				hostAName: this.getProfileName('A'),
				hostBName: this.getProfileName('B'),
				context: raw || undefined,
				signal: this._llmAbort?.signal,
				isFirstInteractionOfTopic: isFirst,
				isLastInteractionOfTopic: isLast,
				isNewChunkAfterFirst: topicIdx > 0 && isFirst,
				question: question || undefined
			};
		}

		if (this._turnPlans.length > 0 && plan) {
			const raw = this.chunkRawTexts[topicIdx] ?? '';
			const question =
				plan.role === 'answer' ? (plans[exchangeIdx - 1]?.question ?? '') : (plan.question ?? '');

			return {
				topic: this.topics[topicIdx] ?? '',
				mode: this.config.mode,
				previousExchanges,
				speaker,
				hostAName: this.getProfileName('A'),
				hostBName: this.getProfileName('B'),
				context: raw || undefined,
				signal: this._llmAbort?.signal,
				isFirstInteractionOfTopic: isFirst,
				isLastInteractionOfTopic: isLast,
				isNewChunkAfterFirst: topicIdx > 0 && isFirst,
				question: question || undefined
			};
		}

		return {
			topic: this.topics[topicIdx],
			mode: this.config.mode,
			previousExchanges,
			speaker,
			hostAName: this.getProfileName('A'),
			hostBName: this.getProfileName('B'),
			context: this.topicContext(topicIdx) || undefined,
			signal: this._llmAbort?.signal,
			isFirstInteractionOfTopic: isFirst,
			isLastInteractionOfTopic: isLast
		};
	}

	private async prepareExchange(
		topicIdx: number,
		exchangeIdx: number,
		session: number
	): Promise<void> {
		const key = `${topicIdx}:${exchangeIdx}`;
		const cached = this._preparePromises.get(key);
		if (cached) return cached;

		const promise = (async () => {
			if (this._session !== session) return;
			if (!this.dialogs[topicIdx]) {
				this.dialogs[topicIdx] = [];
			}

			if (!this.dialogs[topicIdx][exchangeIdx]) {
				const plans = this._turnPlans[topicIdx];
				const plan = plans?.[exchangeIdx];

				if (plan?.role === 'question' && plan.question) {
					this.dialogs[topicIdx][exchangeIdx] = {
						speaker: plan.speaker,
						text: plan.question,
						role: 'question',
						direct: true
					};
					this.dialogs = [...this.dialogs];
				} else {
					const interactionCount =
						this.config.mode === 'guided'
							? this.exchangeCounts[topicIdx]
							: this.config.interactionsPerTopic;

					if (
						this.config.mode !== 'guided' &&
						this.config.contextSource === 'summary' &&
						exchangeIdx === 0
					) {
						await this.ensureTopicSummary(topicIdx, session);
						if (this._session !== session) return;
					}

					const exchange = await generateExchange(
						this.buildExchangeParams(topicIdx, exchangeIdx, interactionCount)
					);
					if (this._session !== session) return;
					this.dialogs[topicIdx][exchangeIdx] = exchange;
					this.dialogs = [...this.dialogs];
				}
			}

			const entry = this._blobs.get(key);
			if (!entry || !entry.combined) {
				const audio = await this.generateExchangeAudio(
					this.dialogs[topicIdx][exchangeIdx],
					session
				);
				if (this._session !== session) return;
				this._blobs.set(key, audio);
			}
		})();

		this._preparePromises.set(key, promise);
		return promise;
	}

	private async playExchange(
		topicIdx: number,
		exchangeIdx: number,
		session: number
	): Promise<void> {
		const key = `${topicIdx}:${exchangeIdx}`;
		let entry = this._blobs.get(key);

		if (!entry || entry.blobs.length === 0) {
			await this.prepareExchange(topicIdx, exchangeIdx, session);
			entry = this._blobs.get(key);
		}

		if (!entry || entry.blobs.length === 0) return;

		await this.playBlobEntry(entry, session);
	}

	private async playBlobEntry(entry: AudioBlobEntry, session: number): Promise<void> {
		if (entry.blobs.length === 0) return;

		this.status = 'playing';

		await ensureAudioContext();
		const ctx = getAudioContext();

		for (let i = 0; i < entry.blobs.length; i++) {
			if (this._session !== session) return;

			const audioBuffer = await decodeBlob(entry.blobs[i], ctx);
			if (this._session !== session) return;

			const source = ctx.createBufferSource();
			source.buffer = audioBuffer;

			const analyser = createAnalyserNode(ctx);
			source.connect(analyser);
			analyser.connect(ctx.destination);

			this._currentSource = source;
			this._analyserNode = analyser;

			await new Promise<void>((resolve) => {
				source.onended = () => {
					if (this._currentSource === source) {
						this._currentSource = null;
						this._analyserNode = null;
					}
					resolve();
				};
				source.start(0);
			});

			if (this._session !== session) return;

			if (i < entry.blobs.length - 1) {
				const delay = entry.chunkEndsParagraph[i]
					? ttsState.paragraphGapMs()
					: ttsState.sentenceGapMs();
				await waitMs(delay, this._playbackAbort?.signal);
			}
		}
	}

	private async playHook(slot: HookSlot, session: number): Promise<void> {
		if (this._session !== session) return;
		const cfg = this.config.hooks[slot];

		this.activeSpeaker = 'A';
		this.status = 'generating';
		this.isGenerating = true;

		try {
			const exchange = await generateExchange({
				topic: '',
				mode: this.config.mode,
				previousExchanges: [],
				speaker: 'A',
				hostAName: this.getProfileName('A'),
				hostBName: this.getProfileName('B'),
				context: this.config.contextSource !== 'none' ? this.contentTaskText : undefined,
				signal: this._llmAbort?.signal,
				hookKind: slot,
				customSystemPrompt: cfg.prompts[this.config.mode]
			});
			if (this._session !== session) return;

			const entry = await this.generateExchangeAudio(exchange, session);
			if (this._session !== session) return;

			await this.playBlobEntry(entry, session);
			if (this._session !== session) return;
		} finally {
			this.isGenerating = false;
			this.activeSpeaker = null;
		}
	}

	private async generateExchangeAudio(
		exchange: DialogExchange,
		session: number
	): Promise<AudioBlobEntry> {
		const meta = splitTextIntoChunksMeta(exchange.text, ttsState.config.splitLevel);
		const blobs: Blob[] = [];
		const chunkEndsParagraph: boolean[] = [];

		for (const chunk of meta) {
			if (this._session !== session) break;

			const voiceRef = this.getVoiceRef(exchange.speaker);
			if (!voiceRef.ref_audio) {
				throw new Error(`No voice reference for Host ${exchange.speaker}`);
			}

			const abort = new AbortController();
			this._genAbort = abort;

			try {
				const res = await generateSpeech(
					buildSpeechParams(ttsState.config, chunk.text, voiceRef.ref_audio, voiceRef.ref_text),
					abort.signal
				);

				if (this._session !== session) break;
				if (res.blob.size > 0) {
					blobs.push(res.blob);
					chunkEndsParagraph.push(chunk.endsParagraph);
				}
			} finally {
				if (this._genAbort === abort) {
					this._genAbort = null;
				}
			}
		}

		const combined = blobs.length > 0 ? new Blob(blobs, { type: 'audio/mpeg' }) : null;

		return { blobs, combined, chunkEndsParagraph };
	}

	async regenerateExchange(topicIdx: number, exchangeIdx: number): Promise<void> {
		const session = this._session;
		const key = `${topicIdx}:${exchangeIdx}`;

		this._blobs.delete(key);
		this._preparePromises.delete(key);

		const interactionCount =
			this.config.mode === 'guided'
				? this.exchangeCounts[topicIdx]
				: this.config.interactionsPerTopic;

		this.status = 'generating';
		this.isGenerating = true;
		this.errorMessage = '';

		try {
			if (this.config.mode !== 'guided' && this.config.contextSource === 'summary') {
				await this.ensureTopicSummary(topicIdx, session);
				if (this._session !== session) return;
			}

			const plans = this._turnPlans[topicIdx];
			const plan = plans?.[exchangeIdx];
			let exchange = this.dialogs[topicIdx]?.[exchangeIdx];

			if (plan?.role === 'question' && plan.question && (!exchange || !exchange.direct)) {
				exchange = {
					speaker: plan.speaker,
					text: plan.question,
					role: 'question',
					direct: true
				};
				this.dialogs[topicIdx][exchangeIdx] = exchange;
				this.dialogs = [...this.dialogs];
			} else if (!exchange || !exchange.direct) {
				exchange = await generateExchange(
					this.buildExchangeParams(topicIdx, exchangeIdx, interactionCount)
				);

				if (this._session !== session) return;

				this.dialogs[topicIdx][exchangeIdx] = exchange;
				this.dialogs = [...this.dialogs];
			}

			const entry = await this.generateExchangeAudio(exchange, session);
			if (this._session !== session) return;

			this._blobs.set(key, entry);

			this.currentTopicIndex = topicIdx;
			this.currentExchangeIndex = exchangeIdx;
			this.activeSpeaker = exchange.speaker;

			await this.playExchange(topicIdx, exchangeIdx, session);
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			this.errorMessage = err instanceof Error ? err.message : 'Failed to regenerate';
		} finally {
			this.isGenerating = false;
		}
	}

	pause(): void {
		if (this.status !== 'playing') return;
		this._pausePlayback();
		this.status = 'paused';
	}

	private _pausePlayback(): void {
		teardownSource(this._currentSource);
		if (this._currentSource) {
			this._currentSource = null;
		}
		teardownAnalyser(this._analyserNode);
		this._analyserNode = null;
	}

	resume(): void {
		if (this.status !== 'paused') return;
		// Re-play the current exchange from the stored blob
		const topicIdx = this.currentTopicIndex;
		const exchangeIdx = this.currentExchangeIndex;
		const session = this._session;

		this.status = 'playing';
		void this.playExchange(topicIdx, exchangeIdx, session);
	}

	stop(): void {
		this._session++;

		if (this._genAbort) {
			this._genAbort.abort();
			this._genAbort = null;
		}
		if (this._llmAbort) {
			this._llmAbort.abort();
			this._llmAbort = null;
		}
		if (this._playbackAbort) {
			this._playbackAbort.abort();
			this._playbackAbort = null;
		}

		this._pausePlayback();

		this._preparePromises.clear();
		this._topicSummaries.clear();
		this._turnPlans = [];

		this.status = 'idle';
		this.activeSpeaker = null;
		this.isGenerating = false;
		this.errorMessage = '';
	}

	fullReset(): void {
		this.stop();
		this.topics = [];
		this.dialogs = [];
		this.chunkRawTexts = [];
		this.chunkQuestions = [];
		this.exchangeCounts = [];
		this.currentTopicIndex = 0;
		this.currentExchangeIndex = 0;
		this._blobs.clear();
		this._voiceChunks.clear();
		this._preparePromises.clear();
		this._topicSummaries.clear();
		this._turnPlans = [];
		this.progress = { current: 0, total: 0 };
	}

	getAnalyserNode(): AnalyserNode | null {
		return this._analyserNode;
	}

	private waitGap(session: number): Promise<void> {
		return waitMs(ttsState.sentenceGapMs(), this._playbackAbort?.signal);
	}
}

export const podcastState = new PodcastState();

function normalizeTopicsFromData(data: unknown): string[] | null {
	if (Array.isArray(data)) {
		const items = data
			.filter((d): d is string => typeof d === 'string')
			.map((d) => d.trim())
			.filter(Boolean);
		return items.length > 0 ? items : null;
	}

	if (data && typeof data === 'object') {
		const topics = (data as Record<string, unknown>).topics;
		if (Array.isArray(topics)) {
			const items = topics
				.filter((d): d is string => typeof d === 'string')
				.map((d) => d.trim())
				.filter(Boolean);
			return items.length > 0 ? items : null;
		}
	}

	return null;
}
