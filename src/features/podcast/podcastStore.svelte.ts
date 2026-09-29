import { extractTopicsFromAnalysis, type TopicWithOffset } from '@/features/podcast/topicExtractor';
import { generateTopicSummary } from '@/features/podcast/summaryGenerator';
import { generateTopicScript } from '@/features/podcast/scriptGenerator';
import { generateHook } from '@/features/podcast/hookGenerator';
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
import { splitTextIntoChunksMeta } from '@/lib/utils/splitText';
import { ensureAudioContext, getAudioContext } from '@/lib/audioContextManager';
import { SvelteSet } from 'svelte/reactivity';
import { ttsState } from '@/stores/ttsStore.svelte';
import { workflowStore } from '@/stores/workflowStore.svelte';
import type {
	HookSlot,
	PodcastHookConfig,
	HostPersona,
	DialogExchange,
	SpeakerDynamics
} from '@/features/podcast/types';

export interface PodcastConfig {
	topicCount: number;
	interactionsPerTopic: number;
	turnLengthSentences: number;
	scriptTemperature: number;
	scriptReasoning: boolean;
	speakerDynamics: SpeakerDynamics;
	topicGapMs: number;
	exchangeGapMs: number;
	hostAProfileId: string;
	hostBProfileId: string;
	hostAChunkFile: string;
	hostBChunkFile: string;
	hostARandomChunk: boolean;
	hostBRandomChunk: boolean;
	contextSource: 'content' | 'summary' | 'none';
	hooks: Record<HookSlot, PodcastHookConfig>;
	hostAPersona: HostPersona;
	hostBPersona: HostPersona;
	scriptSystemPromptOverride: string;
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
	topics = $state<TopicWithOffset[]>([]);
	currentTopicIndex = $state(0);
	currentExchangeIndex = $state(0);
	dialogs = $state<DialogExchange[][]>([]);

	activeSpeaker = $state<'A' | 'B' | null>(null);
	isGenerating = $state(false);
	lastVoiceChunkIndex = $state<number | null>(null);
	progress = $state({ current: 0, total: 0 });

	config = $state<PodcastConfig>({
		topicCount: 3,
		interactionsPerTopic: 4,
		turnLengthSentences: 3,
		scriptTemperature: 0.75,
		scriptReasoning: true,
		speakerDynamics: 'alternate',
		topicGapMs: 2000,
		exchangeGapMs: 1500,
		hostAProfileId: '',
		hostBProfileId: '',
		hostAChunkFile: '',
		hostBChunkFile: '',
		hostARandomChunk: true,
		hostBRandomChunk: true,
		contextSource: 'content',
		hooks: {
			initial: {
				enabled: false,
				prompt:
					'You are opening a casual podcast episode. Welcome the audience in a relaxed, friendly tone and hint at what you and your co-host will chat about. 2-3 sentences. Do not ask a question.'
			},
			final: {
				enabled: false,
				prompt:
					'You are closing a casual podcast episode. Wrap up the chat warmly and thank the audience. 2-3 sentences. Do not ask a question.'
			}
		},
		hostAPersona: { personality: '', humorStyle: '', catchphrases: '', speechQuirks: '' },
		hostBPersona: { personality: '', humorStyle: '', catchphrases: '', speechQuirks: '' },
		scriptSystemPromptOverride: ''
	});

	profiles = $state<VoiceProfile[]>([]);

	/**
	 * Set when a persisted podcast config was loaded. While true, hosts are
	 * never auto-randomized; only invalid references are cleared silently.
	 */
	hostsHydrated = false;

	private _voiceChunks: Map<string, Voice[]> = new Map();
	private _blobs: Map<string, AudioBlobEntry> = new Map();
	private _preparePromises: Map<string, Promise<void>> = new Map();
	private _genAbort: AbortController | null = null;
	private _llmAbort: AbortController | null = null;
	private _session = 0;
	private _currentSource: AudioBufferSourceNode | null = null;
	private _analyserNode: AnalyserNode | null = $state(null);
	private _playbackAbort: AbortController | null = null;
	private _activeFinish: (() => void) | null = null;
	private _unpauseWaiters: (() => void)[] = [];
	private _preHooksDone = false;

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
		return this.topics[this.currentTopicIndex]?.text;
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
			if (this.hostsHydrated) {
				if (!this.isValidHostId(this.config.hostAProfileId)) this.config.hostAProfileId = '';
				if (!this.isValidHostId(this.config.hostBProfileId)) this.config.hostBProfileId = '';
			} else {
				this.randomizeHostsIfUnset();
			}
		} catch (err) {
			this.errorMessage = err instanceof Error ? err.message : 'Failed to load voice profiles';
		}
	}

	private isValidHostId(id: string): boolean {
		if (!id) return false;
		if (!this.profiles.some((p) => p.id === id)) return false;
		const chunks = this._voiceChunks.get(id);
		return !!chunks && chunks.length > 0;
	}

	private hostCandidatePool(): VoiceProfile[] {
		const candidates = this.profiles.filter((p) => {
			const chunks = this._voiceChunks.get(p.id);
			return !!chunks && chunks.length > 0;
		});
		return candidates.length >= 2 ? candidates : this.profiles;
	}

	private applyHostProfile(speaker: 'A' | 'B', profile: VoiceProfile): void {
		if (speaker === 'A') {
			this.config.hostAProfileId = profile.id;
			this.config.hostAChunkFile = '';
			this.config.hostARandomChunk = true;
		} else {
			this.config.hostBProfileId = profile.id;
			this.config.hostBChunkFile = '';
			this.config.hostBRandomChunk = true;
		}
	}

	randomizeHosts(): void {
		const pool = this.hostCandidatePool();
		if (pool.length < 2) return;
		const i = Math.floor(Math.random() * pool.length);
		let j = Math.floor(Math.random() * (pool.length - 1));
		if (j >= i) j++;
		this.applyHostProfile('A', pool[i]);
		this.applyHostProfile('B', pool[j]);
	}

	randomizeHostsIfUnset(): void {
		const aValid = this.isValidHostId(this.config.hostAProfileId);
		const bValid = this.isValidHostId(this.config.hostBProfileId);
		const distinct = this.config.hostAProfileId !== this.config.hostBProfileId;
		if (aValid && bValid && distinct) return;

		if (aValid && !bValid) {
			this.randomizeOtherHost('B', this.config.hostAProfileId);
			return;
		}

		if (!aValid && bValid) {
			this.randomizeOtherHost('A', this.config.hostBProfileId);
			return;
		}

		this.randomizeHosts();
	}

	private randomizeOtherHost(speaker: 'A' | 'B', excludeId: string): void {
		const remaining = this.hostCandidatePool().filter((p) => p.id !== excludeId);
		if (remaining.length === 0) return;
		const pick = remaining[Math.floor(Math.random() * remaining.length)];
		this.applyHostProfile(speaker, pick);
	}

	getVoiceRef(speaker: 'A' | 'B'): { ref_audio: string; ref_text: string } {
		const profileId = speaker === 'A' ? this.config.hostAProfileId : this.config.hostBProfileId;
		const chunks = this._voiceChunks.get(profileId) ?? [];
		const randomChunk =
			speaker === 'A' ? this.config.hostARandomChunk : this.config.hostBRandomChunk;
		const pinnedFile = speaker === 'A' ? this.config.hostAChunkFile : this.config.hostBChunkFile;

		if (chunks.length > 0) {
			let idx = -1;
			if (!randomChunk && pinnedFile) {
				const pinnedIdx = chunks.findIndex((c) => c.audio_file === pinnedFile);
				if (pinnedIdx >= 0) idx = pinnedIdx;
			}
			if (idx < 0) idx = Math.floor(Math.random() * chunks.length);
			const c = chunks[idx];
			this.lastVoiceChunkIndex = idx;
			return { ref_audio: c.audio_file, ref_text: c.text_reference };
		}

		this.lastVoiceChunkIndex = -1;
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

	getChunksForProfile(profileId: string): Voice[] {
		return this._voiceChunks.get(profileId) ?? [];
	}

	get contentTaskText(): string {
		const seen = new SvelteSet<string>();
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

		const topic = this.topics[topicIdx]?.text ?? '';
		const content = this.contentTaskText;
		const summary = await generateTopicSummary(topic, content, this._llmAbort?.signal);
		if (this._session !== session) return;
		this._topicSummaries.set(topicIdx, summary);
	}

	private resolveTopics(): TopicWithOffset[] {
		const analysisTask = workflowStore.stackedTasks.find(({ task }) => task.id === 'analysis');
		if (analysisTask) {
			const fromTask = extractTopicsFromAnalysis(analysisTask.task.data);
			if (fromTask.length > 0) return fromTask;
		}

		const focusedAnalysisTask = workflowStore.focusedRunTasks.find(
			(task) => task.id === 'analysis'
		);
		if (focusedAnalysisTask) {
			const fromFocused = extractTopicsFromAnalysis(focusedAnalysisTask.data);
			if (fromFocused.length > 0) return fromFocused;
		}

		return [];
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
		const base = this.topics.length * this.config.interactionsPerTopic;
		const hookCount = this.hookSlots.filter((s) => this.config.hooks[s].enabled).length;
		return base + hookCount;
	}

	async start(): Promise<void> {
		if (!this.config.hostAProfileId || !this.config.hostBProfileId) {
			this.errorMessage = 'Please select both host voices';
			return;
		}

		if (this.config.contextSource !== 'none' && !this.contentTaskText) {
			this.errorMessage = 'No source content available for the selected context';
			return;
		}

		this.stop();
		this._session++;
		this.status = 'extracting';
		this.errorMessage = '';

		try {
			const llmAbort = new AbortController();
			this._llmAbort = llmAbort;

			const topics = this.resolveTopics().slice(0, this.config.topicCount);
			if (topics.length === 0) {
				this.errorMessage = 'No topics found. Ensure an analysis task exists.';
				this.status = 'idle';
				return;
			}
			this.topics = topics;

			this.dialogs = [];
			this.currentTopicIndex = 0;
			this.currentExchangeIndex = 0;
			this._preHooksDone = false;
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

		if (!this._preHooksDone) {
			for (const slot of this.activeHookSlots('pre')) {
				await this.playHook(slot, session);
				if (this._session !== session) return;
				this.progress.current = Math.max(this.progress.current, 1);
			}
			this._preHooksDone = true;
		}

		const resumeTopic = this.currentTopicIndex;
		const resumeExchange = this.currentExchangeIndex;

		for (let t = this.currentTopicIndex; t < this.topics.length; t++) {
			if (this._session !== session) return;

			this.currentTopicIndex = t;

			if (!this.dialogs[t]?.length) {
				this.status = 'generating';
				this.isGenerating = true;
				try {
					await this.prepareTopicScript(t, session);
				} finally {
					this.isGenerating = false;
				}
				if (this._session !== session) return;
			}

			const interactionCount = this.dialogs[t]?.length ?? 0;
			const startExchange = t === resumeTopic ? resumeExchange : 0;

			for (let e = startExchange; e < interactionCount; e++) {
				if (this._session !== session) return;

				this.currentExchangeIndex = e;

				this.status = 'generating';
				this.isGenerating = true;
				await this.prepareExchangeAudio(t, e, session);
				this.isGenerating = false;
				if (this._session !== session) return;

				const exchange = this.dialogs[t][e];
				this.activeSpeaker = exchange.speaker;

				if (e + 1 < interactionCount) {
					void this.prepareExchangeAudio(t, e + 1, session);
				} else if (t + 1 < this.topics.length) {
					void this.prepareTopicScript(t + 1, session).then(() => {
						if (this._session !== session) return;
						void this.prepareExchangeAudio(t + 1, 0, session);
					});
				}

				await this.playExchange(t, e, session);
				if (this._session !== session) return;

				this.progress.current = Math.min(
					t * this.config.interactionsPerTopic + e + 1,
					this.progress.total
				);

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

		await this.finishSession(session);
	}

	private async prepareTopicScript(
		topicIdx: number,
		session: number,
		previousScript?: string
	): Promise<void> {
		if (this.dialogs[topicIdx]?.length) return;

		if (this.config.contextSource === 'summary') {
			await this.ensureTopicSummary(topicIdx, session);
			if (this._session !== session) return;
		}

		const script = await generateTopicScript({
			topic: this.topics[topicIdx]?.text ?? '',
			hostAName: this.getProfileName('A'),
			hostBName: this.getProfileName('B'),
			hostAPersona: this.config.hostAPersona,
			hostBPersona: this.config.hostBPersona,
			turnCount: this.config.interactionsPerTopic,
			turnLengthSentences: this.config.turnLengthSentences,
			speakerDynamics: this.config.speakerDynamics,
			context: this.topicContext(topicIdx) || undefined,
			previousScript,
			temperature: previousScript
				? Math.min(this.config.scriptTemperature + 0.15, 1.5)
				: this.config.scriptTemperature,
			reasoning: this.config.scriptReasoning,
			systemPromptOverride: this.config.scriptSystemPromptOverride,
			signal: this._llmAbort?.signal
		});
		if (this._session !== session) return;
		this.dialogs[topicIdx] = script;
		this.dialogs = [...this.dialogs];
	}

	private async prepareExchangeAudio(
		topicIdx: number,
		exchangeIdx: number,
		session: number
	): Promise<void> {
		const key = `${topicIdx}:${exchangeIdx}`;
		const cached = this._preparePromises.get(key);
		if (cached) return cached;

		const promise = (async () => {
			if (this._session !== session) return;
			const exchange = this.dialogs[topicIdx]?.[exchangeIdx];
			if (!exchange) return;

			const entry = this._blobs.get(key);
			if (!entry || !entry.combined) {
				const audio = await this.generateExchangeAudio(exchange, session);
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
			await this.prepareExchangeAudio(topicIdx, exchangeIdx, session);
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

			await this.parkWhilePaused(session);
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

			let interruptedByPause = false;
			await new Promise<void>((resolve) => {
				const finish = () => {
					if (this._activeFinish === finish) {
						this._activeFinish = null;
					}
					if (this._currentSource === source) {
						this._currentSource = null;
						this._analyserNode = null;
					}
					if (this.status === 'paused') {
						interruptedByPause = true;
					}
					resolve();
				};
				this._activeFinish = finish;
				source.onended = finish;
				source.start(0);
			});

			if (this._session !== session) return;

			if (interruptedByPause) {
				// Replay this blob from the start once resumed
				await this.parkWhilePaused(session);
				if (this._session !== session) return;
				i--;
				continue;
			}

			if (i < entry.blobs.length - 1) {
				const delay = entry.chunkEndsParagraph[i]
					? ttsState.paragraphGapMs()
					: ttsState.sentenceGapMs();
				await waitMs(delay, this._playbackAbort?.signal);
			}
		}
	}

	private parkWhilePaused(session: number): Promise<void> {
		if (this.status !== 'paused' || this._session !== session) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this._unpauseWaiters.push(resolve);
		});
	}

	private drainUnpauseWaiters(): void {
		const waiters = this._unpauseWaiters.splice(0);
		for (const resolve of waiters) resolve();
	}

	private async playHook(slot: HookSlot, session: number): Promise<void> {
		if (this._session !== session) return;
		const cfg = this.config.hooks[slot];

		this.activeSpeaker = 'A';
		this.status = 'generating';
		this.isGenerating = true;

		try {
			const exchange = await generateHook({
				kind: slot,
				hostName: this.getProfileName('A'),
				persona: this.config.hostAPersona,
				customPrompt: cfg.prompt,
				temperature: this.config.scriptTemperature,
				signal: this._llmAbort?.signal
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

	async regenerateTopic(topicIdx: number): Promise<void> {
		if (!this.dialogs[topicIdx]?.length) return;

		// Takeover: cancel the running loop and stop whatever is playing right now
		this._session++;
		const session = this._session;
		this._pausePlayback();
		this.drainUnpauseWaiters();
		this._preparePromises.clear();

		const previousScript = this.dialogs[topicIdx].map((e) => `${e.speaker}: ${e.text}`).join('\n');
		for (let e = 0; e < this.dialogs[topicIdx].length; e++) {
			this._blobs.delete(`${topicIdx}:${e}`);
		}
		this.dialogs[topicIdx] = [];
		this.dialogs = [...this.dialogs];

		this.status = 'generating';
		this.isGenerating = true;
		this.errorMessage = '';
		let handedOff = false;

		try {
			await this.prepareTopicScript(topicIdx, session, previousScript);
			if (this._session !== session) return;

			this.currentTopicIndex = topicIdx;
			this.currentExchangeIndex = 0;
			this.progress.current = Math.min(
				topicIdx * this.config.interactionsPerTopic,
				this.progress.total
			);

			handedOff = true;
			void this.playAllTopics();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			this.errorMessage = err instanceof Error ? err.message : 'Failed to regenerate';
			this.status = 'idle';
		} finally {
			if (!handedOff) {
				this.isGenerating = false;
			}
		}
	}

	private async finishSession(session: number): Promise<void> {
		if (this._session !== session) return;
		for (const slot of this.activeHookSlots('post')) {
			await this.playHook(slot, session);
			if (this._session !== session) return;
			this.progress.current = Math.max(this.progress.current, this.progress.total);
		}
		this.status = 'idle';
		this.activeSpeaker = null;
	}

	pause(): void {
		if (this.status !== 'playing') return;
		this.status = 'paused';
		this._pausePlayback();
	}

	private _pausePlayback(): void {
		teardownSource(this._currentSource);
		if (this._currentSource) {
			this._currentSource = null;
		}
		teardownAnalyser(this._analyserNode);
		this._analyserNode = null;
		// Unblock the awaited playback promise so the loop parks instead of dangling
		const finish = this._activeFinish;
		this._activeFinish = null;
		finish?.();
	}

	resume(): void {
		if (this.status !== 'paused') return;
		this.status = 'playing';
		this.drainUnpauseWaiters();
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
		this.drainUnpauseWaiters();

		this._preparePromises.clear();
		this._topicSummaries.clear();

		this.status = 'idle';
		this.activeSpeaker = null;
		this.isGenerating = false;
		this.errorMessage = '';
		this.lastVoiceChunkIndex = null;
	}

	fullReset(): void {
		this.stop();
		this.topics = [];
		this.dialogs = [];
		this.currentTopicIndex = 0;
		this.currentExchangeIndex = 0;
		this._blobs.clear();
		this._voiceChunks.clear();
		this._preparePromises.clear();
		this._topicSummaries.clear();
		this.progress = { current: 0, total: 0 };
		this.lastVoiceChunkIndex = null;
	}

	getAnalyserNode(): AnalyserNode | null {
		return this._analyserNode;
	}
}

export const podcastState = new PodcastState();
