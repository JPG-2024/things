import { ttsState } from '@/stores/ttsStore.svelte';
import { getAudioContext, ensureAudioContext, closeAudioContext } from '@/lib/audioContextManager';
import {
	createAnalyserNode,
	teardownSource,
	teardownAnalyser,
	decodeBlob,
	waitMs
} from '@/lib/audioNodeHelpers';
import { computeTotalDuration, findChunkAtTime, recomputeChunkOffsets } from './playbackMath';

const SEEK_SECONDS = 5;
const PREBUFFER_RATIO = 0.3;
const MIN_PREBUFFER = 1.5;

const TTS_ERROR_FALLBACK = 'Failed to play audio';

export class TtsPlaybackEngine {
	analyserNode = $state<AnalyserNode | null>(null);
	currentSource = $state<AudioBufferSourceNode | null>(null);
	waitingForChunk = $state(false);
	elapsedSeconds = $state(0);
	totalPlaybackDuration = $state(0);

	isSettingUp = false;
	playbackStartTime = 0;
	countdownInterval: ReturnType<typeof setInterval> | null = null;
	pausedAt = 0;
	decodedChunks: (AudioBuffer | null)[] = [];
	currentChunkIndex = 0;
	chunkOffsets: number[] = [];
	currentChunkDuration = 0;
	nextChunkPrefetchRequested = false;
	gapAbort: AbortController | null = null;

	onChunkStarted: (() => void) | null = null;
	onPause: (() => void) | null = null;
	onReset: (() => void) | null = null;

	get analyser(): AnalyserNode | null {
		return this.analyserNode;
	}

	private pauseAfter(index: number): number {
		return ttsState.pauseAfter(index);
	}

	private setError(err: unknown, fallback: string): void {
		ttsState.errorMessage = err instanceof Error ? err.message : fallback;
		console.error('[TTS]', err);
	}

	private cancelGap(): void {
		if (this.gapAbort) {
			this.gapAbort.abort();
			this.gapAbort = null;
		}
	}

	recomputeOffsets(): void {
		this.chunkOffsets = recomputeChunkOffsets(this.decodedChunks, (i) => this.pauseAfter(i));
	}

	computeTotal(): number {
		return computeTotalDuration(this.decodedChunks, (i) => this.pauseAfter(i));
	}

	async ensureDecodedChunk(index: number): Promise<AudioBuffer | null> {
		if (index < 0 || index >= ttsState.blobs.length) return null;
		if (this.decodedChunks[index]) return this.decodedChunks[index];
		const ctx = getAudioContext();
		const buf = await decodeBlob(ttsState.blobs[index], ctx);
		this.decodedChunks[index] = buf;
		this.recomputeOffsets();
		return buf;
	}

	async playChunkAt(index: number, offsetInChunk = 0): Promise<void> {
		if (this.isSettingUp) return;
		this.isSettingUp = true;

		try {
			const buf = await this.ensureDecodedChunk(index);
			if (!buf) {
				this.stop();
				return;
			}

			if (this.currentSource) {
				teardownSource(this.currentSource);
				this.currentSource = null;
			}

			teardownAnalyser(this.analyserNode);
			this.analyserNode = null;

			const ctx = getAudioContext();
			const source = ctx.createBufferSource();
			source.buffer = buf;

			const analyser = createAnalyserNode(ctx);

			source.connect(analyser);
			analyser.connect(ctx.destination);

			source.onended = () => {
				this.handleChunkEnded();
			};

			source.start(0, offsetInChunk);
			this.currentSource = source;
			this.analyserNode = analyser;
			this.currentChunkIndex = index;
			this.currentChunkDuration = buf.duration;
			this.nextChunkPrefetchRequested = false;

			this.recomputeOffsets();
			this.totalPlaybackDuration = this.computeTotal();
			const globalStart = this.chunkOffsets[index] + offsetInChunk;
			this.playbackStartTime = performance.now() - globalStart * 1000;
			ttsState.isPlaying = true;
			ttsState.isPaused = false;
			this.waitingForChunk = false;
			this.startCountdown();
			this.onChunkStarted?.();
		} catch (err) {
			this.setError(err, TTS_ERROR_FALLBACK);
			this.stop();
		} finally {
			this.isSettingUp = false;
		}
	}

	private handleChunkEnded(): void {
		teardownSource(this.currentSource);
		this.currentSource = null;
		teardownAnalyser(this.analyserNode);
		this.analyserNode = null;

		const nextIdx = this.currentChunkIndex + 1;
		if (nextIdx < ttsState.blobs.length) {
			if (this.decodedChunks[nextIdx] || ttsState.blobs[nextIdx]) {
				const delay = ttsState.pauseAfter(this.currentChunkIndex) * 1000;
				if (delay > 0) {
					this.gapAbort = new AbortController();
					void waitMs(delay, this.gapAbort.signal).then(() => {
						this.gapAbort = null;
						void this.playChunkAt(nextIdx);
					});
				} else {
					void this.playChunkAt(nextIdx);
				}
			} else {
				this.waitingForChunk = true;
			}
		} else if (nextIdx < ttsState.totalChunks) {
			this.waitingForChunk = true;
			if (!this.nextChunkPrefetchRequested) {
				void ttsState.generateNextChunk();
			}
		} else {
			this.stop();
		}
	}

	async start(): Promise<void> {
		if (this.isSettingUp || ttsState.blobs.length === 0) return;
		this.decodedChunks = new Array(ttsState.blobs.length).fill(null);
		this.chunkOffsets = [];
		this.currentChunkIndex = 0;
		try {
			await ensureAudioContext();
			await this.playChunkAt(0);
		} catch (err) {
			this.setError(err, 'Failed to start playback');
			this.stop();
		}
	}

	pause(): void {
		if (!this.currentSource || !ttsState.isPlaying) return;
		this.pausedAt = (performance.now() - this.playbackStartTime) / 1000;
		ttsState.isPaused = true;
		ttsState.isPlaying = false;
		this.clearCountdown();
		this.cancelGap();
		this.onPause?.();
		teardownSource(this.currentSource);
		this.currentSource = null;
		teardownAnalyser(this.analyserNode);
		this.analyserNode = null;
	}

	async resume(): Promise<void> {
		if (this.isSettingUp || !ttsState.isPaused) return;
		this.recomputeOffsets();
		const { chunkIndex, offsetInChunk } = findChunkAtTime(this.chunkOffsets, this.pausedAt);
		try {
			await this.ensureDecodedChunk(chunkIndex);
			await this.playChunkAt(chunkIndex, offsetInChunk);
		} catch (err) {
			this.setError(err, 'Failed to resume playback');
			this.stop();
		}
	}

	cleanup(): void {
		teardownSource(this.currentSource);
		this.currentSource = null;
		teardownAnalyser(this.analyserNode);
		this.analyserNode = null;
		this.clearCountdown();
		this.cancelGap();
		this.onReset?.();

		ttsState.isPaused = false;
		this.pausedAt = 0;
		this.elapsedSeconds = 0;
		this.totalPlaybackDuration = 0;
		this.decodedChunks = [];
		this.chunkOffsets = [];
		this.currentChunkIndex = 0;
		this.waitingForChunk = false;
		this.nextChunkPrefetchRequested = false;
		ttsState.errorMessage = '';
	}

	stop(): void {
		this.cleanup();
		ttsState.fullReset();
		closeAudioContext();
	}

	getCurrentPosition(): number {
		if (ttsState.isPaused) return this.pausedAt;
		if (ttsState.isPlaying) return (performance.now() - this.playbackStartTime) / 1000;
		return 0;
	}

	async seekTo(offset: number): Promise<void> {
		const duration = this.totalPlaybackDuration || 0;
		const clamped = Math.max(0, Math.min(offset, duration));

		if (ttsState.isPlaying) {
			this.recomputeOffsets();
			const { chunkIndex, offsetInChunk } = findChunkAtTime(this.chunkOffsets, clamped);
			try {
				await this.ensureDecodedChunk(chunkIndex);
				if (this.currentSource) {
					teardownSource(this.currentSource);
					this.currentSource = null;
					teardownAnalyser(this.analyserNode);
					this.analyserNode = null;
				}
				await this.playChunkAt(chunkIndex, offsetInChunk);
			} catch (err) {
				this.setError(err, 'Failed to seek');
				this.stop();
			}
		} else if (ttsState.isPaused) {
			this.pausedAt = clamped;
			this.elapsedSeconds = clamped;
		}
	}

	seekForward(): void {
		if (!ttsState.isPlaying && !ttsState.isPaused) return;
		void this.seekTo(this.getCurrentPosition() + SEEK_SECONDS);
	}

	seekBackward(): void {
		if (!ttsState.isPlaying && !ttsState.isPaused) return;
		void this.seekTo(this.getCurrentPosition() - SEEK_SECONDS);
	}

	async togglePlay(): Promise<void> {
		if (ttsState.isPlaying) {
			this.pause();
		} else if (ttsState.isPaused) {
			await this.resume();
		} else {
			if (ttsState.isGenerating) return;
			await this.start();
		}
	}

	onChunkAvailable(): void {
		this.waitingForChunk = false;
		void this.playChunkAt(this.currentChunkIndex + 1);
	}

	async decodeAll(blobCount: number): Promise<void> {
		const ctx = getAudioContext();
		while (this.decodedChunks.length < blobCount) {
			this.decodedChunks.push(null);
		}
		try {
			await Promise.all(
				ttsState.blobs.map(async (blob, i) => {
					if (!this.decodedChunks[i]) {
						this.decodedChunks[i] = await decodeBlob(blob, ctx);
					}
				})
			);
			this.recomputeOffsets();
			this.totalPlaybackDuration = this.computeTotal();
		} catch (err) {
			this.setError(err, 'Failed to decode audio');
		}
	}

	resetForConfigChange(): void {
		this.cleanup();
		ttsState.isPlaying = false;
		ttsState.isPaused = false;
		closeAudioContext();
	}

	resetForForeground(): void {
		this.decodedChunks = [];
		this.chunkOffsets = [];
	}

	private startCountdown(): void {
		this.clearCountdown();
		this.countdownInterval = setInterval(() => {
			const elapsed = (performance.now() - this.playbackStartTime) / 1000;
			this.elapsedSeconds = elapsed;

			if (
				!this.nextChunkPrefetchRequested &&
				this.currentChunkIndex + 1 < ttsState.totalChunks &&
				this.currentChunkIndex + 1 >= ttsState.blobs.length
			) {
				const chunkEndTime =
					this.playbackStartTime +
					(this.chunkOffsets[this.currentChunkIndex] + this.currentChunkDuration) * 1000;
				const timeRemaining = (chunkEndTime - performance.now()) / 1000;

				const estimatedGenTime = ttsState.averageGenerationTime;
				const prebufferSeconds = Math.max(
					MIN_PREBUFFER,
					this.currentChunkDuration * PREBUFFER_RATIO,
					estimatedGenTime * 1.2
				);

				if (timeRemaining <= prebufferSeconds) {
					this.nextChunkPrefetchRequested = true;
					void ttsState.generateNextChunk();
				}
			}
		}, 500);
	}

	private clearCountdown(): void {
		if (this.countdownInterval !== null) {
			clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
	}
}
