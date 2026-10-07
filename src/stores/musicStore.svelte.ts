import { invoke, Channel } from '@tauri-apps/api/core';
import { downloadDir as tauriDownloadDir } from '@tauri-apps/api/path';
import { playCoinSound } from '@/lib/utils/coinSound';

export type TrackStatus = 'pending' | 'downloading' | 'done' | 'error';

export interface TrackDownload {
	id: string;
	url: string;
	filename: string | null;
	status: TrackStatus;
	error: string | null;
}

interface TrackDownloadEvent {
	event: 'Downloading' | 'TrackDone' | 'TrackError';
	data: { url: string; filename?: string; message?: string };
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

function normalizeDownloadError(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string' && err.trim()) return err;
	return 'Download failed';
}

class MusicState {
	downloads = $state<TrackDownload[]>([]);
	isDownloading = $state(false);
	downloadDir = $state('');
	downloadFolder = $state('');
	downloadPlaylist = $state(false);
	private abortController: AbortController | null = null;
	private submittedUrls = new Set<string>();

	/** Resolves the OS download dir the first time it is needed, so the default
	 * is always a valid, existing path instead of a hardcoded one. */
	async resolveDownloadDir(): Promise<string> {
		const current = this.downloadDir.trim();
		if (current) return current;

		try {
			const resolved = await tauriDownloadDir();
			if (resolved) this.downloadDir = resolved;
			return resolved;
		} catch (err) {
			console.warn('[music] failed to resolve download dir', err);
			return this.downloadDir;
		}
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
			const onEvent = new Channel<TrackDownloadEvent>();
			onEvent.onmessage = (msg) => {
				if (controller.signal.aborted) return;

				if (msg.event === 'Downloading') {
					if (msg.data.url === item.url) item.status = 'downloading';
				} else if (msg.event === 'TrackDone') {
					if (msg.data.url === item.url) {
						item.status = 'done';
						item.filename = msg.data.filename ?? null;
					}
				} else if (msg.event === 'TrackError') {
					if (msg.data.url === item.url) {
						item.status = 'error';
						item.error = msg.data.message ?? 'Download error';
					}
				}
			};

			const downloadDir = await this.resolveDownloadDir();

			await invoke('download_track', {
				url: item.url,
				downloadDir,
				folderName: this.downloadFolder,
				onEvent
			});
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				if (item.status === 'downloading') {
					item.status = 'pending';
					item.error = null;
				}
				return;
			}
			// Keep the more specific message delivered through the error channel.
			if (!item.error) item.error = normalizeDownloadError(err);
			item.status = 'error';
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
