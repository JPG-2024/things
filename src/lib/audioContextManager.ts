let audioContext: AudioContext | null = null;

function attachStateListener(ctx: AudioContext): void {
	ctx.onstatechange = () => {
		if (ctx.state === 'closed' && audioContext === ctx) {
			audioContext = null;
		}
	};
}

export function getAudioContext(): AudioContext {
	if (!audioContext) {
		audioContext = new AudioContext();
		attachStateListener(audioContext);
	}
	return audioContext;
}

export function resetAudioContext(): AudioContext {
	if (audioContext) {
		try {
			void audioContext.close();
		} catch {
			// ignore close errors
		}
	}
	audioContext = new AudioContext();
	attachStateListener(audioContext);
	return audioContext;
}

export async function ensureAudioContext(forceReset = false): Promise<AudioContext> {
	if (forceReset) {
		return resetAudioContext();
	}

	const ctx = getAudioContext();

	if (ctx.state === 'suspended') {
		try {
			await ctx.resume();
		} catch {
			// resume failed, fall through to reset
		}
	}

	if (ctx.state !== 'running') {
		return resetAudioContext();
	}

	return ctx;
}

export function closeAudioContext(): void {
	if (audioContext) {
		try {
			void audioContext.close();
		} catch {
			// ignore close errors
		}
		audioContext = null;
	}
}
