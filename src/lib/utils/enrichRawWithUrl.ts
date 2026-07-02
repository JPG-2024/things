import { invoke } from '@tauri-apps/api/core';
import { downloadFavicon } from '@/lib/urlRouter/faviconDownloader';
import { resolveMediaDirectory } from '@/lib/utils/files';
import { saveArticle, saveProfile, saveTasks } from '@/stores/webStore';

export async function enrichRawWithUrl(rawId: string, url: string): Promise<void> {
	try {
		const parsedUrl = new URL(url);
		const domain = parsedUrl.hostname;

		const response = await invoke<{
			metadata: Record<string, string>;
			markdown: string;
		}>('extract_blog', {
			url,
			selectors: ['body']
		});

		const metadata = response.metadata;

		const favicon = await downloadFavicon(domain);
		await saveProfile(domain, favicon?.src ?? null, null, url);

		const imageUrl = metadata['og:image'] || metadata['twitter:image'];
		let thumbnail: string | null = null;

		if (imageUrl) {
			const resolvedImageUrl = imageUrl.startsWith('/')
				? `${parsedUrl.origin}${imageUrl}`
				: imageUrl;

			const mediaDirectory = await resolveMediaDirectory(url, null);
			thumbnail = await invoke<string>('download_and_save_image', {
				url: resolvedImageUrl,
				folderName: mediaDirectory,
				reductionMagnitud: 2
			});
		}

		await saveArticle(rawId, [], {
			profile: domain,
			profilePicture: favicon?.fileName ?? null,
			thumbnail,
			date: new Date().toISOString()
		});

		await saveTasks(rawId, [
			{
				id: 'source-url',
				data: url,
				status: 'done',
				component: undefined
			}
		]);
	} catch (error) {
		console.error('Failed to enrich raw content with URL:', error);
	}
}
