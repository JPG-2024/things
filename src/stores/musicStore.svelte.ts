import { parseSSE } from '@/lib/utils/ttsService';
import { playCoinSound } from '@/lib/utils/coinSound';

const WHISPER_API_URL = import.meta.env.VITE_WHISPER_API_URL;

export type TrackStatus = 'pending' | 'downloading' | 'done' | 'error';

export interface TrackDownload {
	id: string;
	url: string;
	filename: string | null;
	status: TrackStatus;
	error: string | null;
}

function keepWatchParamOnly(urlString: string): string {
	try {
		const url = new URL(urlString);
		const v = url.searchParams.get('v');
		url.search = '';
		if (v) url.searchParams.set('v', v);
		return url.toString();
	} catch {
		return urlString;
	}
}

class MusicState {
	downloads = $state<TrackDownload[]>([]);
	isDownloading = $state(false);
	downloadFolder = $state('');
	downloadPlaylist = $state(false);
	private abortController: AbortController | null = null;
	private submittedUrls = new Set<string>();

	getTrackFileUrl(filename: string): string {
		return `${WHISPER_API_URL}/tracks/${encodeURIComponent(filename)}`;
	}

	clearFinished(): void {
		this.downloads = this.downloads.filter((d) => d.status !== 'done' && d.status !== 'error');
	}

	removeItem(id: string): void {
		const item = this.downloads.find((d) => d.id === id);
		if (item && (item.status === 'pending' || item.status === 'error')) {
			if (item.status === 'pending') {
				this.submittedUrls.delete(item.url);
			}
			this.downloads = this.downloads.filter((d) => d.id !== id);
		}
	}

	get pendingCount(): number {
		return this.downloads.filter((d) => d.status === 'pending').length;
	}

	addToQueue(rawUrls: string[]): { added: string[]; skipped: string[] } {
		const processedUrls = this.downloadPlaylist ? rawUrls : rawUrls.map(keepWatchParamOnly);

		const added: string[] = [];
		const skipped: string[] = [];

		for (const processed of processedUrls) {
			if (this.submittedUrls.has(processed)) {
				skipped.push(processed);
				continue;
			}
			this.submittedUrls.add(processed);
			this.downloads.push({
				id: crypto.randomUUID(),
				url: processed,
				filename: null,
				status: 'pending',
				error: null
			});
			added.push(processed);
		}

		if (added.length > 0) {
			playCoinSound();
		}

		return { added, skipped };
	}

	async downloadAll(): Promise<void> {
		const pending = this.downloads.filter((d) => d.status === 'pending');
		for (const item of pending) {
			if (this.abortController?.signal.aborted) break;
			await this.downloadSingle(item.id);
		}
	}

	async downloadSingle(itemId: string): Promise<void> {
		const item = this.downloads.find((d) => d.id === itemId);
		if (!item || item.status !== 'pending') return;

		if (this.abortController) {
			this.abortController.abort();
		}

		const controller = new AbortController();
		this.abortController = controller;
		item.status = 'downloading';
		item.error = null;
		this.isDownloading = true;

		try {
			const body: Record<string, unknown> = { urls: [item.url] };
			if (this.downloadFolder) {
				body.folder_name = this.downloadFolder;
			}

			const res = await fetch(`${WHISPER_API_URL}/tracks/download`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: controller.signal
			});

			if (!res.ok) {
				const message = await res.text().catch(() => 'Download request failed');
				throw new Error(message);
			}

			for await (const { event, data } of parseSSE(res)) {
				if (controller.signal.aborted) break;
				const payload = data as Record<string, unknown>;

				if (event === 'downloading') {
					const url = String(payload.url ?? '');
					if (url === item.url) item.status = 'downloading';
				} else if (event === 'track_done') {
					const url = String(payload.url ?? '');
					const filename = payload.filename ? String(payload.filename) : null;
					if (url === item.url) {
						item.status = 'done';
						item.filename = filename;
					}
				} else if (event === 'track_error') {
					const url = String(payload.url ?? '');
					const message = payload.message ? String(payload.message) : 'Download error';
					if (url === item.url) {
						item.status = 'error';
						item.error = message;
					}
				} else if (event === 'done') {
					break;
				}
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				if (item.status === 'downloading') {
					item.status = 'pending';
					item.error = null;
				}
				return;
			}
			const message = err instanceof Error ? err.message : 'Download failed';
			if (item.status !== 'done') {
				item.status = 'error';
				item.error = message;
			}
		} finally {
			if (this.abortController === controller) {
				this.abortController = null;
			}
			const anyActive = this.downloads.some(
				(d) => d.status === 'downloading' || d.status === 'pending'
			);
			if (!anyActive || this.downloads.every((d) => d.status !== 'downloading')) {
				this.isDownloading = false;
			}
		}
	}
}

export const musicState = new MusicState();
