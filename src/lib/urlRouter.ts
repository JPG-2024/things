import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { viewState } from '@/stores/viewStore.svelte'
import { saveViewToDb, getArticleByUrl, getOrCreateMainColor } from './utils/database/articleDB'
import { primaryColor } from '@/stores/uiStore'


// In-memory cache for quick session-level lookup and to avoid duplicate fetches
const inMemoryCache = new Map<string, any>()
// Map of in-flight requests to prevent concurrent duplicate work
const inProgressRequests = new Map<string, Promise<{data: any, cached: boolean}>>()

export async function urlRouter(url: string): Promise<{data: any, cached: boolean}> {
  viewState.cleanAllState()

  viewState.url = url
  // First: check in-memory cache (very fast)
  if (inMemoryCache.has(url)) {
    const cached = inMemoryCache.get(url)
    viewState.setAllValues(cached)
    viewState.loaded = true
    viewState.loading = false
    try {
      const mainColor = await getOrCreateMainColor(cached.id);
      primaryColor.set(mainColor);
    } catch {}

    return { data: cached, cached: true }
  }

  // Prevent running the same task concurrently
  if (inProgressRequests.has(url)) {
    return inProgressRequests.get(url) as Promise<{data: any, cached: boolean}>
  }

  const cachedArticle = await getArticleByUrl(url)
  if (cachedArticle) {
    // Restore from database
    viewState.setAllValues(cachedArticle)
    viewState.loaded = true
    viewState.loading = false
    const mainColor = await getOrCreateMainColor(cachedArticle.id);
    primaryColor.set(mainColor);

    return {data: cachedArticle, cached: true}

  }

  // Extract and save new content

  viewState.loading = true
  viewState.loaded = false

  
  // Wrap extraction & save in a try/catch; also register this work in inProgressRequests
  const inFlight = (async () => {
    let data = {content: '', summary: ''}

    try {
      if (/youtube\.com\/watch\?v=/.test(url)) { // youtube route
        data = await getYouTubeTranscript(url)
      } else {
        data = await extractBlog(url) // generic article route
      }

      // TODO: pass extractor functions via parameter in this funcion and map ober to do task with summary or content extracted.
/*        const extractedCategory = await  runLocalLlamaPrompt(
             `Extract the category.`,
             {
               systemPrompt: "You are an expert article categorizer. Given the content of a blog article, provide a single-word category that best fits the article from the following options: Technology, Health, Lifestyle, Education, Entertainment, Business, Sports, Science, Travel, Food, Politics, Environment, Fashion, Art, History, Psychology, Music, Programming. If none fit well, respond with 'Unsorted'. Only respond with the category word.",
               messages: [
                 { role: 'user', content: data.content }
               ]
             }
           ) */


      viewState.category = "Unsorted"

    
      // Save Article to DB
      const newArticle = await saveViewToDb()

      if (newArticle) {
        const mainColor = await getOrCreateMainColor(newArticle.id)
        if (mainColor) primaryColor.set(mainColor);
        // Save in-memory for faster subsequent access during the session
        inMemoryCache.set(url, newArticle)
      }

      viewState.loaded = true
      viewState.loading = false
      viewState.articleId = newArticle?.id || null
      return { data: newArticle, cached: false }
    } catch (err) {
      console.error('Error while routing URL:', err)

      // If extraction or saving fails, try again to fetch from DB as a fallback
      const fallback = await getArticleByUrl(url)
      if (fallback) {
        viewState.setAllValues(fallback)
        viewState.loaded = true
        viewState.loading = false
        try { const mainColor = await getOrCreateMainColor(fallback.id); primaryColor.set(mainColor);} catch {}
        inMemoryCache.set(url, fallback)
        return { data: fallback, cached: true }
      }

      // No cached article found - rethrow to allow caller to handle it
      viewState.loading = false
      viewState.loaded = false
      throw err
    } finally {
      inProgressRequests.delete(url)
    }
  })()

  inProgressRequests.set(url, inFlight)
  const result = await inFlight
  
  return result
}

// Helpers to clear in-memory caches (useful for debugging or when deleting articles)
export function clearUrlCache(url: string) {
  inMemoryCache.delete(url)
}

export function removeArticleFromCache(url: string) {
  inMemoryCache.delete(url)
}

export function clearAllUrlCaches() {
  inMemoryCache.clear()
  inProgressRequests.clear()
}