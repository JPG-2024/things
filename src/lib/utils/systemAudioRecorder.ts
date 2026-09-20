import { invoke } from '@tauri-apps/api/core';

function messageOf(error: unknown, fallback: string): string {
	if (typeof error === 'string' && error.trim() !== '') return error;
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}

async function setErrorFrom(error: unknown, fallback: string): Promise<void> {
	const { ttsState } = await import('@/stores/ttsStore.svelte');
	ttsState.errorMessage = messageOf(error, fallback);
}

/**
 * Records the default system output (everything the desktop is playing) through
 * PipeWire/PulseAudio. Only supported on Linux; the Rust side surfaces a clear
 * error elsewhere.
 */
export async function startSystemRecording(): Promise<void> {
	try {
		await invoke('start_system_audio_recording');
	} catch (error) {
		await setErrorFrom(error, 'Failed to start system audio recording');
		throw error;
	}
}

/** Stops the current recording and returns the captured WAV audio as a Blob. */
export async function stopSystemRecording(): Promise<Blob> {
	try {
		const data = await invoke<ArrayBuffer>('stop_system_audio_recording');
		return new Blob([data], { type: 'audio/wav' });
	} catch (error) {
		await setErrorFrom(error, 'Failed to stop system audio recording');
		throw error;
	}
}
