# Extract cleanup logic from stopPlayback in TTSPlayer.svelte

## Goal

Extract all cleanup logic from `stopPlayback` into a separate reusable function.

## File

`src/components/TTSPlayer.svelte`

## Changes

### 1. Create `cleanupPlayback()` function

Extract all logic currently in `stopPlayback` (lines 181-198) into a new function `cleanupPlayback()`:

- Stop and disconnect `currentSource` (null its `onended`, call `stop()`, `disconnect()`, set to `null`)
- Call `cleanupAnalyser()`
- Call `clearCountdown()`
- Reset local state: `isPaused = false`, `pausedAt = 0`, `elapsedSeconds = 0`, `combinedBuffer = null`
- Reset store state: `ttsState.isPlaying = false`, `ttsState.errorMessage = ''`

### 2. Simplify `stopPlayback()`

Make `stopPlayback` a one-liner that calls `cleanupPlayback()`.

### Result

```typescript
function cleanupPlayback() {
	if (currentSource) {
		currentSource.onended = null;
		currentSource.stop();
		currentSource.disconnect();
		currentSource = null;
	}
	cleanupAnalyser();
	clearCountdown();

	isPaused = false;
	pausedAt = 0;
	elapsedSeconds = 0;
	combinedBuffer = null;

	ttsState.isPlaying = false;
	ttsState.errorMessage = '';
}

function stopPlayback() {
	cleanupPlayback();
}
```

## Scope

- Only `stopPlayback` is refactored. `pausePlayback` and `seekTo` remain unchanged.
- No new imports, no API changes, no behavioral changes.

## Verification

- `bun run check` (svelte-check) on the modified file
- Manual smoke test: play, pause, stop in the TTS player to confirm no regressions
