import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { url as urlStore, loaded, loading } from '../stores/viewStore'
import { saveViewToDb, getArticleByUrl } from './database'

import * as viewStore from '../stores/viewStore'

export async function urlRouter(url: string) {
  loading.set(true)
  loaded.set(false)
  urlStore.set(url)

  // Check if the article already exists in the database
  const existingArticle = await getArticleByUrl(url)
  if (existingArticle) {
    // Restore from database
    viewStore.setAllViewStoreValues(existingArticle)
    loaded.set(true)
    loading.set(false)
    return
  }
  
  switch (true) {
    case /youtube\.com\/watch\?v=/.test(url):
      await getYouTubeTranscript(url)
      
      await saveViewToDb()
      loaded.set(true)
      loading.set(false)
      return  
    default:
      const result = await extractBlog(url)
      
      await saveViewToDb()
      loaded.set(true)
      loading.set(false)
      return result
  }
}
