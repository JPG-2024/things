import { LazyStore } from '@tauri-apps/plugin-store';
import { isTauri } from '@tauri-apps/api/core';
import { httpFetch } from '@/lib/utils/tauriFetch';

const STORE_FILE = 'opencode-auth.json';
const API_KEY_FIELD = 'apiKey';
const INFERENCE_BASE_URL = 'https://opencode.ai/inference';

let authStore: LazyStore | null = null;

function getStore(): LazyStore | null {
	if (!isTauri()) return null;
	if (!authStore) {
		authStore = new LazyStore(STORE_FILE, { autoSave: true });
	}
	return authStore;
}

export async function getOpencodeApiKey(): Promise<string | null> {
	const store = getStore();
	if (!store) return null;
	try {
		return (await store.get<string>(API_KEY_FIELD)) ?? null;
	} catch {
		return null;
	}
}

export async function setOpencodeApiKey(key: string): Promise<void> {
	const store = getStore();
	if (!store) return;
	await store.set(API_KEY_FIELD, key);
}

export async function clearOpencodeApiKey(): Promise<void> {
	const store = getStore();
	if (!store) return;
	await store.delete(API_KEY_FIELD);
}

function authHeaders(key: string | null): Record<string, string> {
	return key ? { Authorization: `Bearer ${key}` } : {};
}

export async function validateOpencodeApiKey(
	keyOverride?: string
): Promise<{ valid: boolean; error?: string }> {
	const key = keyOverride?.trim() || (await getOpencodeApiKey());
	if (!key) return { valid: false, error: 'No API key configured' };

	try {
		// `/v1/models` needs Models › Read; a valid "request only" key also gets
		// 200 here because listing is the cheapest authenticated call.
		const res = await httpFetch(`${INFERENCE_BASE_URL}/v1/models`, {
			headers: authHeaders(key)
		});
		if (res.status === 401) return { valid: false, error: 'Invalid API key' };
		if (res.status === 403) return { valid: false, error: 'Key has no model access' };
		if (!res.ok) return { valid: false, error: `Error ${res.status}` };
		return { valid: true };
	} catch (err) {
		return { valid: false, error: err instanceof Error ? err.message : 'Validation failed' };
	}
}

export interface OpencodeModelsResult {
	models: string[];
}

/**
 * List the model ids served by OpenCode's inference API. The list endpoint is
 * public, but a saved key is sent anyway so restricted environments behave the
 * same as the Console.
 *
 * @param keyOverride - Optional key to use instead of the stored one.
 * @returns Sorted model ids.
 */
export async function listOpencodeModels(keyOverride?: string): Promise<OpencodeModelsResult> {
	const key = keyOverride?.trim() || (await getOpencodeApiKey());
	const res = await httpFetch(`${INFERENCE_BASE_URL}/v1/models`, {
		headers: authHeaders(key)
	});
	if (!res.ok) {
		throw new Error(`OpenCode /v1/models failed: ${res.status} ${res.statusText}`);
	}
	const payload = (await res.json()) as { data?: Array<{ id?: unknown }> };
	const models = (payload.data ?? [])
		.map((entry) => entry.id)
		.filter((id): id is string => typeof id === 'string' && id.length > 0)
		.sort((a, b) => a.localeCompare(b));
	return { models };
}
