import { invoke } from '@tauri-apps/api/core'
import { SIMPLE_SUMMARY_SYSTEM_PROMPT_EN, SIMPLE_SUMMARY_SYSTEM_PROMPT_ES } from '@/constants'
import { getYouTubeThumbnailUrl } from './utils/youtube'
import { getImageSrc } from './utils/dirs'
import { synthesizeSpeech } from '$lib/utils/tts'
import type { TTSLanguage, TTSResult } from '$lib/utils/tts'
import { getImageColor } from './utils/getImageColor'
import { primaryColor } from '@/stores/uiStore'
import { currentDuration } from '@/stores/ttsStore'
import { summarizeChapters } from './utils/youtube/summarizeChapters'
import type { ChapterSummaryItem } from './utils/youtube/summarizeChapters'
import { joinCaptionsByChapters } from './utils/youtube/joinCaptionsByChapters'
import type { Chapter, ChapterCaption, TimedCaption } from './utils/youtube/joinCaptionsByChapters'
import { taskRunner } from '@/stores/taskRunner.svelte'
import type { Task } from '@/types/taskRunner.types'
import { viewState } from '@/stores/viewStore.svelte'


type VideoMetaItem = {
	name: string
	selector: string
	textContent: string | null
}

type InitContext = {
	url: string
	videoId: string
	preferredLanguage: TTSLanguage
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
	chapterSummaries: ChapterSummaryItem[]
}

enum TaskNames {
	INIT = 'init',
	THUMBNAIL = 'thumbnail',
	MAIN_COLOR = 'main-color',
	SUMMARY = 'summary',
	SUMMARY_STATE = 'summary-state',
	CHAPTERS = 'chapters',
	TRANSCRIPT = 'transcript',
	VIDEO_INFO = 'video-info',
	TTS = 'tts',
	RESULT = 'result',
}

type YouTubeTaskState = {
	[TaskNames.INIT]: InitContext
	[TaskNames.THUMBNAIL]: ThumbnailContext
	[TaskNames.MAIN_COLOR]: { mainColor: string }
	[TaskNames.VIDEO_INFO]: VideoInfoContext
	[TaskNames.TRANSCRIPT]: TranscriptContext
	[TaskNames.CHAPTERS]: ChapterContext
	[TaskNames.SUMMARY]: string
	[TaskNames.SUMMARY_STATE]: string
	[TaskNames.TTS]: TTSResult | null
	[TaskNames.RESULT]: { content: string; summary: string }
}

export function createYouTubeTasks(url: string, language?: TTSLanguage): Task<YouTubeTaskState>[] {
	const selectedLanguage = language ?? viewState.language

	return [
		{
			id: TaskNames.INIT,
			name: 'Initialize YouTube Context',
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
			id: TaskNames.THUMBNAIL,
			name: 'Get thumbnail',
			widget: false,
			dependencies: [TaskNames.INIT],
			type: 'script',
			run: async (state) => {
				const context = state[TaskNames.INIT]!
				const mediaDirectory = await invoke<string>('url_to_folder_name', { url: context.url })

				const ytThumbnailUrl = getYouTubeThumbnailUrl(context.videoId)
				const mainImage = await invoke<string>('download_and_save_image', {
					url: ytThumbnailUrl,
					folderName: mediaDirectory,
				})

				const mainImageSrc = await getImageSrc(mediaDirectory, mainImage)
				viewState.mainImageSrc = mainImageSrc
				return { mediaDirectory, mainImage, mainImageSrc } satisfies ThumbnailContext
			},
		},
		{
			id: TaskNames.MAIN_COLOR,
			name: 'Get main color',
			widget: false,
			dependencies: [TaskNames.THUMBNAIL],
			type: 'script',
			run: async (state) => {
				const thumbnail = state[TaskNames.THUMBNAIL]!
				let mainColor = ''
				try {
					mainColor = await getImageColor(thumbnail.mainImageSrc || '')
					if (mainColor) {
						primaryColor.set(mainColor)
					}
				} catch (colorError) {
					console.error('Error extracting main color:', colorError)
				}

				return { mainColor } satisfies { mainColor: string }
			},
		},
		{
			id: TaskNames.VIDEO_INFO,
			name: 'Extract Info',
			widget: false,
			dependencies: [TaskNames.INIT],
			type: 'script',
			run: async (state) => {
				const context = state[TaskNames.INIT]!
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
			id: TaskNames.TRANSCRIPT,
			name: 'Get transcript',
			widget: false,
			dependencies: [TaskNames.INIT, TaskNames.VIDEO_INFO],
			type: 'script',
			run: async (state) => {
				const context = state[TaskNames.INIT]!
				const timedCaptions = await invoke<TimedCaption[]>('get_youtube_transcript_timed', {
					id: context.videoId,
					language: context.preferredLanguage,
				})

				const transcriptText = timedCaptions.map((item) => item.caption).join(' ').trim()
				return { timedCaptions, transcriptText } satisfies TranscriptContext
			},
		},
		{
			id: TaskNames.CHAPTERS,
			name: 'Process Chapters',
			widget: false,
			dependencies: [TaskNames.INIT, TaskNames.VIDEO_INFO, TaskNames.TRANSCRIPT],
			type: 'script',
			run: async (state) => {
				const context = state[TaskNames.INIT]!
				const info = state[TaskNames.VIDEO_INFO]!
				const transcript = state[TaskNames.TRANSCRIPT]!

				if (!info.chapters.length) {
					return { chapterCaptions: [], chapterSummaries: [] } satisfies ChapterContext
				}

				const chapterCaptions = joinCaptionsByChapters(transcript.timedCaptions, info.chapters)
				const chapterSummaries = await summarizeChapters(chapterCaptions, context.preferredLanguage)

				return { chapterCaptions, chapterSummaries } satisfies ChapterContext
			},
		},
		{
			id: TaskNames.SUMMARY,
			name: 'Generate Summary',
			widget: true,
			dependencies: [TaskNames.INIT, TaskNames.TRANSCRIPT],
            component: 'base',
			type: 'ia',
			systemMessage:
				selectedLanguage === 'es' ? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES : SIMPLE_SUMMARY_SYSTEM_PROMPT_EN,
			run: (state) => {
				const transcript = state[TaskNames.TRANSCRIPT]!
				return transcript.transcriptText
			},
			userMessage:
				selectedLanguage === 'es'
					? 'Resume el contexto de manera concisa y clara en un solo párrafo. maximo 4 lineas.'
					: 'Summarize the context concisely and clearly in a single paragraph. maximum 4 lines.',
			completionOptions: {
				model: 'llama-server',
				temperature: 0.7,
				stream: true,
			},
			baseUrl: 'http://localhost:8080',
		},
		{
			id: TaskNames.SUMMARY_STATE,
			name: 'Summary State',
			widget: false,
			dependencies: [TaskNames.SUMMARY],
			type: 'script',
			run: (state) => String(state[TaskNames.SUMMARY] || ''),
		},
		{
			id: TaskNames.TTS,
			name: 'Generate TTS',
			widget: false,
			dependencies: [TaskNames.SUMMARY_STATE],
			type: 'script',
			run: async (state) => {
				const summary = String(state[TaskNames.SUMMARY_STATE] || '')
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
			id: TaskNames.RESULT,
			name: 'Final Result',
			widget: false,
			dependencies: [TaskNames.TRANSCRIPT, TaskNames.SUMMARY_STATE, TaskNames.TTS],
			type: 'script',
			run: (state) => {
				const transcript = state[TaskNames.TRANSCRIPT]!
				return {
					content: transcript.transcriptText,
					summary: String(state[TaskNames.SUMMARY_STATE] || ''),
				}
			},
		},
	]
}

export async function youTubeRunner(
	url: string,
	language?: TTSLanguage,
): Promise<{ content: string; summary: string }> {
	try {
		const selectedLanguage = language ?? viewState.language
		const tasks = createYouTubeTasks(url, selectedLanguage)
		taskRunner.setTasks(tasks)
		const tasksa = await taskRunner.run()
		console.log('All tasks completed:', tasksa)

		const result = taskRunner.getTaskData<YouTubeTaskState, TaskNames.RESULT>(TaskNames.RESULT)
		if (!result) {
			throw new Error('Task runner did not produce a final result.')
		}

		return result
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`)
	}
}
