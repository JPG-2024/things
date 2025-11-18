mod browser;
pub use crate::browser::init_browser;

/* mod inference_openrouter;
pub use crate::inference_openrouter::inference; */

/* mod inference_hugging;
pub use crate::inference_hugging::inference; */

mod youtube;
pub use crate::youtube::get_youtube_transcript;

mod markdown;
pub use crate::markdown::{extract_blog, extract_markdown, extract_metadata};

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    let migrations = vec![
        // This is your first migration.
        Migration {
            version: 1,
            description: "create-articles-table",
            // SQL to create the table. It's safer to use `IF NOT EXISTS`.
            sql: "CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT,
                title TEXT,
                description TEXT,
                mainImage TEXT,
                markdownContent TEXT,
                metadataContent TEXT,
                domainUrl TEXT,
                ytVideoId TEXT,
                ytThumbnailUrl TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );",
            kind: MigrationKind::Up,
        },
        // This is your second migration.
        Migration {
            version: 2,
            description: "add-url-index",
            // SQL to create an index on the 'url' field for faster queries.
            sql: "CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);",
            kind: MigrationKind::Up,
        },
        // This is your third migration.
        Migration {
            version: 3,
            description: "add-summary-column",
            // SQL to add the summary column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN summary TEXT;",
            kind: MigrationKind::Up,
        },
        // This is your fourth migration.
        Migration {
            version: 4,
            description: "add-category-and-mainColor-columns",
            // SQL to add the category and mainColor columns to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN category TEXT; ALTER TABLE articles ADD COLUMN mainColor TEXT;",
            kind: MigrationKind::Up,
        },
        // This is your fifth migration.
        Migration {
            version: 5,
            description: "add-ytTranscript-column",
            // SQL to add the ytTranscript column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN ytTranscript TEXT;",
            kind: MigrationKind::Up,
        },
        // This is your sixth migration.
        Migration {
            version: 6,
            description: "create-chats-and-messages-tables",
            // SQL to create chats and messages tables with proper relationships
            sql: "CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_id INTEGER,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                sender TEXT,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            );",
            kind: MigrationKind::Up,
        },
        // This is your seventh migration.
        Migration {
            version: 7,
            description: "add-content-column",
            // SQL to add the content column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN content TEXT;",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(
            // Build the SQL plugin
            tauri_plugin_sql::Builder::default()
                // Add migrations to the 'notian.db' database
                .add_migrations("sqlite:notian.db", migrations)
                .build(),
        )
        .setup(|_app| {
            tauri::async_runtime::spawn(async move {
                let _ = crate::browser::init_browser().await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        // Register the command wrapper here
        .invoke_handler(tauri::generate_handler![
            extract_markdown,
            extract_metadata,
            extract_blog,
            get_youtube_transcript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
