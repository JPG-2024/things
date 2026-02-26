import { invoke } from "@tauri-apps/api/core"

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Options for TTS synthesis
 */
export interface TTSOptions {
	/** Path to ONNX model directory (default: "assets/onnx") */
	onnx_dir?: string
	/** Number of denoising steps (default: 5) */
	total_step?: number
	/** Speech speed factor, higher = faster (default: 1.05) */
	speed?: number
}

/**
 * Result from TTS synthesis
 */
export interface TTSResult {
	/** Path to the generated WAV file in system temp directory */
	file_path: string
	/** Duration of the audio in seconds */
	duration: number
}

// ============================================================================
// Available Languages
// ============================================================================

export const AVAILABLE_LANGUAGES = ["en", "ko", "es", "pt", "fr"] as const
export type TTSLanguage = (typeof AVAILABLE_LANGUAGES)[number]

/**
 * Check if a language code is valid for TTS
 */
export function isValidLanguage(lang: string): lang is TTSLanguage {
	return AVAILABLE_LANGUAGES.includes(lang as TTSLanguage)
}

// ============================================================================
// Tauri Command Wrappers
// ============================================================================

/**
 * Synthesize speech from text
 *
 * @param text - Text to convert to speech
 * @param lang - Language code (en, ko, es, pt, fr)
 * @param voiceStylePath - Path to voice style JSON file (e.g., "assets/voice_styles/M1.json")
 * @param options - Optional synthesis parameters
 * @returns Promise resolving to TTSResult with file path and duration
 *
 * @example
 * ```typescript
 * const result = await synthesizeSpeech(
 *   "Hello, world!",
 *   "en",
 *   "assets/voice_styles/M1.json",
 *   { speed: 1.2, total_step: 10 }
 * );
 * console.log("Audio saved to:", result.file_path);
 * console.log("Duration:", result.duration, "seconds");
 * ```
 */
export async function synthesizeSpeech(
	text: string,
	lang: TTSLanguage,
	voiceStylePath: string,
	options?: TTSOptions,
): Promise<TTSResult> {
	if (!isValidLanguage(lang)) {
		throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGUAGES.join(", ")}`)
	}

	return await invoke<TTSResult>("synthesize_speech", {
		text,
		lang,
		voiceStylePath,
		options: options || null,
	})
}

/**
 * Synthesize speech from multiple texts in batch mode
 *
 * @param texts - Array of texts to convert to speech
 * @param langs - Array of language codes (must match texts length)
 * @param voiceStylePaths - Array of voice style paths (must match texts length)
 * @param options - Optional synthesis parameters
 * @returns Promise resolving to array of TTSResult
 *
 * @example
 * ```typescript
 * const results = await synthesizeSpeechBatch(
 *   ["Hello", "Bonjour", "Hola"],
 *   ["en", "fr", "es"],
 *   [
 *     "assets/voice_styles/M1.json",
 *     "assets/voice_styles/F1.json",
 *     "assets/voice_styles/M2.json"
 *   ],
 *   { speed: 1.0 }
 * );
 *
 * results.forEach((result, i) => {
 *   console.log(`Audio ${i + 1}:`, result.file_path);
 * });
 * ```
 */
export async function synthesizeSpeechBatch(
	texts: string[],
	langs: TTSLanguage[],
	voiceStylePaths: string[],
	options?: TTSOptions,
): Promise<TTSResult[]> {
	// Validate lengths
	if (texts.length !== langs.length) {
		throw new Error(
			`Number of texts (${texts.length}) must match number of languages (${langs.length})`,
		)
	}
	if (texts.length !== voiceStylePaths.length) {
		throw new Error(
			`Number of texts (${texts.length}) must match number of voice styles (${voiceStylePaths.length})`,
		)
	}

	// Validate languages
	for (const lang of langs) {
		if (!isValidLanguage(lang)) {
			throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGUAGES.join(", ")}`)
		}
	}

	return await invoke<TTSResult[]>("synthesize_speech_batch", {
		texts,
		langs,
		voiceStylePaths,
		options: options || null,
	})
}

/**
 * Clean up a TTS-generated WAV file from temp directory
 *
 * @param filePath - Path to the WAV file to delete (must be in temp directory)
 * @returns Promise that resolves when file is deleted
 *
 * @example
 * ```typescript
 * const result = await synthesizeSpeech("Hello", "en", "assets/voice_styles/M1.json");
 *
 * // Play the audio...
 * await playAudio(result.file_path);
 *
 * // Clean up after playback
 * await cleanupTTSFile(result.file_path);
 * ```
 */
export async function cleanupTTSFile(filePath: string): Promise<void> {
	await invoke("cleanup_tts_file", { filePath })
}

// ============================================================================
// Voice Style Helpers
// ============================================================================

/**
 * Common voice style presets
 */
export const VOICE_STYLES = {
	male1: "assets/voice_styles/M1.json",
	male2: "assets/voice_styles/M2.json",
	female1: "assets/voice_styles/F1.json",
	female2: "assets/voice_styles/F2.json",
} as const

export type VoiceStylePreset = keyof typeof VOICE_STYLES

/**
 * Play a TTS-generated audio file
 *
 * @param filePath - Path to the WAV file to play
 * @returns Promise that resolves when playback finishes
 *
 * @example
 * ```typescript
 * const result = await synthesizeSpeech("Hello", "en", VOICE_STYLES.male1);
 * await playTTS(result.file_path);
 * ```
 */
export async function playTTS(filePath: string): Promise<void> {
	await invoke("play_tts_file", { filePath })
}

/**
 * Get voice style path from preset name
 */
export function getVoiceStylePath(preset: VoiceStylePreset): string {
	return VOICE_STYLES[preset]
}
