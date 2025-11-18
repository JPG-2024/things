import { writable } from "svelte/store";

export const messages = writable<ChatMessage[]>([]);
export const chatsRefresh = writable(0)

export function invalidateChats() {
  chatsRefresh.update((n) => n + 1)
}

// Helper functions for message management
export function addMessage(message: ChatMessage) {
  messages.update(msgs => [...msgs, message]);
}

export function clearMessages() {
  messages.set([]);
}

export function setMessages(newMessages: ChatMessage[]) {
  messages.set(newMessages);
}