import { getYouTubeTranscript } from './getYouTubeTranscript'
import { extractBlog } from './extractBlog'
import { url as urlStore, loaded, loading, setAllViewStoreValues, articleId, cleanAllState, content, category } from '@/stores/viewStore'
import { saveViewToDb, getArticleByUrl, getOrCreateMainColor } from './utils/database/articleDB'
import { primaryColor } from '@/stores/uiStore'


import { callMistralChat } from './utils/inference'
import { CONTENT_EXTRACTION_SCHEMA } from './utils/structuredSchemas'



// In-memory cache for quick session-level lookup and to avoid duplicate fetches
const inMemoryCache = new Map<string, any>()
// Map of in-flight requests to prevent concurrent duplicate work
const inProgressRequests = new Map<string, Promise<{data: any, cached: boolean}>>()

export async function urlRouter(url: string): Promise<{data: any, cached: boolean}> {
  urlStore.set(url)
  let savedRow = null

  // First: check in-memory cache (very fast)
  if (inMemoryCache.has(url)) {
    const cached = inMemoryCache.get(url)
    setAllViewStoreValues(cached)
    loaded.set(true)
    loading.set(false)
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
    setAllViewStoreValues(cachedArticle)
    loaded.set(true)
    loading.set(false)
    const mainColor = await getOrCreateMainColor(cachedArticle.id);
    primaryColor.set(mainColor);

    return {data: cachedArticle, cached: true}

  }

  // Extract and save new content

  loading.set(true)
  loaded.set(false)
  cleanAllState()

  
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
/*       const extractedCategory = await callMistralChat({
        systemPrompt: `You are a text classifier. Classify the following inputs into exactly one of these categories:

Inteligencia artificial

Salud

Psicologia

Programacion

Filosofia

Examples:

Inteligencia artificial

ES: "El nuevo iPhone incluye inteligencia artificial" → Inteligencia artificial

EN: "Machine learning models are improving every year" → Inteligencia artificial

Salud

ES: "La dieta mediterránea puede mejorar la salud del corazón" → Salud

EN: "Regular exercise reduces the risk of chronic diseases" → Salud

Psicologia

ES: "La ansiedad puede aumentar bajo situaciones de estrés" → Psicologia

EN: "Cognitive biases affect our daily decision-making" → Psicologia

Programacion

ES: "Cómo crear una API REST usando Node.js" → Programacion

EN: "Python supports multiple programming paradigms" → Programacion

Filosofia

ES: "Platón consideraba que el mundo sensible era una copia imperfecta del mundo de las ideas" → Filosofia

EN: "Existentialism explores the meaning of human existence" → Filosofia`,
        prompt: `Content: """${data.summary}"""`,
        maxTokens: 10,
        temperature: 0
      }) */

      category.set("Unsorted") //extractedCategory.trim()
      ///////////////////////////////////////////////////////////////////////////////

      // Save Article to DB
      const newArticle = await saveViewToDb()

      if (newArticle) {
        const mainColor = await getOrCreateMainColor(newArticle.id).catch(() => null);
        if (mainColor) primaryColor.set(mainColor);
        // Save in-memory for faster subsequent access during the session
        inMemoryCache.set(url, newArticle)
      }

      loaded.set(true)
      loading.set(false)
      articleId.set(newArticle?.id || null)
      return { data: newArticle, cached: false }
    } catch (err) {
      console.error('Error while routing URL:', err)

      // If extraction or saving fails, try again to fetch from DB as a fallback
      const fallback = await getArticleByUrl(url)
      if (fallback) {
        setAllViewStoreValues(fallback)
        loaded.set(true)
        loading.set(false)
        try { const mainColor = await getOrCreateMainColor(fallback.id); primaryColor.set(mainColor);} catch {}
        inMemoryCache.set(url, fallback)
        return { data: fallback, cached: true }
      }

      // No cached article found - rethrow to allow caller to handle it
      loading.set(false)
      loaded.set(false)
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

export function clearAllUrlCaches() {
  inMemoryCache.clear()
  inProgressRequests.clear()
}