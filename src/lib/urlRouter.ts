import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractUrlToMarkdown } from './extractUrlToMarkdown'

export async function urlRouter(url: string) {
  switch (true) {
    case /youtube\.com\/watch\?v=/.test(url):
      return await getYouTubeTranscript(url)
    default:
      extractUrlToMarkdown(url)
  }
}
