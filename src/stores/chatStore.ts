import { derived, writable } from 'svelte/store';
import type { ChatMessageUI } from '@/types/chat.types';

const MAX_MESSAGES = 200;

export const messages = writable<ChatMessageUI[]>([]);

export const streamingContent = writable<string>('');

export const isStreaming = writable<boolean>(false);

export const chatsRefresh = writable(0);

export function invalidateChats() {
	chatsRefresh.update((n) => n + 1);
}

function trimMessages(msgs: ChatMessageUI[]): ChatMessageUI[] {
	if (msgs.length <= MAX_MESSAGES) {
		return msgs;
	}
	return msgs.slice(-MAX_MESSAGES);
}

export function addMessage(message: ChatMessageUI) {
	messages.update((msgs) => trimMessages([...msgs, message]));
}

export function clearMessages() {
	messages.set([]);
	streamingContent.set('');
}

export function setMessages(newMessages: ChatMessageUI[]) {
	messages.set(newMessages);
}

export function setStreamingContent(content: string) {
	streamingContent.set(content);
}

export function startStreaming() {
	isStreaming.set(true);
}

export function stopStreaming() {
	isStreaming.set(false);
	streamingContent.set('');
}

// Derived store para combinar mensajes + streaming
export const allMessages = derived(
	[messages, streamingContent],
	([$messages, $streamingContent]) => {
		if ($streamingContent) {
			return [...$messages, { role: 'assistant' as const, content: $streamingContent }];
		}
		return $messages;
	}
);
