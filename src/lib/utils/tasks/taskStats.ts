import type { TaskStatus } from '@/types/taskRunner.types';

export type PillStatus = 'loading' | 'error' | 'idle' | 'done';

export function statusToPillStatus(status?: TaskStatus): PillStatus {
	switch (status) {
		case 'running':
			return 'loading';
		case 'done':
			return 'done';
		case 'failed':
		case 'blocked':
			return 'error';
		default:
			return 'idle';
	}
}

export function formatDuration(ms: number | null | undefined): string {
	if (ms == null) return '—';
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTimestamp(ts: number | undefined): string {
	if (!ts) return '—';
	return new Date(ts).toLocaleTimeString();
}

export function dataPreview(data: unknown): string {
	if (data == null) return '';
	if (typeof data === 'string') return data.length > 120 ? data.slice(0, 120) + '…' : data;
	if (Array.isArray(data)) return `Array(${data.length})`;
	if (typeof data === 'object') return 'Object';
	return String(data);
}

export function dataTypeLabel(data: unknown): string {
	if (data == null) return 'none';
	if (Array.isArray(data)) return `array[${data.length}]`;
	return typeof data;
}

export function formatData(data: unknown): string {
	if (data == null) return '';
	if (typeof data === 'string') return data;
	try {
		return JSON.stringify(data, null, 2);
	} catch {
		return String(data);
	}
}
