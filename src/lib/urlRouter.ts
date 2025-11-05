import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { domainUrl, ytVideoId } from '../stores/viewStore'

export async function urlRouter(url: string) {
  try {
    const newUrl = new URL(url)
    // set urlStore as domain only
    domainUrl.set(newUrl.hostname)
    // extract youtube video id or blog content
    ytVideoId.set(newUrl.searchParams.get('v'))
  } catch {
    return null
  }
  
  switch (true) {
    case /youtube\.com\/watch\?v=/.test(url):
      return await getYouTubeTranscript(url)
    default:
      return await extractBlog(url)
  }
}
