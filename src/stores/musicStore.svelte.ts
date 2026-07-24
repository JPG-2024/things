import { parseSSE } from '@/lib/utils/ttsService';

const WHISPER_API_URL = import.meta.env.VITE_WHISPER_API_URL;

export type TrackStatus = 'pending' | 'downloading' | 'done' | 'error';

export interface TrackDownload {
	id: string;
	url: string;
	filename: string | null;
	status: TrackStatus;
	error: string | null;
}

class MusicState {
	downloads = $state<TrackDownload[]>([]);
	isDownloading = $state(false);
	private abortController: AbortController | null = null;
	private submittedUrls = new Set<string>();

	getTrackFileUrl(filename: string): string {
		return `${WHISPER_API_URL}/tracks/${encodeURIComponent(filename)}`;
	}

	clearFinished(): void {
		this.downloads = this.downloads.filter((d) => d.status !== 'done' && d.status !== 'error');
	}

	async downloadTracks(urls: string[]): Promise<void> {
		const newUrls = urls.filter((u) => !this.submittedUrls.has(u));
		if (newUrls.length === 0) return;

		for (const url of newUrls) {
			this.submittedUrls.add(url);
			this.downloads.push({
				id: crypto.randomUUID(),
				url,
				filename: null,
				status: 'pending',
				error: null
			});
		}

		if (this.abortController) {
			this.abortController.abort();
		}

		const controller = new AbortController();
		this.abortController = controller;
		this.isDownloading = true;

		try {
			const res = await fetch(`${WHISPER_API_URL}/tracks/download`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ urls: newUrls }),
				signal: controller.signal
			});

			if (!res.ok) {
				const message = await res.text().catch(() => 'Download request failed');
				throw new Error(message);
			}

			for await (const { event, data } of parseSSE(res)) {
				const payload = data as Record<string, unknown>;

				if (event === 'downloading') {
					const url = String(payload.url ?? '');
					const item = this.downloads.find((d) => d.url === url);
					if (item) item.status = 'downloading';
				} else if (event === 'track_done') {
					const url = String(payload.url ?? '');
					const filename = payload.filename ? String(payload.filename) : null;
					const item = this.downloads.find((d) => d.url === url);
					if (item) {
						item.status = 'done';
						item.filename = filename;
					}
				} else if (event === 'track_error') {
					const url = String(payload.url ?? '');
					const message = payload.message ? String(payload.message) : 'Download error';
					const item = this.downloads.find((d) => d.url === url);
					if (item) {
						item.status = 'error';
						item.error = message;
					}
				} else if (event === 'done') {
					this.isDownloading = false;
				}
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			const message = err instanceof Error ? err.message : 'Download failed';
			for (const item of this.downloads) {
				if (item.status === 'pending' || item.status === 'downloading') {
					item.status = 'error';
					item.error = message;
				}
			}
		} finally {
			this.isDownloading = false;
			this.abortController = null;
		}
	}
}

export const musicState = new MusicState();
