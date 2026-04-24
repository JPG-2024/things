type MediaAssetRequest = { key: string; url?: string | null };
type MediaAssetResult = { key: string; value: string | null };

import { invoke } from "@tauri-apps/api/core";
import { getImageSrc } from "@/lib/utils/dirs";
import { viewState } from "@/stores/viewStore.svelte";

export async function downloadMediaAssets(
	pageUrl: string,
	assets: MediaAssetRequest[]
): Promise<{ mediaDirectory: string | null; results: MediaAssetResult[] }> {
	if (!assets.length) {
		return { mediaDirectory: null, results: [] };
	}

	let mediaDirectory: string | null = null;

	try {
		mediaDirectory = await invoke<string>("url_to_folder_name", {
			url: pageUrl,
		});
	} catch (err) {
		console.error("downloadMediaAssets: url_to_folder_name failed", err);
		return {
			mediaDirectory: null,
			results: assets.map(({ key }) => ({ key, value: null })),
		};
	}

	const results = await Promise.all(
		assets.map(async ({ key, url }) => {
			if (!url || !mediaDirectory) {
				return { key, value: null };
			}

			try {
				const fileName = await invoke<string>("download_and_save_image", {
					url,
					folderName: mediaDirectory,
					reductionMagnitud: 2,
				});

				return { key, value: fileName };
			} catch (err) {
				console.error(`downloadMediaAssets: failed to download ${key}`, err);
				return { key, value: null };
			}
		})
	);

	return { mediaDirectory, results };
}
