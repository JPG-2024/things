import { convertFileSrc } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { remove } from '@tauri-apps/plugin-fs';
import { getMediaDirectory } from '@/lib/utils/dbManager';

export const MEDIA_FOLDER = 'thumbnails';

/**
 * Media lives inside the active database workspace, and the Rust side is the
 * only place that knows that path, so cache the resolved folder once per app
 * load (a database switch reloads the whole app).
 */
let mediaDirectoryPromise: Promise<string> | null = null;

export function getMediaRoot(): Promise<string> {
	mediaDirectoryPromise ??= getMediaDirectory();
	return mediaDirectoryPromise;
}

export const getMediaSrc = (filename: string): Promise<string> =>
	getImageSrc(MEDIA_FOLDER, filename);

/**
 * Recognizes an already-resolved media src: a real URL (`asset://localhost/...`,
 * remote favicon, data/blob URI) or the dev-mode media src Vite serves
 * (`/@fs/...`, which has no URL scheme). Callers must treat these as opaque and
 * never re-run them through `getMediaSrc`.
 */
export const isResolvedMediaSrc = (src: string): boolean =>
	src.startsWith('/@fs/') || /^[a-z][a-z0-9+.-]*:/i.test(src);

export const deleteMediaFile = async (filename: string): Promise<void> => {
	try {
		const mediaDir = await getMediaRoot();
		await remove(await join(mediaDir, MEDIA_FOLDER, filename));
	} catch (error) {
		console.error(`[Media] Error deleting media file: ${error}`);
	}
};

export interface DownloadedImageResult {
	mediaDirectory: string;
	fileName: string;
}

export async function resolveMediaDirectory(url: string, profile?: string | null): Promise<string> {
	return invoke<string>('url_to_folder_name', {
		url,
		profile: profile ?? ''
	});
}

export const getImageDir = (): Promise<string> => getMediaRoot();

/**
 * Resolved asset-src memo: `(mediaDirectory, imgName)` → asset src.
 * The media root and the join are stable per app load (a workspace switch
 * reloads the whole webview), so the cache never needs invalidation. Storing
 * the promise dedupes concurrent callers for the same image.
 */
const mediaSrcPromises = new Map<string, Promise<string>>();

export const getImageSrc = (mediaDirectory: string, imgName: string): Promise<string> => {
	const cacheKey = `${mediaDirectory}\u0000${imgName}`;
	let promise = mediaSrcPromises.get(cacheKey);
	if (!promise) {
		promise = (async () => {
			const mediaDir = await getMediaRoot();
			const filePath = await join(mediaDir, mediaDirectory, imgName);
			// WebKitGTK 2.54 refuses `asset://` subresources on pages served over
			// plain http (i.e. `tauri dev`; see tauri-apps/tauri#16201), so dev
			// loads media through Vite's `/@fs` route (allowed in vite.config.js).
			// Production pages come from the `tauri://` scheme, where it still works.
			if (import.meta.env.DEV) {
				return `/@fs${filePath}`;
			}
			return convertFileSrc(filePath);
		})();
		// A failed resolution is not sticky: drop it so the next caller retries.
		void promise.catch(() => mediaSrcPromises.delete(cacheKey));
		mediaSrcPromises.set(cacheKey, promise);
	}
	return promise;
};

export const DEFAULT_IMAGE_REDUCTION_MAGNITUD = 2;

export async function downloadImageUrl(
	url: string,
	reductionMagnitud = DEFAULT_IMAGE_REDUCTION_MAGNITUD
): Promise<DownloadedImageResult> {
	try {
		const mediaDirectory = await resolveMediaDirectory(url);
		const fileName = await invoke<string>('download_and_save_image', {
			url: url,
			folderName: mediaDirectory,
			reductionMagnitud,
			maxDimension: 320
		});

		return { mediaDirectory, fileName };
	} catch (error) {
		throw new Error(
			`Failed to download image from "${url}": ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
