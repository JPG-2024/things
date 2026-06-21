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

export async function fetchVoiceProfiles(): Promise<VoiceProfile[]> {
	const res = await fetch(`${WHISPER_API_URL}/voices`);
	if (!res.ok) throw new Error(`Failed to fetch voice profiles: ${res.status}`);
	const data: { profiles: VoiceProfile[] } = await res.json();
	return data.profiles;
}

export async function fetchVoiceChunks(profileId: string): Promise<Voice[]> {
	const res = await fetch(`${WHISPER_API_URL}/voices/${encodeURIComponent(profileId)}`);
	if (!res.ok) throw new Error(`Failed to fetch voice chunks: ${res.status}`);
	const data: { chunks: Voice[] } = await res.json();
	return data.chunks;
}

export async function deleteVoiceChunk(name: string): Promise<void> {
	const res = await fetch(`${WHISPER_API_URL}/voices/chunk/${encodeURIComponent(name)}`, {
		method: 'DELETE'
	});
	if (!res.ok) throw new Error(`Failed to delete voice chunk: ${res.status}`);
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

	const res = await fetch(`${WHISPER_API_URL}/transcribe-chunks`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal
	});
	if (!res.ok) throw new Error(`Failed to start transcription: ${res.status}`);
	return res;
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
	const res = await fetch(`${TTS_API_URL}/tts/mp3`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params),
		signal
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		const detail = (err as { detail?: unknown }).detail;
		const detailStr =
			detail == null
				? `Error ${res.status}`
				: typeof detail === 'string'
					? detail
					: JSON.stringify(detail);
		throw new Error(detailStr);
	}
	const durationSeconds = Number.parseFloat(res.headers.get('X-Duration-Seconds') ?? 'null');

	const blob = await res.blob();

	return { blob, durationSeconds };
}
