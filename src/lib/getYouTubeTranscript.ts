import { invoke } from '@tauri-apps/api/core'
import { summary, content } from '@/stores/viewStore';
import {callMistralChat} from '@/lib/utils/inference';
import { YOUTUBE_SUMMARY_PROMPT } from '@/constants';

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
    content.set(transcript)
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }


  try {
    await callMistralChat({
      systemPrompt: YOUTUBE_SUMMARY_PROMPT(transcript),
      prompt: 'sigue las intrucciones'},
      (result) => {
        summary.update(current => current + result)
    })
      
  } catch (inferenceErr) {
    console.error('Error during inference:', inferenceErr)
  }
  return transcript
  
}