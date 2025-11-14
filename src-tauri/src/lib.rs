mod images;

mod browser;
pub use crate::browser::init_browser;

/* mod inference_openrouter;
pub use crate::inference_openrouter::inference; */

/* mod inference_hugging;
pub use crate::inference_hugging::inference; */

mod inference_mistral;
pub use crate::inference_mistral::inference;

mod youtube;
pub use crate::youtube::get_youtube_transcript;

mod markdown;
pub use crate::markdown::{extract_blog, extract_markdown, extract_metadata};

use tauri_plugin_sql::{Builder, Migration, MigrationKind};

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
        .setup(|app| {
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
            inference,
            get_youtube_transcript
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
