import Database from '@tauri-apps/plugin-sql';
import { getAllViewStoreValues } from '../stores/viewStore';

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

// Function to save the store data to the database.
export async function saveViewToDb() {
  const data = getAllViewStoreValues();
  const db = await getDb();

  // The metadataContent is an object, we save it as a JSON string.
  const metadataJson = JSON.stringify(data.metadataContent);

  try {
    // The parameter syntax is with $1, $2, etc.
    await db.execute(
      `INSERT INTO articles (url, title, description, mainImage, markdownContent, metadataContent, domainUrl, ytVideoId, ytThumbnailUrl)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
      ]
    );
    console.log("Article saved to the database.");
  } catch (error) {
    console.error("Error saving to the database:", error);
  }
}
