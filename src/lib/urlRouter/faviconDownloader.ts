import { downloadImageUrl, getMediaSrc } from '@/lib/utils/files';

export interface DownloadedFavicon {
	fileName: string;
	src: string;
}

export async function downloadFavicon(domainUrl: string): Promise<DownloadedFavicon | null> {
	try {
		const googleUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domainUrl}`;
		const { fileName } = await downloadImageUrl(googleUrl);
		const src = await getMediaSrc(fileName);
		return { fileName, src };
	} catch (error) {
		console.error('Failed to download favicon:', error);
		return null;
	}
}
