import { getArticlesByCategory } from '@/lib/utils/database/articleDB'
import { storeCacheWrapper } from '@/stores/cacheStore'

const fetcher = async (categoryId: string, { limit }: { limit: number }) => {
  return await getArticlesByCategory(categoryId, { limit })
}

export const categoryCache = storeCacheWrapper<Array<Article>, { limit: number }>(fetcher)
