import Database from '@tauri-apps/plugin-sql';
import type { QueryResult } from '@tauri-apps/plugin-sql';
import { getAllViewStoreValues } from '@/stores/viewStore';

// Variable to hold the database instance.
let db: Database | null = null;

// Load the database. Migrations will run automatically here.
async function getDb() {
  if (!db) {
    // The name 'sqlite:notian.db' must match the one used in main.rs
    db = await Database.load("sqlite:notian.db");
  }
  return db;
}

// Function to get an article by URL from the database.
export async function getArticleByUrl(url: string) {
  const db = await getDb();

  try {
    const result = await db.select<Array<any>>(
      // expose the implicit rowid as id for later deletion
      `SELECT rowid as id, * FROM articles WHERE url = $1 LIMIT 1`,
      [url]
    );

    if (result && result.length > 0) {
      const article = result[0];
      return {
        ...article,
        metadataContent: article.metadataContent ? JSON.parse(article.metadataContent) : {},
      };
    }
    return null;
  } catch (error) {
    console.error("Error querying article from database:", error);
    return null;
  }
}

// Function to save the store data to the database.
// Function to get all articles, limited to 20 results.
export async function getAllArticles({limit = 100} = {}): Promise<Array<any>> {
  const db = await getDb();
  try {
    const result = await db.select<Array<any>>(
      `SELECT * FROM articles ORDER BY rowid DESC LIMIT $1`,
      [limit]
    );
    // Parse metadataContent for each article
    return result.map(article => ({
      ...article,
      metadataContent: article.metadataContent ? JSON.parse(article.metadataContent) : {},
    }));
  } catch (error) {
    console.error("Error querying articles from database:", error);
    return [];
  }
}

export async function saveViewToDb(): Promise<QueryResult> {
  const data = getAllViewStoreValues();
  const db = await getDb();

  data.metadataContent = {
    ...data.metadataContent,
    'og:image': data.mainImage || data.ytThumbnailUrl || ''
  }

  // The metadataContent is an object, we save it as a JSON string.
  const metadataJson = JSON.stringify(data.metadataContent);

  try {
    // The parameter syntax is with $1, $2, etc.
    const result = await db.execute(
      `INSERT INTO articles (url, title, description, mainImage, markdownContent, metadataContent, domainUrl, ytVideoId, ytThumbnailUrl, summary, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        data.url,
        data.title,
        data.description,
        data.mainImage,
        data.markdownContent,
        metadataJson,
        data.domainUrl,
        data.ytVideoId,
        data.ytThumbnailUrl,
        data.summary,
        data.content
      ]
    );
    
    return result;

  } catch (error) {
    console.error("Error saving to the database:", error);
    throw error;
  }
}

// Delete an article by its rowid (exposed as id in queries)
export async function deleteArticleById(id: number) {
  const db = await getDb();
  try {
    // returns nothing; we can follow up with a select if needed
    await db.execute(`DELETE FROM articles WHERE rowid = $1`, [id]);
    return { success: true };
  } catch (error) {
    console.error('Error deleting article from database:', error);
    return { success: false, error };
  }
}

// Re-export chat and message functions from chatDB.ts
export { newChat, saveMessage, getMessagesByChat, deleteMessageById, deleteMessagesByChat } from './chatDB';


