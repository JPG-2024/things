import { extractTopics, generateFreeTopics } from '@/lib/utils/podcast/topicExtractor';
import { generateExchange, type DialogExchange } from '@/lib/utils/podcast/dialogGenerator';
import { extractDependencyText } from '@/lib/utils/helpers/tasks';
import {
	fetchVoiceProfiles,
	fetchVoiceChunks,
	generateSpeech,
	type VoiceProfile,
	type Voice
} from '@/lib/utils/ttsService';
import { splitTextIntoChunks } from '@/lib/utils/splitText';
import { ensureAudioContext, getAudioContext, closeAudioContext } from '@/lib/audioContextManager';
import { ttsState } from './ttsStore.svelte';
import { workflowStore } from '@/stores/workflowStore.svelte';

export interface PodcastConfig {
	topicCount: number;
	interactionsPerTopic: number;
	mode: 'interview' | 'smalltalk';
	hostAProfileId: string;
	hostBProfileId: string;
	contextSource: 'content' | 'summary' | 'none';
	summaryTaskId: string;
	minGapMs: number;
	maxGapMs: number;
}

export type PodcastStatus = 'idle' | 'extracting' | 'generating' | 'playing' | 'paused';

interface AudioBlobEntry {
	blobs: Blob[];
	combined: Blob | null;
}

class PodcastState {
	status = $state<PodcastStatus>('idle');
	errorMessage = $state('');
	topics = $state<string[]>([]);
	currentTopicIndex = $state(0);
	currentExchangeIndex = $state(0);
	dialogs = $state<DialogExchange[][]>([]);
	activeSpeaker = $state<'A' | 'B' | null>(null);
	isGenerating = $state(false);
	progress = $state({ current: 0, total: 0 });

	config = $state<PodcastConfig>({
		topicCount: 3,
		interactionsPerTopic: 15,
		mode: 'interview',
		hostAProfileId: '',
		hostBProfileId: '',
		contextSource: 'content',
		summaryTaskId: '',
		minGapMs: 300,
		maxGapMs: 900
	});

	profiles = $state<VoiceProfile[]>([]);

	private _voiceChunks: Map<string, Voice[]> = new Map();
	private _blobs: Map<string, AudioBlobEntry> = new Map();
	private _preparePromises: Map<string, Promise<void>> = new Map();
	private _blobReady: (() => void) | null = null;
	private _genAbort: AbortController | null = null;
	private _llmAbort: AbortController | null = null;
	private _session = 0;
	private _currentSource: AudioBufferSourceNode | null = null;
	private _analyserNode: AnalyserNode | null = null;
	private _playbackAbort: AbortController | null = null;
	private _gapTimers: Set<ReturnType<typeof setTimeout>> = new Set();

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

	get summaryTaskOptions(): { id: string; label: string }[] {
		const seen = new Set<string>();
		const allTasks = [
			...workflowStore.stackedTasks.map((e) => e.task),
			...workflowStore.focusedRunTasks
		].filter((t) => {
			if (seen.has(t.id)) return false;
			seen.add(t.id);
			return true;
		});
		return allTasks
			.filter((t) => {
				const needle = (t.id + (t.name ?? '')).toLowerCase();
				return needle.includes('summary') && t.data;
			})
			.map((t) => ({ id: t.id, label: (t.name ?? t.id) as string }));
	}

	get contextText(): string {
		const { contextSource, summaryTaskId } = this.config;
		if (contextSource === 'content') return this.contentTaskText;

		if (contextSource === 'summary' && summaryTaskId) {
			const seen = new Set<string>();
			const allTasks = [
				...workflowStore.stackedTasks.map((e) => e.task),
				...workflowStore.focusedRunTasks
			].filter((t) => {
				if (seen.has(t.id)) return false;
				seen.add(t.id);
				return true;
			});
			const task = allTasks.find((t) => t.id === summaryTaskId && t.data);
			if (task) return extractDependencyText(task.data) ?? '';
		}

		return '';
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

	async start(): Promise<void> {
		if (!this.config.hostAProfileId || !this.config.hostBProfileId) {
			this.errorMessage = 'Please select both host voices';
			return;
		}

		const source = this.contextText;
		if (this.config.contextSource !== 'none' && !source) {
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

			this.topics = await this.resolveTopics(source, llmAbort.signal);
			console.log(this.topics);
			this.dialogs = [];
			this.currentTopicIndex = 0;
			this.currentExchangeIndex = 0;
			this.progress = {
				current: 0,
				total: this.topics.length * this.config.interactionsPerTopic
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

		for (let t = this.currentTopicIndex; t < this.topics.length; t++) {
			if (this._session !== session) return;

			this.currentTopicIndex = t;
			if (!this.dialogs[t]) {
				this.dialogs[t] = [];
			}

			const interactionCount = this.config.interactionsPerTopic;

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

				this.progress.current = t * interactionCount + e + 1;

				const hasNextExchange = e + 1 < interactionCount || t + 1 < this.topics.length;
				if (hasNextExchange) {
					this.activeSpeaker = null;
					await this.waitGap(session);
					if (this._session !== session) return;
				}
			}
		}

		this.status = 'idle';
		this.activeSpeaker = null;
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
				const speaker: 'A' | 'B' = exchangeIdx % 2 === 0 ? 'A' : 'B';
				const exchange = await generateExchange({
					topic: this.topics[topicIdx],
					mode: this.config.mode,
					previousExchanges: this.dialogs[topicIdx],
					speaker,
					hostAName: this.getProfileName('A'),
					hostBName: this.getProfileName('B'),
					context: this.contextText || undefined,
					signal: this._llmAbort?.signal
				});
				if (this._session !== session) return;
				this.dialogs[topicIdx][exchangeIdx] = exchange;
				this.dialogs = [...this.dialogs];
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

		if (!entry || !entry.combined) {
			await this.prepareExchange(topicIdx, exchangeIdx, session);
			entry = this._blobs.get(key);
		}

		if (!entry?.combined || entry.combined.size === 0) return;

		this.status = 'playing';

		await ensureAudioContext();
		const ctx = getAudioContext();

		try {
			const arrayBuffer = await entry.combined.arrayBuffer();
			const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

			if (this._session !== session) return;

			const source = ctx.createBufferSource();
			source.buffer = audioBuffer;

			const analyser = ctx.createAnalyser();
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.8;
			analyser.minDecibels = -90;
			analyser.maxDecibels = -10;

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
		} catch (err) {
			if (this._session !== session) return;
			throw err;
		}
	}

	private async generateExchangeAudio(
		exchange: DialogExchange,
		session: number
	): Promise<AudioBlobEntry> {
		const chunks = splitTextIntoChunks(exchange.text, ttsState.config.splitLevel);
		const blobs: Blob[] = [];

		for (const chunk of chunks) {
			if (this._session !== session) break;

			const voiceRef = this.getVoiceRef(exchange.speaker);
			if (!voiceRef.ref_audio) {
				throw new Error(`No voice reference for Host ${exchange.speaker}`);
			}

			const abort = new AbortController();
			this._genAbort = abort;

			try {
				const res = await generateSpeech(
					{
						text: chunk,
						ref_audio: voiceRef.ref_audio,
						ref_text: voiceRef.ref_text,
						num_step: ttsState.config.numStep,
						denoise: ttsState.config.denoise,
						guidance_scale: ttsState.config.guidanceScale,
						speed: ttsState.config.speed,
						preprocess_prompt: ttsState.config.preprocessPrompt,
						postprocess_output: ttsState.config.postprocessOutput,
						t_shift: ttsState.config.tShift,
						position_temperature: ttsState.config.positionTemperature,
						class_temperature: ttsState.config.classTemperature,
						layer_penalty_factor: ttsState.config.layerPenaltyFactor,
						duration: ttsState.config.duration,
						audio_chunk_duration: ttsState.config.audioChunkDuration,
						audio_chunk_threshold: ttsState.config.audioChunkThreshold
					},
					abort.signal
				);

				if (this._session !== session) break;
				if (res.blob.size > 0) blobs.push(res.blob);
			} finally {
				if (this._genAbort === abort) {
					this._genAbort = null;
				}
			}
		}

		const combined = blobs.length > 0 ? new Blob(blobs, { type: 'audio/mpeg' }) : null;

		return { blobs, combined };
	}

	async regenerateExchange(topicIdx: number, exchangeIdx: number): Promise<void> {
		const session = this._session;
		const key = `${topicIdx}:${exchangeIdx}`;

		this._blobs.delete(key);
		this._preparePromises.delete(key);

		const prevExchanges = (this.dialogs[topicIdx] ?? []).slice(0, exchangeIdx);
		const speaker: 'A' | 'B' = exchangeIdx % 2 === 0 ? 'A' : 'B';

		this.status = 'generating';
		this.isGenerating = true;
		this.errorMessage = '';

		try {
			const exchange = await generateExchange({
				topic: this.topics[topicIdx],
				mode: this.config.mode,
				previousExchanges: prevExchanges,
				speaker,
				hostAName: this.getProfileName('A'),
				hostBName: this.getProfileName('B'),
				context: this.contextText || undefined,
				signal: this._llmAbort?.signal
			});

			if (this._session !== session) return;

			this.dialogs[topicIdx][exchangeIdx] = exchange;
			this.dialogs = [...this.dialogs];

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
		if (this._currentSource) {
			this._currentSource.onended = null;
			try {
				this._currentSource.stop();
			} catch {
				// ignore
			}
			this._currentSource.disconnect();
			this._currentSource = null;
		}
		if (this._analyserNode) {
			try {
				this._analyserNode.disconnect();
			} catch {
				// ignore
			}
			this._analyserNode = null;
		}
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

		for (const timer of this._gapTimers) clearTimeout(timer);
		this._gapTimers.clear();

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

		this.status = 'idle';
		this.activeSpeaker = null;
		this.isGenerating = false;
		this.errorMessage = '';
	}

	fullReset(): void {
		this.stop();
		for (const timer of this._gapTimers) clearTimeout(timer);
		this._gapTimers.clear();
		this.topics = [];
		this.dialogs = [];
		this.currentTopicIndex = 0;
		this.currentExchangeIndex = 0;
		this._blobs.clear();
		this._voiceChunks.clear();
		this._preparePromises.clear();
		this.progress = { current: 0, total: 0 };
	}

	getAnalyserNode(): AnalyserNode | null {
		return this._analyserNode;
	}

	private waitGap(session: number): Promise<void> {
		const { minGapMs, maxGapMs } = this.config;
		const min = Math.max(0, Math.min(minGapMs, maxGapMs));
		const max = Math.max(minGapMs, maxGapMs);
		const delay = min + Math.random() * (max - min);

		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				this._gapTimers.delete(timer);
				resolve();
			}, delay);
			this._gapTimers.add(timer);
		});
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
