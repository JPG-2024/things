import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

export interface DownloadedImageResult {
	mediaDirectory: string;
	fileName: string;
	imageSrc: string;
}

export const getImageDir = async (): Promise<string> => {
	const appData = await appDataDir();
	const mediaDir = await join(appData, "media");

	return mediaDir;
};

export const getImageSrc = async (mediaDirectory: string, imgName: string): Promise<string> => {
	const mediaDir = await getImageDir();
	const filePath = await join(mediaDir, mediaDirectory, imgName);
	return convertFileSrc(filePath);
};

export async function downloadImageUrl(url: string): Promise<DownloadedImageResult> {
	const mediaDirectory = await invoke<string>("url_to_folder_name", { url: url });

	const fileName = await invoke<string>("download_and_save_image", {
		url: url,
		folderName: mediaDirectory,
	});

	const imageSrc = await getImageSrc(mediaDirectory, fileName);

	return { mediaDirectory, fileName, imageSrc };
}
