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
	/** Per-chunk durations kept for the whole session: offsets, the scrubber
	 * total and seek math only need these, so decoded buffers can be pruned
	 * (see `pruneDecodedBehind`). */
	decodedDurations: number[] = [];
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
		this.chunkOffsets = recomputeChunkOffsets(this.decodedDurations, (i) => this.pauseAfter(i));
	}

	computeTotal(): number {
		return computeTotalDuration(this.decodedDurations, (i) => this.pauseAfter(i));
	}

	/** Drop decoded buffers more than this many chunks behind the playhead.
	 * Raw PCM retention is the dominant TTS memory cost; re-decoding a dropped
	 * chunk on a backward seek is cheap by comparison. */
	private static PRUNE_BEHIND = 2;

	private pruneDecodedBehind(): void {
		const cutoff = this.currentChunkIndex - TtsPlaybackEngine.PRUNE_BEHIND;
		for (let i = 0; i < cutoff && i < this.decodedChunks.length; i++) {
			this.decodedChunks[i] = null;
		}
	}

	async ensureDecodedChunk(index: number): Promise<AudioBuffer | null> {
		if (index < 0 || index >= ttsState.blobs.length) return null;
		if (this.decodedChunks[index]) return this.decodedChunks[index];
		const ctx = getAudioContext();
		const buf = await decodeBlob(ttsState.blobs[index], ctx);
		this.decodedChunks[index] = buf;
		this.decodedDurations[index] = buf.duration;
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
			this.pruneDecodedBehind();

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
			this.requestChunk(nextIdx);
		} else {
			this.stop();
		}
	}

	/**
	 * Waits for the pending chunk to be generated and resumes playback once it
	 * is available. Safe to call while a prefetch is already in flight: the
	 * single-flight promise in the store is shared, so we simply chain on it.
	 */
	private requestChunk(expectedIndex: number): void {
		void ttsState.generateNextChunk().then((generated) => {
			if (!generated) return;
			if (!this.waitingForChunk || this.currentSource) return;
			if (this.currentChunkIndex + 1 !== expectedIndex) return;
			void this.playChunkAt(expectedIndex);
		});
	}

	async start(): Promise<void> {
		if (this.isSettingUp || ttsState.blobs.length === 0) return;
		this.decodedChunks = new Array(ttsState.blobs.length).fill(null);
		this.decodedDurations = new Array(ttsState.blobs.length).fill(0);
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
		this.decodedDurations = [];
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

	async decodeAll(blobCount: number): Promise<void> {
		while (this.decodedDurations.length < blobCount) {
			this.decodedDurations.push(0);
		}
		const ctx = getAudioContext();
		try {
			await Promise.all(
				ttsState.blobs.map(async (blob, i) => {
					if (!this.decodedDurations[i]) {
						// Decode just to measure the duration, then drop the PCM
						// buffer: retaining every chunk as AudioBuffer keeps raw
						// PCM (megabytes per article) alive for the whole session.
						const buf = await decodeBlob(blob, ctx);
						this.decodedDurations[i] = buf.duration;
						if (this.decodedChunks[i]) {
							this.decodedChunks[i] = null;
						}
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
		this.decodedDurations = [];
		this.chunkOffsets = [];
	}

	/**
	 * Requests the next chunk once the delay gate and the prebuffer window in
	 * `startCountdown()` say it's time. Safe to race with the underrun path in
	 * `handleChunkEnded()`: the store's `generateNextChunk()` is single-flight.
	 */
	private prefetchNextChunk(): void {
		const nextIdx = this.currentChunkIndex + 1;
		if (nextIdx >= ttsState.totalChunks) return;
		if (nextIdx < ttsState.blobs.length) return;
		if (this.nextChunkPrefetchRequested) return;

		this.nextChunkPrefetchRequested = true;
		void ttsState.generateNextChunk().then((generated) => {
			// A `false` result can mean "initial generation owns the abort
			// controller" or a failure: release the flag so the countdown
			// fallback can retry instead of stalling the pipeline.
			if (!generated) {
				this.nextChunkPrefetchRequested = false;
			}
		});
	}

	/**
	 * Seconds elapsed since the current chunk started playing. `playbackStartTime`
	 * is rebuilt as `now - globalStart` on every (re)start, so a seek or resume
	 * mid-chunk yields the offset inside the chunk instead of a negative value.
	 */
	private secondsIntoCurrentChunk(): number {
		return (
			(performance.now() - this.playbackStartTime) / 1000 -
			this.chunkOffsets[this.currentChunkIndex]
		);
	}

	private startCountdown(): void {
		this.clearCountdown();
		this.countdownInterval = setInterval(() => {
			const elapsed = (performance.now() - this.playbackStartTime) / 1000;
			this.elapsedSeconds = elapsed;

			const nextIdx = this.currentChunkIndex + 1;
			if (this.nextChunkPrefetchRequested || nextIdx >= ttsState.totalChunks) return;
			// The next chunk is already synthesized: nothing to request.
			if (nextIdx < ttsState.blobs.length) return;

			// Rate-limit guard: never start a request before this much of the
			// current chunk has played. The underrun path in `handleChunkEnded()`
			// bypasses this so short chunks never stall.
			if (this.secondsIntoCurrentChunk() < ttsState.prefetchDelaySeconds) return;

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
				this.prefetchNextChunk();
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
