# TTS Voice Chunk Index Log

## Goal
Display the voice profile chunk index used for the last generated TTS chunk in a floating div at the bottom-right corner, using primary color and small font, for logging purposes. Works for both ttsStore and podcastStore.

## Changes

### 1. `src/features/podcast/podcastStore.svelte.ts`
- Add `lastVoiceChunkIndex = $state<number | null>(null)` field (after `isGenerating`).
- In `getVoiceRef()`, capture the random index and set `this.lastVoiceChunkIndex = idx`.
- In `stop()`, clear to `null`.
- In `fullReset()`, clear to `null`.

### 2. `src/features/podcast/PodcastMode.svelte`
- Add a floating div at bottom-right displaying `podcastState.lastVoiceChunkIndex`.
- Format: `Voice: #{index}` if index >= 0, or `Voice: default` if -1.
- Only render when `podcastState.lastVoiceChunkIndex !== null`.
- Style: `position: fixed; bottom: 1rem; right: 1rem; color: var(--primary-color); font-size: 0.7rem; pointer-events: none; opacity: 0.8; z-index: 1101;` (above podcast overlay).

### 3. No changes to `+layout.svelte`
- The layout log already works for ttsState. PodcastMode adds its own log that reads from podcastState.
