use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
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
        },
        // This is your eighth migration.
        Migration {
            version: 8,
            description: "add-mainImageFile-column",
            // SQL to add the mainImageFile column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN mainImageFile TEXT;",
            kind: MigrationKind::Up,
        },
        // This is your ninth migration.
        Migration {
            version: 9,
            description: "add-mediaDirectory-column",
            // SQL to add the mediaDirectory column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN mediaDirectory TEXT;",
            kind: MigrationKind::Up,
        },
        // This is your tenth migration.
        Migration {
            version: 10,
            description: "add-embeddings-column",
            // SQL to add the embeddings column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN embeddings BOOLEAN;",
            kind: MigrationKind::Up,
        },
        // This is your eleventh migration.
        Migration {
            version: 11,
            description: "rewrite-articles-table-for-task-runner-state",
            // SQL to rewrite articles table with only id, url and tasks.
            sql: "PRAGMA foreign_keys=OFF;
            CREATE TABLE IF NOT EXISTS articles_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT UNIQUE,
                tasks JSON
            );
            INSERT INTO articles_new (id, url, tasks)
            SELECT
                a1.id,
                CASE
                    WHEN a1.url IS NOT NULL AND EXISTS (
                        SELECT 1 FROM articles a2 WHERE a2.url = a1.url AND a2.id > a1.id
                    ) THEN NULL
                    ELSE a1.url
                END,
                NULL
            FROM articles a1;
            DROP TABLE articles;
            ALTER TABLE articles_new RENAME TO articles;
            CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
            PRAGMA foreign_keys=ON;",
            kind: MigrationKind::Up,
        },
        // This is your twelfth migration.
        Migration {
            version: 12,
            description: "add-title-and-thumbnail-columns",
            // SQL to add the title and thumbnail columns to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN title TEXT; ALTER TABLE articles ADD COLUMN thumbnail TEXT;",
            kind: MigrationKind::Up,
        },
        // This is your thirteenth migration.
        Migration {
            version: 13,
            description: "add-content-column-if-not-exists",
            // SQL to add the content column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN content TEXT;",
            kind: MigrationKind::Up,
        },
        // This is your fourteenth migration.
        Migration {
            version: 14,
            description: "add-directory-column",
            // SQL to add the directory column to the articles table.
            sql: "ALTER TABLE articles ADD COLUMN directory TEXT;",
            kind: MigrationKind::Up,
        }
    ]
}
