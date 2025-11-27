import { invoke } from '@tauri-apps/api/core'
import { summary, content } from '@/stores/viewStore';
import {callMistralChat} from '@/lib/utils/inference';
import { BLOG_SUMMARY_SYSTEM_PROMPT } from '@/constants';
import { runLocalLlamaPrompt } from '@/lib/utils/localInference';


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
    _transcript = await invoke<string>('get_youtube_transcript', {
      id: videoId,
      languages,
    })
    content.set(_transcript)
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }


  try {
      _summary = await runLocalLlamaPrompt(
        `Resume el siguiente video de youtube:\n\n${_transcript}`,
        {
          systemPrompt: BLOG_SUMMARY_SYSTEM_PROMPT(''),
          onChunk: (chunk: string) => {
            summary.update(current => current + chunk)
          }
        }
      )
      
  } catch (inferenceErr) {
    console.error('Error during inference:', inferenceErr)
  }
  
  return {content: _transcript, summary: _summary || ''} 
}