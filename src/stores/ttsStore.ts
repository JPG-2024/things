import { writable } from "svelte/store"
import type { TTSLanguage, TTSOptions, TTSResult } from "@/lib/utils/tts"

export const ttsQueue = writable<TTSResult[] | null>(null)
export const isPlaying = writable<boolean>(false)
export const currentDuration = writable<number>(0)
