/**
 * Pure helpers for resolving which on-screen content block is under the
 * pointer. Listener wiring lives in `ttsTargetTracker.ts`; keeping this module
 * free of stores and side effects keeps it unit-testable under `bun test`.
 */

/** Attribute stamped on registered blocks (see `MarkdownRenderer`). */
export const TTS_TARGET_ATTRIBUTE = 'data-tts-target';

const TTS_TARGET_SELECTOR = `[${TTS_TARGET_ATTRIBUTE}]`;

/**
 * Innermost registered block containing `element`, or null when the pointer
 * sits outside every registered block. `closest` walks up, so a nested
 * renderer always wins over its ancestor.
 */
export function resolveTargetIdFromElement(element: Element | null): string | null {
	if (!element) return null;
	const id = element.closest(TTS_TARGET_SELECTOR)?.getAttribute(TTS_TARGET_ATTRIBUTE);
	return id ? id : null;
}

/** Id of the registered block under viewport point `(x, y)`, or null. */
export function resolveTargetIdAt(x: number, y: number): string | null {
	return resolveTargetIdFromElement(document.elementFromPoint(x, y));
}

/**
 * djb2 hash of the spoken text, used to key the TTS cache: re-pressing `S` on
 * unchanged content replays the cached audio, while content that changed since
 * the last press (streaming) regenerates.
 */
export function hashText(text: string): string {
	let hash = 5381;
	for (let i = 0; i < text.length; i++) {
		hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
	}
	return (hash >>> 0).toString(36);
}
