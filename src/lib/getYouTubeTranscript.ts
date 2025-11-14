import { invoke } from '@tauri-apps/api/core'
import { summary } from '@/stores/viewStore';

import {inference} from '@/lib/utils/inference';
import { youTubeSummaryPrompt } from '@/stores/promptStore';
import { get } from 'svelte/store';

export async function getYouTubeTranscript(videoLink: string, languages: string[] = ['en', 'es']) {
  //extract video id from youtube link
  const urlObj = new URL(videoLink)
  const videoId = urlObj.searchParams.get('v')
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  let transcript: string
  try {
    transcript = await invoke<string>('get_youtube_transcript', {
      id: videoId,
      languages,
    })
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }


  try {
    await inference(`${get(youTubeSummaryPrompt)}\n\n${transcript}`, (result) => {
      summary.update(current => current + result)
    })
  } catch (inferenceErr) {
    console.error('Error during inference:', inferenceErr)
  }
  return transcript
  
}
