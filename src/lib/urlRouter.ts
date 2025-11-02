import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'

export async function urlRouter(url: string) {
  switch (true) {
    case /youtube\.com\/watch\?v=/.test(url):
      return await getYouTubeTranscript(url)
    default:
      return await extractBlog(url)
  }
}
