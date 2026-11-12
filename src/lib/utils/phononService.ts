import { invoke, isTauri } from '@tauri-apps/api/core';
import { viewState } from '@/stores/viewStore.svelte';

/**
 * Frontend side of the on-device Phonon engine (`phonon_tts.rs` commands).
 *
 * Every call degrades cleanly outside Tauri (plain browser dev server), where
 * there is no IPC bridge: availability reports `false` and synthesis throws a
 * normal error that lands in `ttsState.errorMessage`.
 */

function toError(err: unknown, fallback: string): Error {
	if (err instanceof Error) return err;
	if (typeof err === 'string' && err) return new Error(err);
	return new Error(fallback);
}

/**
 * Whether this build compiled the `phonon` cargo feature in. Probed once at
 * boot (`ttsState.initPhonon`) so the engine switch can disable itself with a
 * visible reason instead of failing on first synthesis.
 */
export async function phononAvailable(): Promise<boolean> {
	if (!isTauri()) return false;
	try {
		return await invoke<boolean>('tts_phonon_available');
	} catch {
		return false;
	}
}

/** Validates the model directory (config + tokenizer + weights) without loading it. */
export async function validatePhononCheckpoint(dir: string): Promise<void> {
	try {
		await invoke<string>('tts_validate_checkpoint', { dir });
	} catch (err) {
		throw toError(err, 'Invalid Phonon model directory');
	}
}

/**
 * Registered voice names of the checkpoint. The first call pays the model
 * load on the Rust side — deliberately shared with synthesis, so opening the
 * voice list warms the engine for the playlist.
 */
export async function listPhononVoices(): Promise<string[]> {
	try {
		return await invoke<string[]>('tts_list_voices', {
			dir: viewState.phononModelsDir,
			lang: viewState.language
		});
	} catch (err) {
		throw toError(err, 'Failed to list Phonon voices');
	}
}

/** Drops the resident model when the engine switch turns back to omnivoice. */
export async function unloadPhonon(): Promise<void> {
	try {
		await invoke('tts_phonon_unload');
	} catch (err) {
		// Fire-and-forget: a failed unload only keeps the model resident until
		// the next request, so it must never surface as a user-facing error.
		console.warn('[TTS] Failed to unload Phonon model', err);
	}
}

/**
 * Duration of a WAV buffer in seconds, read from the canonical 44-byte header
 * ptts writes (`byteRate` at 28, data size at 40). Returns `null` when the
 * header is truncated or the size was left open.
 */
export function wavDurationSeconds(buffer: ArrayBuffer): number | null {
	if (buffer.byteLength < 44) return null;
	const view = new DataView(buffer);
	const byteRate = view.getUint32(28, true);
	const dataSize = view.getUint32(40, true);
	if (byteRate === 0 || dataSize === 0xffffffff) return null;
	return dataSize / byteRate;
}

export interface PhononSynthInput {
	text: string;
	/** Registered voice name; `''` selects the checkpoint default. */
	voice?: string;
	/** Flow temperature (0–1). */
	temperature: number;
	signal?: AbortSignal;
}

/**
 * Synthesizes one chunk on the local checkpoint and returns the same shape as
 * the omnivoice path: a playable WAV blob plus its duration. The abort signal
 * cannot reach into the running command (see Q14: stale results are discarded
 * by the store's generation session), but it still short-circuits before and
 * after the invoke so cancelled callers see `AbortError` like before.
 */
export async function synthPhonon(
	input: PhononSynthInput
): Promise<{ blob: Blob; durationSeconds: number | null }> {
	const { text, voice, temperature, signal } = input;
	if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

	let buffer: ArrayBuffer;
	try {
		buffer = await invoke<ArrayBuffer>('tts_synthesize', {
			dir: viewState.phononModelsDir,
			lang: viewState.language,
			text,
			voice: voice?.trim() ? voice : null,
			temperature
		});
	} catch (err) {
		throw toError(err, 'Failed to generate speech');
	}

	if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
	if (buffer.byteLength === 0) {
		throw new Error('Generated audio is empty (0 bytes)');
	}

	return {
		blob: new Blob([buffer], { type: 'audio/wav' }),
		durationSeconds: wavDurationSeconds(buffer)
	};
}
