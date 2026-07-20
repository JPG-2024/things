<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { tick } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import { startMicRecording, stopMicRecording, sendAudio } from '@/lib/utils/micService';
	import { generateSpeech } from '@/lib/utils/ttsService';
	import { splitTextIntoChunks } from '@/lib/utils/splitText';
	import { chatCompletions, type LlamaChatMessage } from '@/lib/utils/inference/chat-completions-provider';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import {
		getAudioContext,
		ensureAudioContext,
		closeAudioContext
	} from '@/lib/audioContextManager';
	import { getCurrentStyle } from '@/lib/ttsPlayerConfig';
	import { createHotkey } from '@tanstack/svelte-hotkeys';

	let { onExit }: { onExit: () => void } = $props();

	type ConvStatus = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

	interface ConvMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
	}

	const config = getCurrentStyle();

	let status = $state<ConvStatus>('idle');
	let messages = $state<ConvMessage[]>([]);
	let streamedText = $state('');
	let errorMessage = $state('');
	let messagesContainer = $state<HTMLDivElement | null>(null);

	let canvas = $state<HTMLCanvasElement | null>(null);
	let currentSource = $state<AudioBufferSourceNode | null>(null);
	let analyserNode = $state<AnalyserNode | null>(null);
	let micAnalyserNode = $state<AnalyserNode | null>(null);
	let animationFrame: number | null = null;

	let chunkBuffer: Float32Array[] = [];
	let bufferedSamples = 0;
	let abortController: AbortController | null = null;
	let showChat = $state(false);

	let convBlobs: Blob[] = [];
	let convPlayIndex = 0;
	let convGenAbort: AbortController | null = null;
	let convGenDone = false;
	let convBlobReady: (() => void) | null = null;

	const amplitudeScale = 0.1;
	const wavelengthScale = 300;
	const SINE_FILL_ALPHA = 0.24;
	const WAVE_STROKE_WIDTH = 4;
	const SPLINE_SAMPLE_STEP = 0.1;
	const SPLINE_SAMPLE_COUNT = Math.round(1 / SPLINE_SAMPLE_STEP);
	const MAX_WAVE_AMPLITUDE_PX = 10;

	function generateId(): string {
		return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	createHotkey('Space', handleSpacePress, () => ({
		enabled: true,
		ignoreInputs: true,
		preventDefault: true,
		stopPropagation: true
	}));

	createHotkey('Escape', handleExit, () => ({
		enabled: true,
		ignoreInputs: true,
		preventDefault: true,
		stopPropagation: true
	}));

	async function handleSpacePress() {
		if (status === 'recording') {
			stopRecordingAndProcess();
		} else if (status === 'speaking') {
			stopSpeaking();
			await startRecording();
		} else if (status === 'idle') {
			await startRecording();
		}
	}

	async function startRecording() {
		if (status !== 'idle') return;

		errorMessage = '';
		chunkBuffer = [];
		bufferedSamples = 0;

		try {
			const { analyser } = await startMicRecording((pcm) => {
				chunkBuffer.push(pcm);
				bufferedSamples += pcm.length;
			});
			micAnalyserNode = analyser;
			status = 'recording';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to start microphone';
			status = 'idle';
		}
	}

	function stopRecordingAndProcess() {
		if (status !== 'recording') return;

		stopMicRecording();
		micAnalyserNode = null;
		status = 'transcribing';

		void processRecording();
	}

	async function processRecording() {
		if (bufferedSamples === 0) {
			status = 'idle';
			return;
		}

		const total = new Float32Array(bufferedSamples);
		let offset = 0;
		for (const chunk of chunkBuffer) {
			total.set(chunk, offset);
			offset += chunk.length;
		}
		chunkBuffer = [];
		bufferedSamples = 0;

		const text = await sendAudio(total);
		if (!text || !text.trim()) {
			status = 'idle';
			return;
		}

		const extraPrompt = viewState.conversationExtraUserPrompt.trim();
		const finalText = extraPrompt ? `${extraPrompt}\n${text.trim()}` : text.trim();

		const userMsg: ConvMessage = {
			id: generateId(),
			role: 'user',
			content: finalText
		};
		messages.push(userMsg);
		void scrollToBottom();

		await generateResponse();
	}

	async function generateResponse() {
		status = 'thinking';
		streamedText = '';

		const assistantId = generateId();
		const assistantMsg: ConvMessage = {
			id: assistantId,
			role: 'assistant',
			content: ''
		};
		messages.push(assistantMsg);
		void scrollToBottom();

		const historyForApi: LlamaChatMessage[] = [
			{ role: 'system', content: viewState.conversationSystemPrompt }
		];
		for (const m of messages) {
			if (m.id === assistantId) break;
			historyForApi.push({ role: m.role, content: m.content });
		}

		abortController = new AbortController();

		try {
			const response = await chatCompletions(
				{
					model: 'llama-server',
					messages: historyForApi,
					temperature: viewState.conversationTemperature,
					max_completion_tokens: viewState.conversationMaxTokens,
					top_p: viewState.conversationTopP,
					frequency_penalty: viewState.conversationFrequencyPenalty,
					presence_penalty: viewState.conversationPresencePenalty
				},
				{
					signal: abortController.signal,
					onToken: (token) => {
						streamedText += token;
						const idx = messages.findIndex((m) => m.id === assistantId);
						if (idx !== -1) {
							messages[idx] = { ...messages[idx], content: streamedText };
						}
						void scrollToBottom();
					}
				}
			);

			console.log(response);

			const finalText = response.choices?.[0]?.message?.content;
			if (typeof finalText === 'string' && finalText.trim()) {
				streamedText = finalText;
			}

			const idx = messages.findIndex((m) => m.id === assistantId);
			if (idx !== -1) {
				messages[idx] = { ...messages[idx], content: streamedText };
			}

			if (streamedText.trim()) {
				if (viewState.autoSpeechEnabled) {
					await speakText(streamedText);
				} else {
					status = 'idle';
				}
			} else {
				status = 'idle';
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				status = 'idle';
				return;
			}
			errorMessage = err instanceof Error ? err.message : 'Failed to generate response';
			status = 'idle';
		} finally {
			abortController = null;
		}
	}

	async function speakText(text: string) {
		status = 'speaking';

		const chunks = splitTextIntoChunks(text, ttsState.config.splitLevel);
		if (chunks.length === 0) {
			status = 'idle';
			return;
		}

		convBlobs = [];
		convPlayIndex = 0;
		convGenDone = false;
		convBlobReady = null;

		convGenAbort = new AbortController();
		void generateConvChunks(chunks);

		try {
			await playConvBlobsSequentially();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return;
			}
			errorMessage = err instanceof Error ? err.message : 'Failed to play speech';
			status = 'idle';
		}
	}

	async function generateConvChunks(chunks: string[]) {
		const signal = convGenAbort?.signal;
		for (let i = 0; i < chunks.length; i++) {
			if (signal?.aborted) break;
			try {
				const voiceRef = ttsState.getVoiceRef();
				const res = await generateSpeech(
					{
						text: chunks[i],
						ref_audio: voiceRef.refAudioFilename,
						ref_text: voiceRef.refText,
						num_step: ttsState.config.numStep,
						denoise: ttsState.config.denoise,
						guidance_scale: ttsState.config.guidanceScale,
						t_shift: ttsState.config.tShift,
						position_temperature: ttsState.config.positionTemperature,
						class_temperature: ttsState.config.classTemperature,
						layer_penalty_factor: ttsState.config.layerPenaltyFactor,
						duration: ttsState.config.duration,
						speed: ttsState.config.speed,
						preprocess_prompt: ttsState.config.preprocessPrompt,
						postprocess_output: ttsState.config.postprocessOutput,
						audio_chunk_duration: ttsState.config.audioChunkDuration,
						audio_chunk_threshold: ttsState.config.audioChunkThreshold
					},
					signal
				);
				if (signal?.aborted) break;
				if (res.blob.size === 0) continue;
				convBlobs.push(res.blob);
				if (convBlobReady) {
					const resolve = convBlobReady;
					convBlobReady = null;
					resolve();
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') break;
				errorMessage = err instanceof Error ? err.message : 'Failed to generate speech';
				break;
			}
		}
		convGenDone = true;
		if (convBlobReady) {
			const resolve = convBlobReady;
			convBlobReady = null;
			resolve();
		}
	}

	async function playConvBlobsSequentially() {
		while (true) {
			if (convPlayIndex < convBlobs.length) {
				await playBlob(convBlobs[convPlayIndex]);
				convPlayIndex++;
				if (status !== 'speaking') return;
			} else if (!convGenDone) {
				await new Promise<void>((resolve) => {
					convBlobReady = resolve;
				});
			} else {
				break;
			}
		}
		status = 'idle';
	}

	async function playBlob(blob: Blob) {
		await ensureAudioContext();
		const ctx = getAudioContext();
		const arrayBuffer = await blob.arrayBuffer();
		const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

		const source = ctx.createBufferSource();
		source.buffer = audioBuffer;

		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		analyser.smoothingTimeConstant = 0.8;
		analyser.minDecibels = -90;
		analyser.maxDecibels = -10;

		source.connect(analyser);
		analyser.connect(ctx.destination);

		return new Promise<void>((resolve) => {
			source.onended = () => {
				if (currentSource === source) {
					currentSource = null;
					analyserNode = null;
					cleanupAnalyser();
				}
				resolve();
			};

			source.start(0);
			currentSource = source;
			analyserNode = analyser;
		});
	}

	function stopSpeaking() {
		if (convGenAbort) {
			convGenAbort.abort();
			convGenAbort = null;
		}
		if (convBlobReady) {
			const resolve = convBlobReady;
			convBlobReady = null;
			resolve();
		}
		convGenDone = true;
		if (currentSource) {
			currentSource.onended = null;
			try {
				currentSource.stop();
			} catch {
				// ignore
			}
			currentSource.disconnect();
			currentSource = null;
		}
		cleanupAnalyser();
		status = 'idle';
	}

	function cleanupAnalyser() {
		if (analyserNode) {
			try {
				analyserNode.disconnect();
			} catch {
				// ignore
			}
			analyserNode = null;
		}
	}

	function handleExit() {
		if (status === 'recording') {
			stopMicRecording();
			micAnalyserNode = null;
		}
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		if (convGenAbort) {
			convGenAbort.abort();
			convGenAbort = null;
		}
		stopSpeaking();
		closeAudioContext();
		onExit();
	}

	function catmullRomSpline(p0: number, p1: number, p2: number, p3: number, t: number): number {
		const t2 = t * t;
		const t3 = t2 * t;
		return (
			0.5 *
			(2 * p1 +
				(-p0 + p2) * t +
				(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
				(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
		);
	}

	function resizeCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
		const pixelRatio = window.devicePixelRatio || 1;
		const scaledWidth = Math.floor(width * pixelRatio);
		const scaledHeight = Math.floor(height * pixelRatio);

		if (canvas!.width !== scaledWidth || canvas!.height !== scaledHeight) {
			canvas!.width = scaledWidth;
			canvas!.height = scaledHeight;
			ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		}
	}

	function drawWaveform(analyser: AnalyserNode) {
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		resizeCanvas(ctx, width, height);

		const bufferLength = analyser.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);
		analyser.getByteTimeDomainData(dataArray);

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `rgba(0, 0, 0, ${SINE_FILL_ALPHA})`;
		ctx.fillRect(0, 0, width, height);

		const sampleStep = Math.max(1, Math.floor((bufferLength / width / 2) * wavelengthScale));
		const points: number[] = [];

		for (let i = 0; i < bufferLength; i += sampleStep) {
			const value = dataArray[i];
			const normalized = (value / 255 - 0.5) * height * amplitudeScale;
			const y = height / 2 - normalized;
			points.push(y);
		}

		const path = new Path2D();
		const pixelStep = width / (points.length - 1);

		if (points.length >= 2) {
			path.moveTo(0, points[0]);
			for (let i = 0; i < points.length - 1; i += 1) {
				const p0 = points[i - 1] ?? points[0];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = points[i + 2] ?? points[points.length - 1];

				for (let j = 1; j <= SPLINE_SAMPLE_COUNT; j += 1) {
					const t = j * SPLINE_SAMPLE_STEP;
					const y = catmullRomSpline(p0, p1, p2, p3, t);
					const x = (i + t) * pixelStep;
					path.lineTo(x, y);
				}
			}
		}

		ctx.strokeStyle = viewState.primaryColorAlpha(config.strokeAlpha);
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function drawGeneratingWave() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width === 0 || height === 0) return;

		resizeCanvas(ctx, width, height);

		const t = performance.now() / 1000;
		const amplitude = Math.min(height * config.amplitude, MAX_WAVE_AMPLITUDE_PX);
		const pointCount = config.pointCount;
		const phaseSpeed = config.baseSpeed;

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `rgba(0, 0, 0, ${SINE_FILL_ALPHA})`;
		ctx.fillRect(0, 0, width, height);

		const points: number[] = [];
		for (let i = 0; i < pointCount; i += 1) {
			const u = pointCount === 1 ? 0 : i / (pointCount - 1);
			let y = height / 2;
			for (const h of config.harmonics) {
				y +=
					amplitude *
					h.amplitudeRatio *
					Math.sin(2 * Math.PI * h.cycles * u - t * phaseSpeed * h.speedRatio);
			}
			points.push(y);
		}

		const path = new Path2D();
		const pixelStep = width / (points.length - 1);

		if (points.length >= 2) {
			path.moveTo(0, points[0]);
			for (let i = 0; i < points.length - 1; i += 1) {
				const p0 = points[i - 1] ?? points[0];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = points[i + 2] ?? points[points.length - 1];

				for (let j = 1; j <= SPLINE_SAMPLE_COUNT; j += 1) {
					const tt = j * SPLINE_SAMPLE_STEP;
					const y = catmullRomSpline(p0, p1, p2, p3, tt);
					const x = (i + tt) * pixelStep;
					path.lineTo(x, y);
				}
			}
		}

		ctx.strokeStyle = viewState.primaryColorAlpha(config.strokeAlpha);
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function drawIdleLine() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width === 0 || height === 0) return;

		resizeCanvas(ctx, width, height);

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = `rgba(0, 0, 0, ${SINE_FILL_ALPHA})`;
		ctx.fillRect(0, 0, width, height);

		const path = new Path2D();
		path.moveTo(0, height / 2);
		path.lineTo(width, height / 2);

		ctx.strokeStyle = viewState.primaryColorAlpha(config.strokeAlpha);
		ctx.lineWidth = WAVE_STROKE_WIDTH;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function startAnimation() {
		if (animationFrame !== null) return;

		const step = () => {
			if (analyserNode && status === 'speaking') {
				drawWaveform(analyserNode);
			} else if (micAnalyserNode && status === 'recording') {
				drawWaveform(micAnalyserNode);
			} else if (status === 'transcribing' || status === 'thinking') {
				drawGeneratingWave();
				//drawIdleLine();
			} else {
				drawIdleLine();
			}
			animationFrame = requestAnimationFrame(step);
		};

		animationFrame = requestAnimationFrame(step);
	}

	function stopAnimation() {
		if (animationFrame !== null) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	}

	$effect(() => {
		startAnimation();
		return () => stopAnimation();
	});

	$effect(() => {
		return () => {
			if (status === 'recording') {
				stopMicRecording();
				micAnalyserNode = null;
			}
			if (abortController) {
				abortController.abort();
			}
			if (convGenAbort) {
				convGenAbort.abort();
			}
			stopSpeaking();
			closeAudioContext();
		};
	});

	const statusLabel = $derived(
		status === 'idle'
			? 'Press space to speak'
			: status === 'recording'
				? 'Listening...'
				: status === 'transcribing'
					? 'Transcribing...'
					: status === 'thinking'
						? 'Thinking...'
						: 'Speaking...'
	);
</script>

<div
	in:fade={{ duration: 100, easing: cubicOut }}
	out:fade={{ duration: 200 }}
	class="conversation-mode"
>
	<div class="conversation-mode__header">
		<span class="conversation-mode__status-label">{statusLabel}</span>
		<!-- 		{#if status === 'recording'}
			<span class="conversation-mode__recording-dot"></span>
		{/if} -->
		<button
			type="button"
			class="conversation-mode__toggle-chat-btn"
			onclick={() => (showChat = !showChat)}
			aria-label={showChat ? 'Hide chat' : 'Show chat'}
		>
			<Icon
				name={showChat ? 'MessageSquare' : 'MessageSquareOff'}
				size={20}
				color={viewState.primaryColor}
			/>
		</button>
		<button
			type="button"
			class="conversation-mode__settings-btn"
			onclick={() => drawersState.toggle('conversation-settings')}
			aria-label="Conversation settings"
		>
			<Icon name="Cog" size={20} color={viewState.primaryColor} />
		</button>
		<button
			type="button"
			class="conversation-mode__exit-btn"
			onclick={handleExit}
			aria-label="Exit"
		>
			<Icon name="X" size={24} color={viewState.primaryColor} />
		</button>
	</div>

	{#if showChat}
		<div class="conversation-mode__messages" bind:this={messagesContainer}>
			{#if messages.length === 0}
				<div class="conversation-mode__empty">
					<p>Hold space to start talking</p>
				</div>
			{/if}

			{#each messages as msg (msg.id)}
				<div
					class="conversation-mode__message"
					class:conversation-mode__message--user={msg.role === 'user'}
					class:conversation-mode__message--assistant={msg.role === 'assistant'}
				>
					<span class="conversation-mode__message-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
					<p class="conversation-mode__message-text">{msg.content}</p>
				</div>
			{/each}
		</div>
	{/if}

	<div
		class="conversation-mode__canvas-container"
		class:conversation-mode__canvas-container--expanded={!showChat}
	>
		<canvas bind:this={canvas} class="conversation-mode__canvas" aria-hidden="true"></canvas>
	</div>

	{#if errorMessage}
		<div class="conversation-mode__error">
			<span>{errorMessage}</span>
			<button type="button" onclick={() => (errorMessage = '')}>×</button>
		</div>
	{/if}
</div>

<style>
	.conversation-mode {
		display: flex;
		flex-direction: column;
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.95);
		z-index: 1100;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.conversation-mode__header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		flex-shrink: 0;
		position: relative;
	}

	.conversation-mode__status-label {
		color: var(--primary-color);
		font-size: 0.8rem;
		font-weight: 500;
		opacity: 0.8;
	}

	.conversation-mode__recording-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #ff4444;
		animation: pulse-dot 1s ease-in-out infinite;
	}

	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.3);
		}
	}

	.conversation-mode__exit-btn {
		all: unset;
		position: absolute;
		top: 1rem;
		right: 1.5rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		opacity: 0.6;
		transition: opacity 0.2s;
	}

	.conversation-mode__exit-btn:hover {
		opacity: 1;
	}

	.conversation-mode__toggle-chat-btn {
		all: unset;
		position: absolute;
		top: 1rem;
		right: 4.5rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		opacity: 0.6;
		transition: opacity 0.2s;
	}

	.conversation-mode__toggle-chat-btn:hover {
		opacity: 1;
	}

	.conversation-mode__settings-btn {
		all: unset;
		position: absolute;
		top: 1rem;
		right: 7.5rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		opacity: 0.6;
		transition: opacity 0.2s;
	}

	.conversation-mode__settings-btn:hover {
		opacity: 1;
	}

	.conversation-mode__messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		scroll-behavior: smooth;
	}

	.conversation-mode__empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: rgba(255, 255, 255, 0.25);
		font-size: 1.1rem;
	}

	.conversation-mode__message {
		max-width: 75%;
		padding: 0.6rem 1rem;
		border-radius: 12px;
		line-height: 1.5;
	}

	.conversation-mode__message--user {
		align-self: flex-end;
		background: rgba(var(--primary-color-rgb, 120, 100, 255), 0.15);
		border: 1px solid rgba(var(--primary-color-rgb, 120, 100, 255), 0.25);
	}

	.conversation-mode__message--assistant {
		align-self: flex-start;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.conversation-mode__message-role {
		display: block;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.5;
		margin-bottom: 0.2rem;
	}

	.conversation-mode__message-text {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.conversation-mode__canvas-container {
		width: 100%;
		height: 120px;
		flex-shrink: 0;
	}

	.conversation-mode__canvas-container--expanded {
		flex: 1;
		height: auto;
	}

	.conversation-mode__canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	.conversation-mode__error {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 80, 80, 0.15);
		border: 1px solid rgba(255, 80, 80, 0.4);
		border-radius: 8px;
		color: #ff5a5a;
		font-size: 0.85rem;
		z-index: 5;
	}

	.conversation-mode__error button {
		all: unset;
		cursor: pointer;
		font-size: 1.2rem;
		line-height: 1;
		opacity: 0.7;
	}

	.conversation-mode__error button:hover {
		opacity: 1;
	}
</style>
