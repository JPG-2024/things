import { writable, derived, get } from "svelte/store";

export interface Message {
  id?: number;
  chatId?: number;
  sender: string;
  content: string;
  createdAt?: string;
}

export const messages = writable<Message[]>([]);

// Helper functions for message management
export function addMessage(message: Message) {
  messages.update(msgs => [...msgs, message]);
}

export function clearMessages() {
  messages.set([]);
}

export function setMessages(newMessages: Message[]) {
  messages.set(newMessages);
}