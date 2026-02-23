import { invoke } from '@tauri-apps/api/core'
import { SIMPLE_SUMMARY_SYSTEM_PROMPT_EN, SIMPLE_SUMMARY_SYSTEM_PROMPT_ES } from '@/constants'
import { getYouTubeThumbnailUrl } from './utils/youtube'
import { getImageSrc } from './utils/dirs'
import { synthesizeSpeech } from '$lib/utils/tts'
import { getImageColor } from './utils/getImageColor'
import { primaryColor } from '@/stores/uiStore'
import { currentDuration } from '@/stores/ttsStore'
import { summarizeChapters } from './utils/youtube/summarizeChapters'
import { joinCaptionsByChapters } from './utils/youtube/joinCaptionsByChapters'
import type { Chapter, ChapterCaption, TimedCaption } from './utils/youtube/joinCaptionsByChapters'
import { taskRunner } from '@/stores/taskRunner.svelte'
import type { Task } from '@/types/taskRunner.types'

type VideoMetaItem = {
	name: string
	selector: string
	textContent: string | null
}

type InitContext = {
	url: string
	videoId: string
	preferredLanguage: string
}

type ThumbnailContext = {
	mediaDirectory: string
	mainImage: string
	mainImageSrc: string
}

type VideoInfoContext = {
	videoMeta: VideoMetaItem[]
	chapters: Chapter[]
}

type TranscriptContext = {
	timedCaptions: TimedCaption[]
	transcriptText: string
}

type ChapterContext = {
	chapterCaptions: ChapterCaption[]
	chapterSummaries: string[]
}

export function createYouTubeTasks(url: string, languages: string[] = ['en', 'es']): Task[] {
	const selectedLanguage = languages[0] || 'es'

	return [
		{
			id: 'yt:init-context',
			widget: false,
			dependencies: [],
			type: 'script',
			run: () => {
				const urlObj = new URL(url)
				const videoId = urlObj.searchParams.get('v')
				if (!videoId) {
					throw new Error('Invalid YouTube URL')
				}

				return { url, videoId, preferredLanguage: selectedLanguage } satisfies InitContext
			},
		},
		{
			id: 'yt:thumbnail',
			widget: false,
			dependencies: ['yt:init-context'],
			type: 'script',
			run: async (state) => {
				const context = state['yt:init-context'] as InitContext
				const mediaDirectory = await invoke<string>('url_to_folder_name', { url: context.url })

				const ytThumbnailUrl = getYouTubeThumbnailUrl(context.videoId)
				const mainImage = await invoke<string>('download_and_save_image', {
					url: ytThumbnailUrl,
					folderName: mediaDirectory,
				})

				const mainImageSrc = await getImageSrc(mediaDirectory, mainImage)
				return { mediaDirectory, mainImage, mainImageSrc } satisfies ThumbnailContext
			},
		},
		{
			id: 'yt:main-color',
			widget: false,
			dependencies: ['yt:thumbnail'],
			type: 'script',
			run: async (state) => {
				const thumbnail = state['yt:thumbnail'] as ThumbnailContext
				let mainColor = ''
				try {
					mainColor = await getImageColor(thumbnail.mainImageSrc || '')
					if (mainColor) {
						primaryColor.set(mainColor)
					}
				} catch (colorError) {
					console.error('Error extracting main color:', colorError)
				}

				return { mainColor }
			},
		},
		{
			id: 'yt:video-info',
			widget: false,
			dependencies: ['yt:init-context'],
			type: 'script',
			run: async (state) => {
				const context = state['yt:init-context'] as InitContext
				const [videoMeta = [], chapters = []] = await invoke<[VideoMetaItem[], Chapter[]]>('get_youtube_info', {
					url: context.url,
					selectors: [
						{ name: 'title', selector: '#title h1 yt-formatted-string' },
						{ name: 'channel', selector: '#text-container yt-formatted-string' },
						{ name: 'views', selector: 'span.view-count' },
						{ name: 'uploadDate', selector: 'div#info-strings yt-formatted-string' },
						{ name: 'channel', selector: '#channel-name a' },
					],
				})

				return { videoMeta, chapters } satisfies VideoInfoContext
			},
		},
		{
			id: 'yt:transcript',
			widget: false,
			dependencies: ['yt:init-context', 'yt:video-info'],
			type: 'script',
			run: async (state) => {
				const context = state['yt:init-context'] as InitContext
				const timedCaptions = await invoke<TimedCaption[]>('get_youtube_transcript_timed', {
					id: context.videoId,
					language: context.preferredLanguage,
				})

				const transcriptText = timedCaptions.map((item) => item.caption).join(' ').trim()
				return { timedCaptions, transcriptText } satisfies TranscriptContext
			},
		},
		{
			id: 'yt:chapters',
			widget: false,
			dependencies: ['yt:init-context', 'yt:video-info', 'yt:transcript'],
			type: 'script',
			run: async (state) => {
				const context = state['yt:init-context'] as InitContext
				const info = state['yt:video-info'] as VideoInfoContext
				const transcript = state['yt:transcript'] as TranscriptContext

				if (!info.chapters.length) {
					return { chapterCaptions: [], chapterSummaries: [] } satisfies ChapterContext
				}

				const chapterCaptions = joinCaptionsByChapters(transcript.timedCaptions, info.chapters)
				const chapterSummaries = await summarizeChapters(chapterCaptions, context.preferredLanguage)

				return { chapterCaptions, chapterSummaries } satisfies ChapterContext
			},
		},
		{
			id: 'yt:summary',
			widget: true,
			dependencies: ['yt:init-context', 'yt:transcript'],
			type: 'ia',
			systemMessage:
				selectedLanguage === 'es' ? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES : SIMPLE_SUMMARY_SYSTEM_PROMPT_EN,
			userMessage: (state) => {
				const transcript = state['yt:transcript'] as TranscriptContext
				const summaryPromptEs = 'Resume el contexto de manera concisa y clara en un solo párrafo.'
				const summaryPromptEn = 'Summarize the context concisely and clearly in a single paragraph.'

				return selectedLanguage === 'es'
					? `context: ${transcript.transcriptText}\n\n${summaryPromptEs}`
					: `context: ${transcript.transcriptText}\n\n${summaryPromptEn}`
			},
			completionOptions: {
				model: 'gpt-3.5-turbo',
				temperature: 0.7,
				stream: true,
			},
			baseUrl: 'http://localhost:8080',
		},
		{
			id: 'yt:summary-state',
			widget: false,
			dependencies: ['yt:summary'],
			type: 'script',
			run: (state) => String(state['yt:summary'] || ''),
		},
		{
			id: 'yt:tts',
			widget: false,
			dependencies: ['yt:summary-state'],
			type: 'script',
			run: async (state) => {
				const summary = String(state['yt:summary-state'] || '')
				if (!summary.trim()) {
					return null
				}

				const result = await synthesizeSpeech(
					summary,
					selectedLanguage,
					'/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/voice_styles/F1.json',
					{
						speed: 1.3,
						onnx_dir:
							'/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/onnx/',
						total_step: 4,
					},
				)

				currentDuration.set(result.duration)
				invoke('play_tts_file', { filePath: result.file_path }).catch((err) => {
					console.error('Error playing TTS:', err)
				})

				return result
			},
		},
		{
			id: 'yt:result',
			widget: false,
			dependencies: ['yt:transcript', 'yt:summary-state', 'yt:tts'],
			type: 'script',
			run: (state) => {
				const transcript = state['yt:transcript'] as TranscriptContext
				return {
					content: transcript.transcriptText,
					summary: String(state['yt:summary-state'] || ''),
				}
			},
		},
	]
}

export async function youTubeRunner(
	url: string,
	languages: string[] = ['en', 'es'],
): Promise<{ content: string; summary: string }> {
	try {
		const tasks = createYouTubeTasks(url, languages)
		taskRunner.setTasks(tasks)
		await taskRunner.run()

		const result = taskRunner.getTaskData('yt:result') as { content: string; summary: string } | undefined
		if (!result) {
			throw new Error('Task runner did not produce a final result.')
		}

		return result
	} catch (invokeErr) {
		throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
	}
}
