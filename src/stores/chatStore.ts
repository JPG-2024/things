import { writable } from "svelte/store";

export const messages = writable<ChatMessage[]>([]);

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