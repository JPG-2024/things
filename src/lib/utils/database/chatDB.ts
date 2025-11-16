import Database from '@tauri-apps/plugin-sql';

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

interface ChatParams {
  articleId?: number;
  name?: string;
}

export async function newChat({articleId, name = "New Chat"}: ChatParams = {}) {
  const db = await getDb();
  try {
    const result = await db.execute(
      `INSERT INTO chats (article_id, name, created_at) VALUES ($1, $2, datetime('now')) RETURNING id, article_id as articleId, name, created_at as createdAt`,
      [articleId || null, name]
    );
    if (result) {
      return result;
    }
    throw new Error('Failed to create new chat');
  } catch (error) {
    console.error('Error creating new chat in database:', error);
    throw error;
  }
}

// Function to save a message to the database
export async function saveMessage({chatId, sender, content}: {chatId: number; sender?: string; content: string}) {
  const db = await getDb();
  try {
        const result = await db.execute(
        `INSERT INTO messages (chat_id, sender, content, created_at) VALUES ($1, $2, $3, datetime('now')) RETURNING id, chat_id as chatId, sender, content, created_at as createdAt`,
        [chatId, sender || 'user', content]
        );
        if (result) {
            return result;
        }
        throw new Error('Failed to save message');
  } catch (error) {
    console.error('Error saving message to database:', error);
    throw error;
  }
}// Function to get all messages for a chat
export async function getMessagesByChat(chatId: number) {
  const db = await getDb();
  try {
    const result = await db.select<Array<any>>(
      `SELECT id, chat_id as chatId, sender, content, created_at as createdAt FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`,
      [chatId]
    );
    return result || [];
  } catch (error) {
    console.error('Error retrieving messages from database:', error);
    return [];
  }
}

// Function to delete a message by ID
export async function deleteMessageById(messageId: number) {
  const db = await getDb();
  try {
    await db.execute(`DELETE FROM messages WHERE id = $1`, [messageId]);
    return { success: true };
  } catch (error) {
    console.error('Error deleting message from database:', error);
    return { success: false, error };
  }
}

// Function to delete all messages for a chat
export async function deleteMessagesByChat(chatId: number) {
  const db = await getDb();
  try {
    await db.execute(`DELETE FROM messages WHERE chat_id = $1`, [chatId]);
    return { success: true };
  } catch (error) {
    console.error('Error deleting messages from database:', error);
    return { success: false, error };
  }
}