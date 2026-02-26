import { derived, writable } from "svelte/store"
import type { ChatMessageUI } from "@/types/chat.types"

// Store para los mensajes en UI
export const messages = writable<ChatMessageUI[]>([])

// Store para el contenido que se está streameando
export const streamingContent = writable<string>("")

// Store para saber si está cargando
export const isStreaming = writable<boolean>(false)

// Store para invalidar lista de chats
export const chatsRefresh = writable(0)

export function invalidateChats() {
	chatsRefresh.update((n) => n + 1)
}

// Helper functions
export function addMessage(message: ChatMessageUI) {
	messages.update((msgs) => [...msgs, message])
}

export function clearMessages() {
	messages.set([])
	streamingContent.set("")
}

export function setMessages(newMessages: ChatMessageUI[]) {
	messages.set(newMessages)
}

export function setStreamingContent(content: string) {
	streamingContent.set(content)
}

export function startStreaming() {
	isStreaming.set(true)
}

export function stopStreaming() {
	isStreaming.set(false)
	streamingContent.set("")
}

// Derived store para combinar mensajes + streaming
export const allMessages = derived(
	[messages, streamingContent],
	([$messages, $streamingContent]) => {
		if ($streamingContent) {
			return [...$messages, { role: "assistant" as const, content: $streamingContent }]
		}
		return $messages
	},
)
