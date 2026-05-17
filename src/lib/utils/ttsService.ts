const TTS_API_URL = import.meta.env.VITE_TTS_API_URL;
const WHISPER_API_URL = import.meta.env.VITE_WHISPER_API_URL;

export interface Voice {
	name: string;
	name_prefix: string;
	audio_file: string;
	text_reference: string;
	language: string;
}

export async function fetchVoices(): Promise<Voice[]> {
	const res = await fetch(`${WHISPER_API_URL}/voices`);
	if (!res.ok) throw new Error(`Failed to fetch voices: ${res.status}`);
	const data: { chunks: Voice[] } = await res.json();
	console.log(data);
	return data.chunks;
}

export async function addVoice(params: {
	url: string;
	segment?: string;
	name_prefix?: string;
	chunk_count?: number;
}): Promise<{ taskId: string; source: EventSource }> {
	const res = await fetch(`${WHISPER_API_URL}/transcribe-chunks`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			url: params.url,
			segment: params.segment ?? '*00:00-01:00',
			name_prefix: params.name_prefix ?? 'chunk',
			chunk_count: params.chunk_count ?? 5
		})
	});
	if (!res.ok) throw new Error(`Failed to start transcription: ${res.status}`);
	const { task_id } = (await res.json()) as { task_id: string };
	const source = new EventSource(`${WHISPER_API_URL}/transcribe-chunks/events/${task_id}`);
	return { taskId: task_id, source };
}

export async function generateSpeech(params: {
	text: string;
	instruct?: string;
	lang: string;
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
}): Promise<{ blob: Blob; durationSeconds: number | null }> {
	const res = await fetch(`${TTS_API_URL}/tts/mp3`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params)
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
