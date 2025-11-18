import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { url as urlStore, loaded, loading, setAllViewStoreValues, articleId, cleanAllState } from '@/stores/viewStore'
import { saveViewToDb, getArticleByUrl, getOrCreateMainColor } from './utils/database/articleDB'
import { primaryColor } from '@/stores/uiStore'



export async function urlRouter(url: string) {

  urlStore.set(url)
  let savedRow = null

  // Check if the article already exists in the database
  const existingArticle = await getArticleByUrl(url)
  if (existingArticle) {
    // Restore from database
    setAllViewStoreValues(existingArticle)
    loaded.set(true)
    loading.set(false)
    const mainColor = await getOrCreateMainColor(existingArticle.id);
    primaryColor.set(mainColor);

    return existingArticle
  } else {
    
  }

  loading.set(true)
  loaded.set(false)
  cleanAllState()

  if (/youtube\.com\/watch\?v=/.test(url)) {
    await getYouTubeTranscript(url)
  } else {
    await extractBlog(url)
  }

  const article = await saveViewToDb()
  
  if (article) {
    const mainColor = await getOrCreateMainColor(article.id);
    primaryColor.set(mainColor);
  }

  loaded.set(true)
  loading.set(false)

  articleId.set(article?.id || null)
  return savedRow
}