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
		return (await store.get<string>(API_KEY_FIELD)) ?? null;
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
	const key = await getTTSApiKey();
	return key ? { 'X-API-Key': key } : {};
}

export async function validateTTSApiKey(
	keyOverride?: string
): Promise<{ valid: boolean; error?: string }> {
	const key = keyOverride?.trim() || (await getTTSApiKey());
	if (!key) return { valid: false, error: 'No API key configured' };

	try {
		// `/health` is auth-exempt, so it cannot validate a key. `/voices` needs
		// `tts:generate`, which both the `admin` and `user` roles hold.
		const res = await fetch(`${import.meta.env.VITE_TTS_API_URL}/voices`, {
			headers: { 'X-API-Key': key }
		});
		if (res.status === 401) return { valid: false, error: 'Invalid API key' };
		if (res.status === 429) return { valid: false, error: 'Rate limit exceeded' };
		if (!res.ok) return { valid: false, error: `Error ${res.status}` };
		return { valid: true };
	} catch (err) {
		return { valid: false, error: err instanceof Error ? err.message : 'Validation failed' };
	}
}
