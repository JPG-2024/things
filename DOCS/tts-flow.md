# TTS End-to-End Flow

This document traces the complete path of text-to-speech generation in Notian, from raw text input to final audio playback.

## Overview

```
Text Input
  → Split into chunks (splitText.ts)
    → Send each chunk to TTS API (ttsService.ts)
      → Receive audio Blob
        → Decode via Web Audio API (TTSPlayer.svelte)
          → Play through speakers
```

The system uses a **lazy generation** model: only the first chunk is synthesized upfront, and subsequent chunks are generated on-demand as playback approaches them, minimizing startup latency.

---

## 1. Entry Points

TTS generation can be triggered from 5 different places:

### a) Workflow Task (YouTube / Web / Raw)

The `GENERATE_TTS` task runs as part of a content processing workflow after the `TITLE_SUMMARY` task completes.

**`src/runners/youtube/tasks/youtubeWorkflow.ts:428-443`**
```ts
[TaskNames.GENERATE_TTS]: scriptTask({
    dependencies: [TaskNames.TITLE_SUMMARY],
    run: async ({ state, context }) => {
        const summary = getTaskState(state, TaskNames.TITLE_SUMMARY);
        const ctx = context as YouTubeTaskFactoryContext;
        if (ctx.freshRun) {
            ttsState.setTextContents([summary]);
            await ttsState.generateTTS(ctx.url);
        }
        return summary;
    }
})
```

The same pattern exists in `webWorkflow.ts` and `rawWorkflow.ts`. The `freshRun` flag prevents re-generating TTS when replaying a previously completed workflow.

### b) Chat Page

**`src/routes/chat/+page.svelte`** — After a streamed assistant response completes:
```ts
ttsState.addTextContent(streamedText);
void ttsState.generateTTS(assistantId);
```

### c) Hotkey `S`

**`src/components/Tasks/TasksRender.svelte`** — Pressing `S` while a task is selected takes the task's output data and generates TTS from it.

### d) Hotkey `Shift+S`

**`src/routes/+layout.svelte`** — Same as `S` but available globally from any route.

### e) Utility Function

**`src/lib/utils/tts.ts`** — `generateTTSfromArticleURL(url)` looks up a persisted article and triggers TTS from its title-summary data.

---

## 2. Text Preparation

**`src/stores/ttsStore.svelte.ts:77-79`** — The caller sets the text:
```ts
ttsState.setTextContents([summary]);
```

**`src/stores/ttsStore.svelte.ts:142-165`** — `generateTTS(id)` splits each text content into chunks:

```ts
const allChunks: string[] = [];
for (const text of this.textContents) {
    allChunks.push(...splitTextIntoChunks(text, this.config.splitLevel));
}
```

### Split Levels (`src/lib/utils/splitText.ts`)

| Level | Behavior |
|-------|----------|
| 0 (default) | Split by paragraphs (`\n\s*\n`). If single paragraph, split by sentences. |
| 1 | Split paragraphs further by sentence-ending punctuation (`.!?`). |
| 2 | Additionally split by clause boundaries (`,;:`). |
| 3 | Additionally split by soft breaks (em-dash/en-dash patterns). |

All levels apply `mergeSmallChunks()` which merges any chunk under 50 characters into the previous chunk, ensuring no chunk is too short for quality TTS synthesis.

---

## 3. Generation Initiation

**`src/stores/ttsStore.svelte.ts:142-241`** — `generateTTS(id)`:

1. **Cache check** — If the same `id` + config was already generated and blobs exist, it skips to playback immediately (line 147-156).
2. **Reset** — Calls `resetGenerationState()` which cancels any in-progress generation, releases existing blobs, and clears playback state.
3. **Session tracking** — Increments `_generationSession` to invalidate stale async operations.
4. **Reference audio assignment** — For each chunk, picks a reference voice sample. If `config.randomChunk` is true and `voiceChunks` exist, a random voice chunk is selected; otherwise the default `config.refAudioFilename` + `config.refText` is used.
5. **First chunk generation** — Calls `generateSpeech()` for `allChunks[0]`.
6. **State update** — On success, pushes the blob to `ttsState.blobs`, sets `isPlaying = true`.

### Lazy Chunk Generation

Only chunk 0 is generated eagerly. The store tracks:
- `_allChunks: string[]` — all text chunks
- `_nextChunkIndex: number` — index of the next chunk to generate
- `chunksGenerated: number` — how many chunks have been synthesized
- `totalChunks: number` — total chunk count
- `chunkNotifyVersion: number` — incremented after each new blob, used to notify the player

**`src/stores/ttsStore.svelte.ts:243-311`** — `generateNextChunk()` generates the next chunk in `_allChunks[_nextChunkIndex]` and pushes the resulting blob onto `ttsState.blobs`.

---

## 4. API Call

**`src/lib/utils/ttsService.ts:110-155`** — `generateSpeech()`:

```
POST {TTS_API_URL}/tts/mp3
Content-Type: application/json

{
    text,               // the chunk text
    ref_audio,          // reference audio filename for voice cloning
    ref_text,           // transcript of the reference audio
    num_step,           // inference steps (default 16)
    denoise,            // denoise the output
    guidance_scale,     // classifier-free guidance scale
    t_shift,            // optional time shift
    position_temperature,
    class_temperature,
    layer_penalty_factor,
    duration,           // optional target duration
    speed,              // playback speed (default 1.0)
    preprocess_prompt,  // preprocess the text prompt
    postprocess_output, // postprocess the audio output
    audio_chunk_duration,
    audio_chunk_threshold
}
```

Returns `{ blob: Blob, durationSeconds: number | null }`. The response body is the MP3 audio data.

---

## 5. Blob Storage and Signaling

**`src/stores/ttsStore.svelte.ts:220-225`** — After each chunk generation:
```ts
this.blobs.push(res.blob);
this.chunksGenerated = i + 1;
this.chunkNotifyVersion++;
this.isPlaying = true;
```

The `blobs` array is a Svelte 5 `$state` property. The `chunkNotifyVersion` counter is also reactive — `TTSPlayer.svelte` watches it to detect new chunks arriving during playback.

---

## 6. Audio Playback

**`src/components/TTSPlayer.svelte`** handles all playback.

### Startup

When `ttsState.isPlaying` becomes true and `decodedChunks` is empty (line 572-584):
```ts
if (ttsState.blobs.length > 0 && ttsState.isPlaying && decodedChunks.length === 0) {
    void startFresh();
}
```

`startFresh()` → `startPlayback()` → `playChunkAt(0)`.

### Chunk Decoding

**`ensureDecodedChunk(index)`** (line 79-87):
```ts
const ctx = getAudioContext();
const buf = await decodeBlob(ttsState.blobs[index], ctx);  // Blob → ArrayBuffer → AudioBuffer
decodedChunks[index] = buf;
```

### Web Audio Graph

**`playChunkAt(index, offsetInChunk)`** (line 89-147):
```
AudioBufferSourceNode → AnalyserNode → AudioContext.destination
```

- Creates a `BufferSource` with the decoded `AudioBuffer`
- Creates an `AnalyserNode` (fftSize=1024, smoothing=0.8) for waveform visualization
- Connects: `source → analyser → destination`
- Sets `source.onended = handleChunkEnded` to chain to the next chunk
- Starts playback at `offsetInChunk` (for seek/resume support)

### Chunk Chaining

**`handleChunkEnded()`** (line 149-172):
```ts
const nextIdx = currentChunkIndex + 1;
if (nextIdx < ttsState.blobs.length) {
    // blob already available → play immediately
    void playChunkAt(nextIdx);
} else if (nextIdx < ttsState.totalChunks) {
    // blob not yet generated → request next chunk, wait
    waitingForChunk = true;
    void ttsState.generateNextChunk();
}
```

When `generateNextChunk()` completes, it increments `chunkNotifyVersion`, which triggers a Svelte `$effect` (line 586-592):
```ts
$effect(() => {
    const version = ttsState.chunkNotifyVersion;
    if (version > 0 && waitingForChunk && ttsState.isPlaying && !isSettingUp) {
        waitingForChunk = false;
        void playChunkAt(currentChunkIndex + 1);
    }
});
```

### Prefetching

**`startCountdown()`** (line 246-267) runs a 500ms interval. When the current chunk is within `PREBUFFER_SECONDS` (2.3s) of finishing and the next blob hasn't been generated yet, it calls `ttsState.generateNextChunk()` proactively.

### Seeking and Pause/Resume

- **Pause** (line 183-198): Records `pausedAt` from elapsed time, stops the `AudioBufferSourceNode`.
- **Resume** (line 200-205): Finds the chunk and offset at `pausedAt` via `findChunkAtTime()`, calls `playChunkAt()`.
- **Seek** (line 282-301): Same as resume but at a calculated offset. Arrow keys seek ±5 seconds.

---

## 7. Visual Feedback

**`src/components/TTSPlayer.svelte:383-502`** — Three waveform states:

| State | When | Function |
|-------|------|----------|
| Generating wave | `isGenerating && chunksGenerated === 0` | `drawGeneratingWave()` — animated sine waves using harmonics from `ttsPlayerConfig` |
| Idle line | `isGenerating` or `waitingForChunk` | `drawIdleLine()` — flat horizontal line |
| Waveform | `isPlaying && !isPaused && analyserNode` | `drawWaveform()` — real-time audio visualization from the `AnalyserNode` |

The animation loop (line 530-548) runs via `requestAnimationFrame` and checks which state to render. The stroke color uses `viewState.primaryColorAlpha()` to tint the wave to the current video's dominant color.

---

## 8. Supporting Modules

### Audio Context Manager (`src/lib/audioContextManager.ts`)

Singleton `AudioContext` management:

| Function | Purpose |
|----------|---------|
| `getAudioContext()` | Get or create the singleton context |
| `ensureAudioContext()` | Get context, resume if suspended, reset if not running |
| `resetAudioContext()` | Close and recreate the context |
| `closeAudioContext()` | Close and null the context |

Called before any TTS generation or playback to satisfy browser autoplay policies.

### TTS Player Config (`src/lib/ttsPlayerConfig.ts`)

Defines 4 wave animation styles (`softSingleDim`, `organicMultiDim`, `softSingleBright`, `organicMultiBright`). Each specifies harmonics (cycles, amplitude, speed), base amplitude, point count, and stroke alpha. The default is `organicMultiBright`.

### TTS Service (`src/lib/utils/ttsService.ts`)

The HTTP layer. Two API endpoints:
- `POST {TTS_API_URL}/tts/mp3` — speech generation (returns MP3 blob)
- `POST {WHISPER_API_URL}/transcribe-chunks` — voice profile creation (SSE stream)
- `GET {WHISPER_API_URL}/voices` — list voice profiles
- `GET {WHISPER_API_URL}/voices/{id}` — list voice chunks for a profile
- `DELETE {WHISPER_API_URL}/voices/chunk/{name}` — delete a voice chunk
- `DELETE {WHISPER_API_URL}/voices/{id}` — delete a voice profile

---

## 9. Configuration

**`TTSConfig`** (`src/stores/ttsStore.svelte.ts:10-26`):

| Field | Default | Description |
|-------|---------|-------------|
| `refAudioFilename` | `920d866c-..._1.mp3` | Reference audio for voice cloning |
| `refText` | Spanish sentence | Transcript of reference audio |
| `numStep` | 16 | Inference steps |
| `denoise` | true | Denoise output |
| `guidanceScale` | 3.0 | Classifier-free guidance |
| `speed` | 1.0 | Playback speed |
| `preprocessPrompt` | true | Preprocess text prompt |
| `postprocessOutput` | true | Postprocess audio |
| `randomChunk` | false | Use random voice per chunk |
| `splitLevel` | 0 | Text split granularity (0-3) |

Additional optional fields: `tShift`, `positionTemperature`, `classTemperature`, `layerPenaltyFactor`, `duration`, `audioChunkDuration`, `audioChunkThreshold`.

Settings are editable via the TTSSettings drawer (hotkey `,`).

---

## 10. Cancellation and Cleanup

- **`cancelGeneration()`** — Aborts the in-flight fetch, increments session to invalidate stale callbacks, clears chunk state.
- **`fullReset()`** — Cancels generation, releases blobs, resets all playback state, optionally clears text contents.
- **`stopPlayback()`** (in TTSPlayer) — Cleans up Web Audio nodes, calls `ttsState.fullReset()` and `closeAudioContext()`.
- **Escape key** — Bound to `stopPlayback()` in TTSPlayer.
- **Navigation** — `afterNavigate(() => ttsState.clearPlaylist())` in the root layout pauses playback on route change.
