import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { domainUrl, ytVideoId, loaded } from '../stores/viewStore'

export async function urlRouter(url: string) {
  try {
    loaded.set(false)

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
      await getYouTubeTranscript(url)
      loaded.set(true)
      return  
    default:
      const result = await extractBlog(url)
      loaded.set(true)
      return result
  }
}
