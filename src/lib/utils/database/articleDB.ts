import Database from '@tauri-apps/plugin-sql';
import { convertFileSrc } from '@tauri-apps/api/core';
import { BaseDirectory } from '@tauri-apps/api/path';

import { getAllViewStoreValues } from '@/stores/viewStore';
import { getImageColor } from '../getImageColor';
import { remove } from '@tauri-apps/plugin-fs';
import { getImageSrc } from '../dirs';

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
export async function getArticleByUrl(url: string): Promise<Article | null> {
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

    return null
    
  } catch (error) {
    console.error("Error querying article from database:", error);
    throw error;
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

export async function saveViewToDb(): Promise<Article> {
  const data = getAllViewStoreValues();
  const db = await getDb();

  data.metadataContent = {
    ...data.metadataContent,
    'og:image': data.mainImage || data.ytThumbnailUrl || ''
  }

  data.mainImage = data.mainImage || data.ytThumbnailUrl || '';
  
  // The metadataContent is an object, we save it as a JSON string.
  const metadataJson = JSON.stringify(data.metadataContent);

  try {
    // The parameter syntax is with $1, $2, etc.
    await db.execute(
      `INSERT INTO articles (url, title, description, mainImage, markdownContent, metadataContent, domainUrl, ytVideoId, ytThumbnailUrl, summary, content, category, mediaDirectory)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
        data.content,
        data.category,
        data.mediaDirectory
      ]
    );

    const article = await getArticleByUrl(data.url || '');
    
    if (!article) {
      throw new Error('Failed to retrieve saved article');
    }

    return article;

  } catch (error) {
    throw error;
  }
}

// Delete an article by its rowid (exposed as id in queries)
export async function deleteArticleById(id: number) {
  const db = await getDb();
  try {
    // First, get the article to retrieve mainImageFile
    const result = await db.select<Array<any>>(
      `SELECT mainImageFile FROM articles WHERE rowid = $1 LIMIT 1`,
      [id]
    );

    if (result && result.length > 0 && result[0].mainImageFile) {
      try {
        await remove(`media/${result[0].mainImageFile}`, { baseDir: BaseDirectory.AppData });
        console.log(`[Image] Deleted local image: ${result[0].mainImageFile}`);
      } catch (error) {
        console.error(`[Image] Error deleting local image: ${error}`);
      }
    }

    // Delete the article record
    await db.execute(`DELETE FROM articles WHERE rowid = $1`, [id]);
    return { success: true };
  } catch (error) {
    console.error('Error deleting article from database:', error);
    return { success: false, error };
  }
}

export async function getOrCreateMainColor(articleId: number): Promise<string> {
  const db = await getDb();
  
  try {
    // First, try to get the article
    const result = await db.select<Array<any>>(
      `SELECT rowid as id, mainImage, mediaDirectory, mainColor FROM articles WHERE rowid = $1 LIMIT 1`,
      [articleId]
    );


    if (!result || result.length === 0) {
      throw new Error(`Article with ID ${articleId} not found`);
    }

    const article = result[0];

    // If mainColor already exists, return it
    if (article.mainColor) {
      return article.mainColor;
    }

    // Use local image path if available, otherwise use remote URL
    let imageSource = '';
    debugger
    if (article.mediaDirectory && article.mainImage) {
      imageSource = await getImageSrc(article.mediaDirectory, article.mainImage);
    }
    
    // Calculate the color using getImageColor
    const calculatedColor = await getImageColor(imageSource);

    // Save the calculated color to the database
    await db.execute(
      `UPDATE articles SET mainColor = $1 WHERE rowid = $2`,
      [calculatedColor, articleId]
    );

    return calculatedColor;
  } catch (error) {
    throw error;
  }
}

export const getArticlesByCategory = async (category: string, {limit = 100} = {}): Promise<Array<Article>> => {
  const db = await getDb();
  try {
    const result = await db.select<Array<any>>(
      `SELECT * FROM articles WHERE category = $1 ORDER BY rowid DESC LIMIT $2`,
      [category, limit]
    );
    // Parse metadataContent for each article
    return result.map(article => ({
      ...article,
      metadataContent: article.metadataContent ? JSON.parse(article.metadataContent) : {},
    }));
  } catch (error) {
    console.error("Error querying articles by category from database:", error);
    return [];
  }
}

// Re-export chat and message functions from chatDB.ts
export { newChat, saveMessage, getMessagesByChat, deleteMessageById, deleteMessagesByChat } from './chatDB';


