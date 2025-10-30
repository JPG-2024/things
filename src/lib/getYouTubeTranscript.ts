import { invoke } from '@tauri-apps/api/core'

export async function getYouTubeTranscript(videoLink: string, languages: string[] = ['en', 'es']) {
  let inferenceStreamContent = ''
  try {
    //extract video id from youtube link
    const urlObj = new URL(videoLink)
    const videoId = urlObj.searchParams.get('v')
    if (!videoId) {
      throw new Error('Invalid YouTube URL')
    }
    const transcript = await invoke<string>('get_youtube_transcript', {
      id: videoId,
      languages,
    })
    await invoke('inference', {
      prompt: `Summarize next youtube transcript briefly plus bullet point keys. start with a brief resume title, dont use resume word. output in spanish language:\n\n${transcript}`,
    })
    return transcript
  } catch (err) {
    console.error('Error fetching YouTube transcript:', err)
    return ''
  }
}
