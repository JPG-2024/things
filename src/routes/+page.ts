import { getAllArticles } from '@/lib/database';
import type { PageLoad } from './$types';

// Use client-side load because the Tauri SQL plugin is only available in the browser.
export const ssr = false;

export const load: PageLoad = async () => {
  const articles = await getAllArticles();
  return { articles };
};
