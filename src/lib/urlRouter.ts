import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { url as urlStore, loaded, getAllViewStoreValues } from '../stores/viewStore'
import { saveViewToDb } from './database'

import * as viewStore from '../stores/viewStore'

export async function urlRouter(url: string) {
  try {
    loaded.set(false)

    urlStore.set(url)
    
  } catch {
    return null
  }
  
  switch (true) {
    case /youtube\.com\/watch\?v=/.test(url):
      await getYouTubeTranscript(url)
      loaded.set(true)
      await saveViewToDb()
      return  
    default:
      const result = await extractBlog(url)
      loaded.set(true)
      await saveViewToDb()
      return result
  }
}
