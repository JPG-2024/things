import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { BaseDirectory, remove } from '@tauri-apps/plugin-fs';

export const MEDIA_FOLDER = 'thumbnails';

export const getMediaSrc = (filename: string): Promise<string> =>
	getImageSrc(MEDIA_FOLDER, filename);

export const deleteMediaFile = async (filename: string): Promise<void> => {
	try {
		await remove(`media/${MEDIA_FOLDER}/${filename}`, { baseDir: BaseDirectory.AppData });
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

export const getImageDir = async (): Promise<string> => {
	const appData = await appDataDir();
	const mediaDir = await join(appData, 'media');

	return mediaDir;
};

export const getImageSrc = async (mediaDirectory: string, imgName: string): Promise<string> => {
	const mediaDir = await getImageDir();
	const filePath = await join(mediaDir, mediaDirectory, imgName);
	return convertFileSrc(filePath);
};

export async function downloadImageUrl(url: string): Promise<DownloadedImageResult> {
	try {
		const mediaDirectory = await resolveMediaDirectory(url);
		const fileName = await invoke<string>('download_and_save_image', {
			url: url,
			folderName: mediaDirectory,
			reductionMagnitud: 1
		});

		return { mediaDirectory, fileName };
	} catch (error) {
		throw new Error(
			`Failed to download image from "${url}": ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
