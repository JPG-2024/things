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

export const getImageSrc = async (mediaDirectory: string, imgName: string): Promise<string> => {
	const mediaDir = await getMediaRoot();
	const filePath = await join(mediaDir, mediaDirectory, imgName);
	return convertFileSrc(filePath);
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
