import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { url as urlStore, loaded, loading, setAllViewStoreValues, articleId } from '@/stores/viewStore'
import { saveViewToDb, getArticleByUrl } from './utils/database/articleDB'



export async function urlRouter(url: string) {
  loading.set(true)
  loaded.set(false)
  urlStore.set(url)
  let savedRow = null

  // Check if the article already exists in the database
  const existingArticle = await getArticleByUrl(url)
  if (existingArticle) {
    // Restore from database
    setAllViewStoreValues(existingArticle)
    loaded.set(true)
    loading.set(false)
    return
  }

  if (/youtube\.com\/watch\?v=/.test(url)) {
    await getYouTubeTranscript(url)
  } else {
    await extractBlog(url)
  }

  savedRow = await saveViewToDb()
  loaded.set(true)
  loading.set(false)

  articleId.set(savedRow?.lastInsertId || null)
  return savedRow
}