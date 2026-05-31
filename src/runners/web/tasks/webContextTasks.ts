import { compactMarkdown } from '@/lib/utils/splitter';
import { getImageSrc, resolveMediaDirectory } from '@/lib/utils/files';
import { invoke } from '@tauri-apps/api/core';
import { getRequiredTaskState, WebTaskNames, type WebTaskRegistrySubset } from './webTasks.shared';

type ContextTaskIds =
	| WebTaskNames.INIT_WEB_CONTEXT
	| WebTaskNames.METADATA
	| WebTaskNames.THUMBNAIL
	| WebTaskNames.TITLE;

export const contextTaskRegistry: WebTaskRegistrySubset<ContextTaskIds> = {
	[WebTaskNames.INIT_WEB_CONTEXT]: ({ url, language }) => ({
		id: WebTaskNames.INIT_WEB_CONTEXT,
		name: 'Initialize web context',
		dependencies: [],
		type: 'script',
		run: async () => {
			const response = await invoke<{
				metadata: Record<string, string>;
				markdown: string;
			}>('extract_blog', {
				url,
				selectors: ['body']
			});

			return {
				url,
				language,
				extraction: {
					metadata: response.metadata,
					content: compactMarkdown(response.markdown)
				}
			};
		}
	}),

	[WebTaskNames.METADATA]: () => ({
		id: WebTaskNames.METADATA,
		name: 'Extract metadata',
		dependencies: [WebTaskNames.INIT_WEB_CONTEXT],
		type: 'script',
		persist: true,
		run: ({ state }) => {
			const init = getRequiredTaskState(state, WebTaskNames.INIT_WEB_CONTEXT);
			return init.extraction.metadata;
		}
	}),

	[WebTaskNames.THUMBNAIL]: () => ({
		id: WebTaskNames.THUMBNAIL,
		dependencies: [WebTaskNames.INIT_WEB_CONTEXT, WebTaskNames.METADATA],
		type: 'script',
		component: 'image',
		persist: true,
		run: async ({ state }) => {
			const init = getRequiredTaskState(state, WebTaskNames.INIT_WEB_CONTEXT);
			const metadata = getRequiredTaskState(state, WebTaskNames.METADATA);
			const imageUrl = metadata['og:image'] || metadata['twitter:image'];
			const profile =
				metadata.author || metadata['og:site_name'] || metadata['twitter:site'] || null;

			console.log('Extracted image URL:', imageUrl); // Debug log for image URL

			if (!imageUrl) {
				return {
					mediaDirectory: '',
					thumbnailImage: '',
					thumbnailImageSrc: ''
				};
			}

			const mediaDirectory = await resolveMediaDirectory(init.url, profile);
			const thumbnailImage = await invoke<string>('download_and_save_image', {
				url: imageUrl,
				folderName: mediaDirectory,
				reductionMagnitud: 2
			});
			const thumbnailImageSrc = await getImageSrc(mediaDirectory, thumbnailImage);

			return {
				mediaDirectory,
				thumbnailImage,
				thumbnailImageSrc
			};
		}
	}),

	[WebTaskNames.TITLE]: () => ({
		id: WebTaskNames.TITLE,
		name: 'Extract title',
		dependencies: [WebTaskNames.METADATA],
		type: 'script',
		component: 'taskBase',
		persist: true,
		run: ({ state }) => {
			const metadata = getRequiredTaskState(state, WebTaskNames.METADATA);
			const possibleTitle =
				metadata['og:title'] || metadata['twitter:title'] || metadata.title || '';

			return possibleTitle.trim();
		}
	})
};
