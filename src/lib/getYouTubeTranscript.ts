import { invoke } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte';
import { YOUTUBE_SUMMARY_PROMPT } from '@/constants';
import { runLocalLlamaPrompt } from '@/lib/utils/localInference-ollama';
import { getYouTubeThumbnailUrl } from './utils/youtube';
import { getImageSrc } from './utils/dirs';
import { generate } from './utils/ollama/generate'

export async function getYouTubeTranscript(videoLink: string, languages: string[] = ['en', 'es']): Promise<{  content: string, summary: string}> {
  //extract video id from youtube link
  const urlObj = new URL(videoLink)
  const videoId = urlObj.searchParams.get('v')
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  let _transcript: string
  let _summary: string | null = null

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
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }


  try {
/*       _summary = await runLocalLlamaPrompt(
        _transcript,
        {
          systemPrompt: YOUTUBE_SUMMARY_PROMPT,
          messages: [],
          onChunk: (chunk: string) => {
            viewState.summary = (viewState.summary || '') + chunk
          }
        }
      ) */

      const response = await generate({
        model: 'gemma3:latest',
        prompt: `texto a resumir:\n\n${_transcript}`,
        system: YOUTUBE_SUMMARY_PROMPT,
        options: {
          temperature: 0.3,  // Lower temperature for consistent summarization
          /* num_predict: -1    */
        }
      });

      viewState.summary = response.response;
      
  } catch (inferenceErr) {
    console.error('Error during inference:', inferenceErr)
  }
  
  return {content: _transcript, summary: _summary || ''} 
}