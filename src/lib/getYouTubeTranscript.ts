import { invoke } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte';
import { YOUTUBE_SUMMARY_PROMPT } from '@/constants';
import { getYouTubeThumbnailUrl } from './utils/youtube';
import { getImageSrc } from './utils/dirs';
import { generate, generateStream } from './utils/ollama/generate'

export async function getYouTubeTranscript(videoLink: string, languages: string[] = ['en', 'es']): Promise<{  content: string, summary: string}> {
  //extract video id from youtube link
  const urlObj = new URL(videoLink)
  const videoId = urlObj.searchParams.get('v')
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  let _transcript: string

  try {
    const _mediaDir = await invoke<string>('url_to_folder_name', {url: videoLink})
    viewState.mediaDirectory = _mediaDir
    const ytThumbnailUrl = getYouTubeThumbnailUrl(videoId)
    const _mainImage = await invoke<string>('download_and_save_image', {url: ytThumbnailUrl, folderName: _mediaDir})
    viewState.mainImage = _mainImage
    viewState.mainImageSrc = await getImageSrc(_mediaDir, _mainImage)

    _transcript = await invoke<string>('get_youtube_transcript', {
      id: videoId,
      languages,
    })
    viewState.content = _transcript

    const preSummary = await generate({
        model: 'ministral-3:3b',
        prompt: `sigue las reglas:\n\n${_transcript}`,
        system: YOUTUBE_SUMMARY_PROMPT,
        options: {
          temperature: 0.0,
          top_k: 1,
          top_p: 0.1,
          repeat_penalty: 1.1,
          repeat_last_n: 128,
          presence_penalty: 0.0,
          frequency_penalty: 0.0,
          mirostat: 0,
        }
      });

    // first summary can be long, so we stream the final summary  
    for await (const chunk of generateStream({
        model: 'ministral-3:3b',
        prompt: `sigue las reglas:\n\n${preSummary.response}`,
        system: YOUTUBE_SUMMARY_PROMPT,
        options: {
          temperature: 0.0,
          top_k: 1,
          top_p: 0.1,
          repeat_penalty: 1.1,
          repeat_last_n: 128,
          presence_penalty: 0.0,
          frequency_penalty: 0.0,
          mirostat: 0,
        }
      })) {
        viewState.summary = (viewState.summary || '') + chunk.response
      }

      return {content: _transcript, summary: viewState.summary || ''} 
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }
  
}