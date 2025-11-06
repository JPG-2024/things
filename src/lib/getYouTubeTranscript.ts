import { invoke } from '@tauri-apps/api/core'

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
    await invoke('inference', {
      prompt: `Haz un resumen en español corto del contenido, siguiendo por los 5 puntos clave y una conclusion:\n\n${transcript}`
    })
  } catch (inferenceErr) {
    console.error('Error during inference:', inferenceErr)
    // Optionally, handle the error or rethrow
  }
  return transcript
  
}
