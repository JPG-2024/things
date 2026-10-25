import { LazyStore } from '@tauri-apps/plugin-store';
import { isTauri } from '@tauri-apps/api/core';

const STORE_FILE = 'tts-auth.json';
const API_KEY_FIELD = 'apiKey';

let authStore: LazyStore | null = null;

function getStore(): LazyStore | null {
	if (!isTauri()) return null;
	if (!authStore) {
		authStore = new LazyStore(STORE_FILE, { autoSave: true });
	}
	return authStore;
}

export async function getTTSApiKey(): Promise<string | null> {
	const store = getStore();
	if (!store) return null;
	try {
		return await store.get<string>(API_KEY_FIELD);
	} catch {
		return null;
	}
}

export async function setTTSApiKey(key: string): Promise<void> {
	const store = getStore();
	if (!store) return;
	await store.set(API_KEY_FIELD, key);
}

export async function clearTTSApiKey(): Promise<void> {
	const store = getStore();
	if (!store) return;
	await store.delete(API_KEY_FIELD);
}

export async function getTTSAuthHeaders(): Promise<Record<string, string>> {
	const key = (await getTTSApiKey()) as string;
	/* const fixedKey = key.slice(0, key.length / 2); */

	return key ? { 'X-API-Key': key } : {};
}

export async function validateTTSApiKey(): Promise<{ valid: boolean; error?: string }> {
	const key = await getTTSApiKey();
	if (!key) return { valid: false, error: 'No API key configured' };

	try {
		const res = await fetch(`${import.meta.env.VITE_TTS_API_URL}/health`, {
			headers: { 'X-API-Key': key }
		});
		if (res.status === 401) return { valid: false, error: 'Invalid API key' };
		if (res.status === 429) return { valid: false, error: 'Rate limit exceeded' };
		return { valid: res.ok };
	} catch (err) {
		return { valid: false, error: err instanceof Error ? err.message : 'Validation failed' };
	}
}
