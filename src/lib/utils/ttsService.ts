const TTS_API_URL = import.meta.env.VITE_TTS_API_URL;
const WHISPER_API_URL = import.meta.env.VITE_WHISPER_API_URL;

export interface VoiceProfile {
	id: string;
	name_prefix: string;
	language?: string;
	image_src?: string;
}

export interface Voice {
	name: string;
	profile_id: string;
	audio_file: string;
	text_reference: string;
	file_id?: string;
}

async function parseErrorDetail(res: Response): Promise<string> {
	const err = await res.json().catch(() => ({}));
	const detail = (err as { detail?: unknown }).detail;
	return detail == null
		? `Error ${res.status}`
		: typeof detail === 'string'
			? detail
			: JSON.stringify(detail);
}

async function setErrorFrom(err: unknown, fallback: string): Promise<void> {
	const { ttsState } = await import('@/stores/ttsStore.svelte');
	ttsState.errorMessage = err instanceof Error ? err.message : fallback;
}

function isAbort(err: unknown): boolean {
	return err instanceof DOMException && err.name === 'AbortError';
}

export async function fetchVoiceProfiles(): Promise<VoiceProfile[]> {
	try {
		const res = await fetch(`${WHISPER_API_URL}/voices`);
		if (!res.ok) {
			const message = await parseErrorDetail(res);
			await setErrorFrom(new Error(message), 'Failed to fetch voice profiles');
			throw new Error(message);
		}
		const data: { profiles: VoiceProfile[] } = await res.json();

		return data.profiles;
	} catch (err) {
		if (isAbort(err)) throw err;
		if (err instanceof Error && err.message) throw err;
		await setErrorFrom(err, 'Failed to fetch voice profiles');
		throw err;
	}
}

export function getImage(filename: string): string {
	return `${WHISPER_API_URL}${filename}`;
}

export async function fetchVoiceChunks(profileId: string): Promise<Voice[]> {
	try {
		const res = await fetch(`${WHISPER_API_URL}/voices/${encodeURIComponent(profileId)}`);
		if (!res.ok) {
			const message = await parseErrorDetail(res);
			await setErrorFrom(new Error(message), 'Failed to fetch voice chunks');
			throw new Error(message);
		}
		const data: { chunks: Voice[] } = await res.json();
		return data.chunks;
	} catch (err) {
		if (isAbort(err)) throw err;
		if (err instanceof Error && err.message) throw err;
		await setErrorFrom(err, 'Failed to fetch voice chunks');
		throw err;
	}
}

export async function deleteVoiceChunk(name: string): Promise<void> {
	try {
		const res = await fetch(`${WHISPER_API_URL}/voices/chunk/${encodeURIComponent(name)}`, {
			method: 'DELETE'
		});
		if (!res.ok) {
			const message = await parseErrorDetail(res);
			await setErrorFrom(new Error(message), 'Failed to delete voice chunk');
			throw new Error(message);
		}
	} catch (err) {
		if (isAbort(err)) throw err;
		if (err instanceof Error && err.message) throw err;
		await setErrorFrom(err, 'Failed to delete voice chunk');
		throw err;
	}
}

export async function deleteVoiceProfile(profileId: string): Promise<void> {
	try {
		const res = await fetch(`${WHISPER_API_URL}/voices/${encodeURIComponent(profileId)}`, {
			method: 'DELETE'
		});
		if (!res.ok) {
			const message = await parseErrorDetail(res);
			await setErrorFrom(new Error(message), 'Failed to delete voice profile');
			throw new Error(message);
		}
	} catch (err) {
		if (isAbort(err)) throw err;
		if (err instanceof Error && err.message) throw err;
		await setErrorFrom(err, 'Failed to delete voice profile');
		throw err;
	}
}

export async function updateVoiceProfile(
	profileId: string,
	patch: { name_prefix?: string; image_src?: string }
): Promise<VoiceProfile> {
	try {
		const res = await fetch(`${WHISPER_API_URL}/voices/${encodeURIComponent(profileId)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
		if (!res.ok) {
			const message = await parseErrorDetail(res);
			await setErrorFrom(new Error(message), 'Failed to update voice profile');
			throw new Error(message);
		}
		return (await res.json()) as VoiceProfile;
	} catch (err) {
		if (isAbort(err)) throw err;
		if (err instanceof Error && err.message) throw err;
		await setErrorFrom(err, 'Failed to update voice profile');
		throw err;
	}
}

export async function* parseSSE(
	response: Response
): AsyncGenerator<{ event: string | null; data: unknown }> {
	if (!response.body) throw new Error('Response body is null');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let currentEvent: string | null = null;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const parts = buffer.split('\n');
		buffer = parts.pop() ?? '';
		for (const part of parts) {
			if (part.startsWith('event: ')) currentEvent = part.slice(7);
			else if (part.startsWith('data: ')) {
				yield { event: currentEvent, data: JSON.parse(part.slice(6)) };
			}
		}
	}
}

export async function addVoice(
	params: {
		url: string;
		segment?: string;
		name_prefix?: string;
		chunk_count?: number;
		image_src?: string;
	},
	signal?: AbortSignal
): Promise<Response> {
	const body: Record<string, unknown> = {
		url: params.url,
		segment: params.segment ?? '*00:00-01:00',
		name_prefix: params.name_prefix ?? 'chunk',
		chunk_count: params.chunk_count ?? 5
	};
	if (params.image_src) {
		body.image_src = params.image_src;
	}

	try {
		const res = await fetch(`${WHISPER_API_URL}/transcribe-chunks`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal
		});
		if (!res.ok) {
			const message = await parseErrorDetail(res);
			await setErrorFrom(new Error(message), 'Failed to start transcription');
			throw new Error(message);
		}
		return res;
	} catch (err) {
		if (isAbort(err)) throw err;
		if (err instanceof Error && err.message) throw err;
		await setErrorFrom(err, 'Failed to start transcription');
		throw err;
	}
}

export async function generateSpeech(
	params: {
		text: string;
		instruct?: string;
		ref_audio: string;
		ref_text: string;
		num_step: number;
		denoise: boolean;
		guidance_scale: number;
		t_shift?: number;
		position_temperature?: number;
		class_temperature?: number;
		layer_penalty_factor?: number;
		duration?: number;
		speed: number;
		preprocess_prompt: boolean;
		postprocess_output: boolean;
		audio_chunk_duration?: number;
		audio_chunk_threshold?: number;
	},
	signal?: AbortSignal
): Promise<{ blob: Blob; durationSeconds: number | null }> {
	try {
		console.log('speech', params);
		const res = await fetch(`${TTS_API_URL}/tts/mp3`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params),
			signal
		});

		if (!res.ok) {
			const message = await parseErrorDetail(res);
			await setErrorFrom(new Error(message), 'Failed to generate speech');
			throw new Error(message);
		}
		const durationSeconds = Number.parseFloat(res.headers.get('X-Duration-Seconds') ?? 'null');

		const blob = await res.blob();

		return { blob, durationSeconds };
	} catch (err) {
		if (isAbort(err)) throw err;
		if (err instanceof Error && err.message) throw err;
		await setErrorFrom(err, 'Failed to generate speech');
		throw err;
	}
}
