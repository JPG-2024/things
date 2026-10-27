use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use tauri::AppHandle;

pub const WEB_STORE_UNKNOWN_PROFILE_ID: &str = "__unknown_profile__";
pub const WEB_STORE_UNKNOWN_PROFILE_LABEL: &str = "Unknown profile";

/// DB file paths whose schema was already ensured this session. Every command
/// used to run `init_schema` (full DDL + rename migration) on a fresh
/// connection; memoizing by resolved path keeps that to once per database,
/// covering `init_database_at` (workspace prep) and export/import locations.
static INITIALIZED_DB_PATHS: Lazy<Mutex<HashSet<PathBuf>>> =
    Lazy::new(|| Mutex::new(HashSet::new()));

fn schema_ensured(path: &Path) -> bool {
    INITIALIZED_DB_PATHS
        .lock()
        .expect("initialized db paths lock poisoned")
        .contains(path)
}

fn mark_schema_ensured(path: &Path) {
    INITIALIZED_DB_PATHS
        .lock()
        .expect("initialized db paths lock poisoned")
        .insert(path.to_path_buf());
}

/// Ensures the schema exists on `conn` for the database at `path`, at most once
/// per path per session. Idempotence is already guaranteed by `IF NOT EXISTS`,
/// so the memo is purely a work-avoidance guard.
fn ensure_schema(conn: &Connection, path: &Path) -> Result<(), String> {
    if !schema_ensured(path) {
        init_schema(conn)?;
        mark_schema_ensured(path);
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreArticleRecord {
    pub id: String,
    pub url: Option<String>,
    pub created_at: i64,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub content: Option<String>,
    pub directory: Option<String>,
    pub media_directory: Option<String>,
    pub main_color: Option<String>,
    pub profile: Option<String>,
    pub domain: Option<String>,
    pub primary_color: Option<String>,
    pub updated_at: i64,
    pub embedding_source_text: Option<String>,
    pub viewed: bool,
    pub date: Option<String>,
    pub profile_picture: Option<String>,
    /// Combined summary of the window analysis (the only analytic in the MVP).
    pub summary: Option<String>,
    /// Window divisor that was actually executed. `NULL` means the article was
    /// split by markdown headings instead of by level.
    pub analysis_divisor: Option<i64>,
    /// `full` = analysed, `metadata` = captured but pending analysis.
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreDomainRecord {
    pub id: String,
    pub name: String,
    pub count: i64,
    pub profile_picture: Option<String>,
    pub url: Option<String>,
    pub most_recent_created_at: Option<i64>,
    pub articles: Option<Vec<WebStoreArticleRecord>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreProfileRecord {
    pub id: String,
    pub name: String,
    pub domain_id: String,
    pub count: i64,
    pub profile_picture: Option<String>,
    pub url: Option<String>,
    pub most_recent_created_at: Option<i64>,
    pub articles: Option<Vec<WebStoreArticleRecord>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreProfileDeletion {
    pub success: bool,
    pub deleted_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVideo {
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProfile {
    pub id: String,
    pub videos: Vec<RemoteVideo>,
    pub profile_image: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticlesWithoutProfileResponse {
    pub articles: Vec<WebStoreArticleRecord>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryWithArticles {
    pub category_id: String,
    pub category_name: String,
    pub articles: Vec<WebStoreArticleRecord>,
    pub has_more: bool,
}

/// One page of the category catalog for the categories wheel. `has_more`
/// signals whether another page of categories exists after this one.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoriesWithArticlesPage {
    pub categories: Vec<CategoryWithArticles>,
    pub has_more: bool,
}

/// One page request for a single category, or all categories when
/// `category_id` is None (initial fetch).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryArticlesQuery {
    pub category_id: Option<String>,
    pub offset: usize,
    pub article_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreCategoryRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub last_modified: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertWebStoreCategoryInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignCategoriesToArticleInput {
    pub article_url: String,
    pub category_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignCategoriesToProfileInput {
    pub profile_id: String,
    pub category_ids: Vec<String>,
}

/// A single fed example for a category: the `title + summary` text of an
/// article (or of one analysis window) the user assigned to it. The text is the
/// source of truth; the per-exemplar vector is derived from it in the LanceDB
/// index. `window_index` keeps the window exemplars of one article apart.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryExemplarRecord {
    pub id: String,
    pub category_id: String,
    pub article_url: String,
    pub article_title: Option<String>,
    pub text: String,
    pub model_name: Option<String>,
    pub model_dimensions: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
    pub window_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCategoryExemplarInput {
    pub category_id: String,
    pub article_url: String,
    pub text: String,
    pub model_name: Option<String>,
    pub model_dimensions: Option<i32>,
    /// Window slot of the exemplar; defaults to the single/whole-document slot.
    #[serde(default)]
    pub window_index: Option<i32>,
}

/// How many stored exemplars were embedded with the given model signature.
/// `total > matching` means the derived index is stale and must be rebuilt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryExemplarModelStatus {
    pub total: i64,
    pub matching: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertWebStoreArticleInput {
    pub url: String,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub content: Option<String>,
    pub directory: Option<String>,
    pub main_color: Option<String>,
    pub profile: Option<String>,
    pub embedding_source_text: Option<String>,
    pub date: Option<String>,
    /// `full` | `metadata`. `metadata` marks a captured-but-not-analysed article.
    pub mode: Option<String>,
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn database_path(app: &AppHandle) -> Result<String, String> {
    Ok(crate::db_manager::database_path(app)?
        .to_string_lossy()
        .to_string())
}

fn raw_content_dir(app: &AppHandle) -> Result<PathBuf, String> {
    crate::db_manager::raw_content_dir(app)
}

fn raw_content_key(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.trim().as_bytes());
    hex::encode(hasher.finalize())
}

fn raw_content_path(app: &AppHandle, url: &str) -> Result<PathBuf, String> {
    Ok(raw_content_dir(app)?.join(format!("{}.txt", raw_content_key(url))))
}

fn delete_raw_content_file(app: &AppHandle, url: &str) {
    if let Ok(path) = raw_content_path(app, url) {
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|error| error.to_string())?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|error| error.to_string())?;

    Ok(conn)
}

/// Opens (and initializes if needed) a database file without going through the
/// active workspace, so the database manager can prepare a workspace before it
/// becomes active.
pub(crate) fn init_database_at(path: &Path) -> Result<(), String> {
    let conn = open_connection(path)?;
    ensure_schema(&conn, path)
}

fn get_db(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let conn = open_connection(Path::new(&path))?;
    ensure_schema(&conn, Path::new(&path))?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    migrate_rename_profiles_to_domains(conn)?;
    migrate_profile_category_shape(conn)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS web_domains (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            profile_picture TEXT,
            url TEXT,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS web_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            domain_id TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            profile_picture TEXT,
            url TEXT,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (domain_id) REFERENCES web_domains(id)
        );
        CREATE INDEX IF NOT EXISTS idx_web_profiles_domain_id ON web_profiles(domain_id);

        CREATE TABLE IF NOT EXISTS web_articles (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            domain TEXT,
            created_at INTEGER NOT NULL DEFAULT 0,
            title TEXT,
            thumbnail TEXT,
            content TEXT,
            media_directory TEXT,
            main_color TEXT,
            profile TEXT,
            embedding_source_text TEXT,
            updated_at INTEGER NOT NULL,
            viewed INTEGER NOT NULL DEFAULT 0,
            date TEXT,
            summary TEXT,
            analysis_divisor INTEGER,
            mode TEXT,
            profile_rank INTEGER,
            FOREIGN KEY (domain) REFERENCES web_domains(id)
        );
        CREATE INDEX IF NOT EXISTS idx_web_articles_url ON web_articles(url);
        CREATE INDEX IF NOT EXISTS idx_web_articles_profile ON web_articles(profile);
        CREATE INDEX IF NOT EXISTS idx_web_articles_mode ON web_articles(mode);

        CREATE TABLE IF NOT EXISTS web_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            last_modified INTEGER NOT NULL,
            deleted_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS article_category (
            article_url TEXT NOT NULL,
            category_id TEXT NOT NULL,
            PRIMARY KEY (article_url, category_id),
            FOREIGN KEY (category_id) REFERENCES web_categories(id)
        );

        CREATE INDEX IF NOT EXISTS idx_article_category_category_id ON article_category(category_id);

        CREATE TABLE IF NOT EXISTS profile_category (
            profile_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            PRIMARY KEY (profile_id, category_id),
            FOREIGN KEY (category_id) REFERENCES web_categories(id)
        );

        CREATE INDEX IF NOT EXISTS idx_profile_category_category_id ON profile_category(category_id);

        CREATE TABLE IF NOT EXISTS category_exemplars (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            article_url TEXT NOT NULL,
            window_index INTEGER NOT NULL DEFAULT 0,
            text TEXT NOT NULL,
            model_name TEXT,
            model_dimensions INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE (category_id, article_url, window_index)
        );

        CREATE INDEX IF NOT EXISTS idx_category_exemplars_category_id
            ON category_exemplars(category_id);

        CREATE TABLE IF NOT EXISTS article_windows (
            id TEXT PRIMARY KEY,
            article_url TEXT NOT NULL,
            window_index INTEGER NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            payload TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE (article_url, window_index)
        );

        CREATE INDEX IF NOT EXISTS idx_article_windows_article_url
            ON article_windows(article_url);"
    ).map_err(|error| error.to_string())?;

    migrate_legacy_tables(conn)?;
    ensure_column(
        conn,
        "web_domains",
        "url",
        "ALTER TABLE web_domains ADD COLUMN url TEXT",
    )?;
    ensure_column(
        conn,
        "web_articles",
        "viewed",
        "ALTER TABLE web_articles ADD COLUMN viewed INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        conn,
        "web_articles",
        "date",
        "ALTER TABLE web_articles ADD COLUMN date TEXT",
    )?;
    ensure_column(
        conn,
        "web_articles",
        "summary",
        "ALTER TABLE web_articles ADD COLUMN summary TEXT",
    )?;
    ensure_column(
        conn,
        "web_articles",
        "analysis_divisor",
        "ALTER TABLE web_articles ADD COLUMN analysis_divisor INTEGER",
    )?;
    ensure_column(
        conn,
        "web_articles",
        "mode",
        "ALTER TABLE web_articles ADD COLUMN mode TEXT",
    )?;
    ensure_column(
        conn,
        "web_articles",
        "profile_rank",
        "ALTER TABLE web_articles ADD COLUMN profile_rank INTEGER",
    )?;
    ensure_column(
        conn,
        "web_categories",
        "description",
        "ALTER TABLE web_categories ADD COLUMN description TEXT",
    )?;
    migrate_drop_template_tables(conn)?;
    migrate_drop_last_video_date_column(conn)?;
    migrate_article_domain_column(conn)?;
    migrate_article_ids_to_youtube_v(conn)?;
    migrate_channels_to_web_profiles(conn)?;
    migrate_strip_www_domains(conn)?;
    migrate_remove_unknown_profile_domain(conn)?;
    migrate_clear_category_exemplars(conn)?;
    migrate_category_exemplars_window_index(conn)?;

    Ok(())
}

/// Drops the legacy task/template bookkeeping.
///
/// The MVP article runner replaces the whole task model with one linear
/// pipeline: the `web_tasks` blob becomes `article_windows` (one row per
/// analysed window), templates disappear and `web_articles.template_id`
/// becomes the explicit `web_articles.mode` column.
///
/// No data migration is performed on purpose: the old task blob cannot be
/// replayed into the new pipeline, and the plan accepts losing the already
/// computed analysis while keeping title, thumbnail and body.
fn migrate_drop_template_tables(conn: &Connection) -> Result<(), String> {
    for table in ["web_profile_templates", "web_templates", "web_tasks"] {
        conn.execute_batch(&format!("DROP TABLE IF EXISTS {table}"))
            .map_err(|error| error.to_string())?;
    }

    if table_has_column(conn, "web_articles", "template_id") {
        conn.execute_batch("DROP INDEX IF EXISTS idx_web_articles_template_id;")
            .map_err(|error| error.to_string())?;
        conn.execute_batch("ALTER TABLE web_articles DROP COLUMN template_id;")
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

/// Version of the category exemplar comparison text. Bump it whenever the
/// representation changes so the derived SQLite text (which cannot be
/// re-derived) is dropped once.
const CATEGORY_EXEMPLARS_REPR_VERSION: i64 = 1;

/// One-time clear of the category exemplars after the comparison text changed
/// from `topics + keywords` to `title + summary`. The stored `text` column is
/// the old representation and cannot be recomputed, so it is dropped once,
/// guarded by `PRAGMA user_version` so later startups keep the new exemplars.
fn migrate_clear_category_exemplars(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;

    if version < CATEGORY_EXEMPLARS_REPR_VERSION {
        conn.execute("DELETE FROM category_exemplars", [])
            .map_err(|error| error.to_string())?;
        conn.execute_batch(&format!(
            "PRAGMA user_version = {CATEGORY_EXEMPLARS_REPR_VERSION}"
        ))
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

/// One-time rebuild of `category_exemplars` to key exemplars by window.
///
/// Feeding the window summaries of an article means several exemplars share the
/// same `(category_id, article_url)` pair, so the uniqueness key gains
/// `window_index`. SQLite cannot alter a UNIQUE constraint in place, so the
/// table is rebuilt and existing rows keep slot `0` (whole-document exemplar).
fn migrate_category_exemplars_window_index(conn: &Connection) -> Result<(), String> {
    if table_has_column(conn, "category_exemplars", "window_index") {
        return Ok(());
    }

    // The rename carries the old index over to the legacy table; recreate it
    // after the legacy table is dropped so the new table owns it again.
    conn.execute_batch(
        "ALTER TABLE category_exemplars RENAME TO category_exemplars_legacy;
         CREATE TABLE category_exemplars (
             id TEXT PRIMARY KEY,
             category_id TEXT NOT NULL,
             article_url TEXT NOT NULL,
             window_index INTEGER NOT NULL DEFAULT 0,
             text TEXT NOT NULL,
             model_name TEXT,
             model_dimensions INTEGER,
             created_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL,
             UNIQUE (category_id, article_url, window_index)
         );
         INSERT INTO category_exemplars
             (id, category_id, article_url, window_index, text, model_name, model_dimensions, created_at, updated_at)
         SELECT id, category_id, article_url, 0, text, model_name, model_dimensions, created_at, updated_at
         FROM category_exemplars_legacy;
         DROP TABLE category_exemplars_legacy;
         CREATE INDEX IF NOT EXISTS idx_category_exemplars_category_id
             ON category_exemplars(category_id);",
    )
    .map_err(|error| error.to_string())
}

/// Drops a `profile_category` table in the legacy shape (it carried an FK to
/// `web_profiles`, which would reject domain ids) so the current shape can be
/// created in its place. No data migration: links are cheap to re-assign and
/// the legacy table has been emptied by a full drop on every startup until now.
fn migrate_profile_category_shape(conn: &Connection) -> Result<(), String> {
    let has_legacy: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM pragma_foreign_key_list('profile_category')
             WHERE \"table\" = 'web_profiles'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if has_legacy {
        conn.execute("DROP TABLE profile_category", [])
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn migrate_rename_profiles_to_domains(conn: &Connection) -> Result<(), String> {
    let has_old_profiles: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='web_profiles'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    let has_domains: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='web_domains'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if has_old_profiles && !has_domains {
        conn.execute_batch("ALTER TABLE web_profiles RENAME TO web_domains")
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn migrate_article_domain_column(conn: &Connection) -> Result<(), String> {
    let has_domain_column: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('web_articles') WHERE name='domain'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !has_domain_column {
        conn.execute_batch(
            "ALTER TABLE web_articles ADD COLUMN domain TEXT REFERENCES web_domains(id)",
        )
        .map_err(|error| error.to_string())?;
    }

    let urls: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT url FROM web_articles WHERE domain IS NULL")
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        let mut out = Vec::new();
        for result in rows {
            out.push(result.map_err(|error| error.to_string())?);
        }
        out
    };

    for url in urls {
        if let Some(domain) = domain_from_url(&url) {
            ensure_web_domain(conn, &domain)?;
            conn.execute(
                "UPDATE web_articles SET domain = ?1 WHERE url = ?2 COLLATE NOCASE",
                params![domain, url],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_web_articles_domain ON web_articles(domain)",
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn migrate_article_ids_to_youtube_v(conn: &Connection) -> Result<(), String> {
    let urls: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT url FROM web_articles WHERE id != url")
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        let mut out = Vec::new();
        for result in rows {
            out.push(result.map_err(|error| error.to_string())?);
        }
        out
    };

    for url in urls {
        let new_id = article_id_for_url(&url);
        if new_id == url {
            continue;
        }

        let id_taken: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM web_articles WHERE id = ?1 AND url != ?2 COLLATE NOCASE",
                params![new_id, url],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !id_taken {
            conn.execute(
                "UPDATE web_articles SET id = ?1 WHERE url = ?2 COLLATE NOCASE AND id = ?3",
                params![new_id, url, url],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn migrate_channels_to_web_profiles(conn: &Connection) -> Result<(), String> {
    let rows: Vec<(String, String, Option<String>)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, url FROM web_domains
                 WHERE id LIKE '@%' OR url LIKE '%/api/profile/youtube/%'",
            )
            .map_err(|error| error.to_string())?;
        let row_iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?;
        let mut out = Vec::new();
        for result in row_iter {
            out.push(result.map_err(|error| error.to_string())?);
        }
        out
    };

    if rows.is_empty() {
        return Ok(());
    }

    let domain_id = "youtube.com".to_string();
    ensure_web_domain(conn, &domain_id)?;

    for (id, _name, url) in rows {
        let is_channel = id.trim_start().starts_with('@')
            || url
                .as_deref()
                .map_or(false, |u| u.contains("/api/profile/youtube/"));

        if is_channel {
            conn.execute(
                "INSERT OR IGNORE INTO web_profiles (id, name, domain_id, count, profile_picture, url, updated_at)
                 SELECT id, name, ?1, count, profile_picture, url, updated_at FROM web_domains WHERE id = ?2",
                params![domain_id, id],
            )
            .map_err(|error| error.to_string())?;

            conn.execute("DELETE FROM web_domains WHERE id = ?1", params![id])
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn migrate_strip_www_domains(conn: &Connection) -> Result<(), String> {
    let www_ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM web_domains WHERE id LIKE 'www.%' COLLATE NOCASE")
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        let mut out = Vec::new();
        for result in rows {
            out.push(result.map_err(|error| error.to_string())?);
        }
        out
    };

    for www_id in www_ids {
        let target = strip_www_prefix(&www_id);
        let target_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM web_domains WHERE id = ?1 COLLATE NOCASE",
                params![target],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !target_exists {
            conn.execute(
                "INSERT INTO web_domains (id, name, count, profile_picture, url, updated_at)
                 SELECT ?1, ?1, count, profile_picture, url, updated_at
                 FROM web_domains WHERE id = ?2 COLLATE NOCASE",
                params![target, www_id],
            )
            .map_err(|error| error.to_string())?;
        } else {
            conn.execute(
                "UPDATE web_domains SET profile_picture = (
                     SELECT profile_picture FROM web_domains WHERE id = ?2 COLLATE NOCASE
                 )
                 WHERE id = ?1 COLLATE NOCASE
                   AND profile_picture IS NULL
                   AND (SELECT profile_picture FROM web_domains WHERE id = ?2 COLLATE NOCASE) IS NOT NULL",
                params![target, www_id],
            )
            .map_err(|error| error.to_string())?;
        }

        conn.execute(
            "UPDATE web_articles SET domain = ?1 WHERE domain = ?2 COLLATE NOCASE",
            params![target, www_id],
        )
        .map_err(|error| error.to_string())?;

        conn.execute(
            "UPDATE web_profiles SET domain_id = ?1 WHERE domain_id = ?2 COLLATE NOCASE",
            params![target, www_id],
        )
        .map_err(|error| error.to_string())?;

        conn.execute(
            "DELETE FROM web_domains WHERE id = ?1 COLLATE NOCASE",
            params![www_id],
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

/// Removes the synthetic `__unknown_profile__` bucket that older builds wrote
/// into `web_domains` for articles with a NULL domain. It is never a real
/// domain: it has no articles pointing at it, and clicking it in the UI opened
/// an empty list. The reference guards keep this safe with foreign keys enabled.
fn migrate_remove_unknown_profile_domain(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM web_domains
         WHERE id = ?1
           AND NOT EXISTS (SELECT 1 FROM web_articles WHERE LOWER(domain) = LOWER(?1))
           AND NOT EXISTS (SELECT 1 FROM web_profiles WHERE LOWER(domain_id) = LOWER(?1))",
        params![WEB_STORE_UNKNOWN_PROFILE_ID],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn migrate_legacy_tables(conn: &Connection) -> Result<(), String> {
    let has_old_articles: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='articles'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !has_old_articles {
        return Ok(());
    }

    conn.execute_batch(
        "ALTER TABLE articles RENAME TO old_articles;
         ALTER TABLE profiles RENAME TO old_profiles;",
    )
    .map_err(|error| error.to_string())?;

    conn.execute_batch(
        "INSERT OR IGNORE INTO web_articles (id, url, created_at, title, thumbnail, content, 
                media_directory, main_color, profile, embedding_source_text, updated_at)
         SELECT id, url, created_at, title, thumbnail, content, 
                media_directory, main_color, profile, embedding_source_text, updated_at
         FROM old_articles;",
    )
    .map_err(|error| error.to_string())?;

    conn.execute_batch(
        "INSERT OR IGNORE INTO web_domains (id, name, count, profile_picture, updated_at)
         SELECT id, name, count, profile_picture, updated_at
         FROM old_profiles;",
    )
    .map_err(|error| error.to_string())?;

    conn.execute_batch(
        "DROP TABLE old_articles;
         DROP TABLE old_profiles;",
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info(?1) WHERE name = ?2",
        params![table, column],
        |row| row.get(0),
    )
    .unwrap_or(false)
}

fn ensure_column(conn: &Connection, table: &str, column: &str, ddl: &str) -> Result<(), String> {
    if !table_has_column(conn, table, column) {
        conn.execute_batch(ddl).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn migrate_drop_last_video_date_column(conn: &Connection) -> Result<(), String> {
    if table_has_column(conn, "web_domains", "last_video_date") {
        conn.execute_batch("ALTER TABLE web_domains DROP COLUMN last_video_date")
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn chrono_like_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn strip_www_prefix(host: &str) -> String {
    let lower = host.to_lowercase();
    lower
        .strip_prefix("www.")
        .map(ToOwned::to_owned)
        .unwrap_or(lower)
}

fn domain_from_url(url: &str) -> Option<String> {
    reqwest::Url::parse(url.trim())
        .ok()?
        .host_str()
        .map(strip_www_prefix)
}

fn article_id_for_url(url: &str) -> String {
    let trimmed = url.trim();
    if let Ok(parsed) = reqwest::Url::parse(trimmed) {
        if let Some(host) = parsed.host_str() {
            let host = host.to_lowercase();
            let is_youtube = host.ends_with("youtube.com") || host.ends_with("youtu.be");
            if is_youtube {
                if let Some(v) = parsed
                    .query_pairs()
                    .find(|(key, _)| key == "v")
                    .map(|(_, value)| value.into_owned())
                {
                    if !v.is_empty() {
                        return v;
                    }
                }
                if host.ends_with("youtu.be") {
                    if let Some(segment) = parsed.path_segments().and_then(|mut s| s.next()) {
                        if !segment.is_empty() && segment != "watch" {
                            return segment.to_string();
                        }
                    }
                }
            }
        }
    }
    trimmed.to_string()
}

fn favicon_url_for_domain(domain: &str) -> String {
    format!("https://www.google.com/s2/favicons?sz=64&domain={}", domain)
}

fn ensure_web_domain(conn: &Connection, domain: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO web_domains (id, name, count, profile_picture, url, updated_at)
         VALUES (?1, ?1, 0, ?2, NULL, ?3)",
        params![domain, favicon_url_for_domain(domain), chrono_like_now()],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn normalize_profile_bucket(profile: Option<&str>) -> (String, String) {
    let normalized = profile
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    match normalized {
        Some(value) => (value.clone(), value),
        None => (
            WEB_STORE_UNKNOWN_PROFILE_ID.to_string(),
            WEB_STORE_UNKNOWN_PROFILE_LABEL.to_string(),
        ),
    }
}

fn filter_record_to_json(record: &WebStoreArticleRecord, fields: &Option<Vec<String>>) -> Value {
    match fields {
        None => serde_json::to_value(record).unwrap_or(Value::Null),
        Some(field_list) => {
            let mut obj = serde_json::Map::new();
            let all_fields = serde_json::to_value(record)
                .and_then(|v| Ok(v.as_object().unwrap().clone()))
                .unwrap_or_default();

            for field in field_list {
                if let Some(value) = all_fields.get(field) {
                    obj.insert(field.clone(), value.clone());
                }
            }
            Value::Object(obj)
        }
    }
}

fn aggregate_domains(records: Vec<WebStoreArticleRecord>) -> Vec<WebStoreDomainRecord> {
    let mut aggregated = HashMap::<String, WebStoreDomainRecord>::new();

    for record in records {
        // Articles without a parseable domain (e.g. raw-text pastes saved as
        // `raw-<timestamp>`) have no domain to group under, so they are simply
        // not part of the domains list.
        let Some(domain) = record
            .domain
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let id = domain.to_lowercase();
        aggregated
            .entry(id.clone())
            .and_modify(|domain| {
                domain.count += 1;
            })
            .or_insert(WebStoreDomainRecord {
                name: id.clone(),
                id,
                count: 1,
                profile_picture: None,
                url: None,
                most_recent_created_at: None,
                articles: None,
            });
    }

    let mut domains = aggregated.into_values().collect::<Vec<_>>();
    domains.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.name.cmp(&right.name))
    });
    domains
}

fn sort_articles_by_created_at_desc(records: &mut [WebStoreArticleRecord]) {
    records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
}

fn row_to_stored_article(
    row: &rusqlite::Row<'_>,
) -> Result<WebStoreArticleRecord, rusqlite::Error> {
    // Map by column name, not index: list queries select a trimmed column set
    // (see ARTICLE_LIST_COLUMNS), so a positional mapping breaks the moment a
    // column is dropped. The two body columns only exist on the detail shape,
    // so they resolve through a fallback that treats a missing column as NULL.
    let id: String = row.get("id")?;
    let url: String = row.get("url")?;
    let created_at: i64 = row.get("created_at")?;
    let title: Option<String> = row.get("title")?;
    let thumbnail: Option<String> = row.get("thumbnail")?;
    let media_directory: Option<String> = row.get("media_directory")?;
    let main_color: Option<String> = row.get("main_color")?;
    let profile: Option<String> = row.get("profile")?;
    let updated_at: i64 = row.get("updated_at")?;
    let viewed_int: i64 = row.get("viewed")?;
    let date: Option<String> = row.get("date")?;
    let domain: Option<String> = row.get("domain")?;
    let profile_picture: Option<String> = row.get("profile_picture")?;
    let mode: Option<String> = row.get("mode").ok().flatten();
    let summary: Option<String> = body_column_or_none(row, "summary");
    let analysis_divisor: Option<i64> = row
        .get::<_, Option<i64>>("analysis_divisor")
        .unwrap_or(None);
    let content: Option<String> = body_column_or_none(row, "content");
    let embedding_source_text: Option<String> = body_column_or_none(row, "embedding_source_text");

    Ok(WebStoreArticleRecord {
        id,
        url: Some(url),
        created_at,
        title,
        thumbnail,
        content,
        media_directory: media_directory.clone(),
        directory: media_directory,
        main_color: main_color.clone(),
        profile,
        domain,
        primary_color: main_color,
        updated_at,
        embedding_source_text,
        viewed: viewed_int != 0,
        date,
        profile_picture,
        summary,
        analysis_divisor,
        mode,
    })
}

/// Body columns disappear from the list column set, so a missing column maps
/// to NULL instead of failing the row.
fn body_column_or_none(row: &rusqlite::Row<'_>, name: &str) -> Option<String> {
    row.get::<_, Option<String>>(name).unwrap_or(None)
}

const ARTICLE_COLUMNS: &str = "a.id, a.url, a.created_at, a.title, a.thumbnail, a.content,
        a.media_directory, a.main_color, a.profile, a.embedding_source_text, a.updated_at,
        a.viewed, a.date, a.domain,
        (SELECT COALESCE(
            (SELECT p.profile_picture FROM web_profiles p WHERE LOWER(p.id) = LOWER(a.profile)),
            (SELECT d.profile_picture FROM web_domains d WHERE LOWER(d.id) = LOWER(a.domain))
        )) AS profile_picture, a.summary, a.analysis_divisor, a.mode";

/// Columns for list/card queries: cards only render title + thumbnail, and the
/// body shown inside an article comes from its raw content file, not from the
/// `content` column. The full set above stays reserved for the article-detail
/// path. `mode` is kept here because the "imported articles" filter runs on
/// the list query.
const ARTICLE_LIST_COLUMNS: &str = "a.id, a.url, a.created_at, a.title, a.thumbnail,
        a.media_directory, a.main_color, a.profile, a.updated_at,
        a.viewed, a.date, a.domain,
        (SELECT COALESCE(
            (SELECT p.profile_picture FROM web_profiles p WHERE LOWER(p.id) = LOWER(a.profile)),
            (SELECT d.profile_picture FROM web_domains d WHERE LOWER(d.id) = LOWER(a.domain))
        )) AS profile_picture, a.mode";

fn query_articles_sql(
    conn: &Connection,
    columns: &str,
    body: &str,
    params: &[Box<dyn rusqlite::types::ToSql>],
) -> Result<Vec<WebStoreArticleRecord>, String> {
    let sql = format!("SELECT {} FROM web_articles a {}", columns, body);
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let article_iter = stmt
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|param| param.as_ref())),
            row_to_stored_article,
        )
        .map_err(|error| error.to_string())?;

    let mut records = Vec::new();
    for article_result in article_iter {
        records.push(article_result.map_err(|error| error.to_string())?);
    }

    Ok(records)
}

fn query_articles(
    conn: &Connection,
    columns: &str,
    filter: Option<&str>,
    limit: Option<usize>,
    sort: Option<&str>,
) -> Result<Vec<WebStoreArticleRecord>, String> {
    let mut body = String::new();

    if let Some(f) = filter {
        body.push_str(" WHERE ");
        body.push_str(f);
    }

    match sort {
        Some("date") => body.push_str(" ORDER BY a.date IS NULL, a.date DESC"),
        _ => body.push_str(" ORDER BY a.created_at DESC"),
    }

    if let Some(lim) = limit {
        body.push_str(&format!(" LIMIT {}", lim));
    }

    query_articles_sql(conn, columns, &body, &[])
}

/// Ordering for article lists. Profile-scoped listings follow the channel-page
/// order captured by the scraper (`profile_rank`); ranked articles come first
/// and unranked ones fall back to insertion time.
fn article_order_clause(profile_listing: bool) -> &'static str {
    if profile_listing {
        " ORDER BY a.profile_rank IS NULL, a.profile_rank ASC, a.created_at DESC, a.date DESC NULLS LAST"
    } else {
        " ORDER BY a.created_at DESC, a.date DESC NULLS LAST"
    }
}

fn query_domain_by_id(
    conn: &Connection,
    domain_id: &str,
) -> Result<Option<WebStoreDomainRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, count, profile_picture, url,
                    (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.domain) = LOWER(web_domains.id)) AS max_created_at
             FROM web_domains WHERE id = ?1 COLLATE NOCASE",
        )
        .map_err(|error| error.to_string())?;

    let mut rows = stmt
        .query_map([domain_id], |row| {
            Ok(WebStoreDomainRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
                profile_picture: row.get(3)?,
                url: row.get(4)?,
                most_recent_created_at: row.get(5)?,
                articles: None,
            })
        })
        .map_err(|error| error.to_string())?;

    match rows.next() {
        Some(result) => Ok(Some(result.map_err(|error| error.to_string())?)),
        None => Ok(None),
    }
}

fn query_domains(conn: &Connection) -> Result<Vec<WebStoreDomainRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, count, profile_picture, url,
                    (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.domain) = LOWER(web_domains.id)) AS max_created_at
             FROM web_domains ORDER BY count DESC, name ASC",
        )
        .map_err(|error| error.to_string())?;

    let domain_iter = stmt
        .query_map([], |row| {
            Ok(WebStoreDomainRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
                profile_picture: row.get(3)?,
                url: row.get(4)?,
                most_recent_created_at: row.get(5)?,
                articles: None,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut domains = Vec::new();
    for domain_result in domain_iter {
        domains.push(domain_result.map_err(|error| error.to_string())?);
    }

    Ok(domains)
}

fn query_profile_by_id(
    conn: &Connection,
    profile_id: &str,
) -> Result<Option<WebStoreProfileRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, domain_id, count, profile_picture, url,
                    (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.profile) = LOWER(web_profiles.id)) AS max_created_at
             FROM web_profiles WHERE id = ?1 COLLATE NOCASE",
        )
        .map_err(|error| error.to_string())?;

    let mut rows = stmt
        .query_map([profile_id], |row| {
            Ok(WebStoreProfileRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                domain_id: row.get(2)?,
                count: row.get(3)?,
                profile_picture: row.get(4)?,
                url: row.get(5)?,
                most_recent_created_at: row.get(6)?,
                articles: None,
            })
        })
        .map_err(|error| error.to_string())?;

    match rows.next() {
        Some(result) => Ok(Some(result.map_err(|error| error.to_string())?)),
        None => Ok(None),
    }
}

fn upsert_domain(conn: &Connection, domain: &WebStoreDomainRecord) -> Result<(), String> {
    let updated_at = chrono_like_now();
    conn.execute(
        "INSERT INTO web_domains (id, name, count, profile_picture, url, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET 
           name = excluded.name,
           count = excluded.count,
           profile_picture = excluded.profile_picture,
           url = excluded.url,
           updated_at = excluded.updated_at",
        params![
            domain.id,
            domain.name,
            domain.count,
            domain.profile_picture,
            domain.url,
            updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn upsert_profile(conn: &Connection, profile: &WebStoreProfileRecord) -> Result<(), String> {
    ensure_web_domain(conn, &profile.domain_id)?;

    let updated_at = chrono_like_now();
    conn.execute(
        "INSERT INTO web_profiles (id, name, domain_id, count, profile_picture, url, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET 
           name = excluded.name,
           domain_id = excluded.domain_id,
           count = excluded.count,
           profile_picture = excluded.profile_picture,
           url = excluded.url,
           updated_at = excluded.updated_at",
        params![
            profile.id,
            profile.name,
            profile.domain_id,
            profile.count,
            profile.profile_picture,
            profile.url,
            updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn delete_domain(conn: &Connection, domain_id: &str) -> Result<(), String> {
    // The domain's own links plus those of its channels, which go away with it.
    // profile_category keys are stored lowercase, so match them case-insensitively.
    conn.execute(
        "DELETE FROM profile_category
         WHERE profile_id = ?1 COLLATE NOCASE
            OR LOWER(profile_id) IN (SELECT LOWER(id) FROM web_profiles WHERE domain_id = ?1)",
        params![domain_id],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        "DELETE FROM web_profiles WHERE domain_id = ?1",
        params![domain_id],
    )
    .map_err(|error| error.to_string())?;

    conn.execute("DELETE FROM web_domains WHERE id = ?1", params![domain_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn delete_profile(conn: &Connection, profile_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM profile_category WHERE profile_id = ?1 COLLATE NOCASE",
        params![profile_id],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        "DELETE FROM web_profiles WHERE id = ?1",
        params![profile_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn rebuild_domains_from_articles(
    conn: &Connection,
    profile_picture_input: Option<(String, String)>,
) -> Result<(), String> {
    let existing_domains = query_domains(conn)?;
    let existing_pictures: HashMap<String, Option<String>> = existing_domains
        .into_iter()
        .map(|d| (d.id, d.profile_picture))
        .collect();

    let all_articles = query_articles(conn, ARTICLE_COLUMNS, None, None, None)?;
    let mut aggregated = aggregate_domains(all_articles);

    for domain in &mut aggregated {
        if domain.profile_picture.is_none() {
            if let Some(existing_picture) = existing_pictures.get(&domain.id) {
                domain.profile_picture = existing_picture.clone();
            }
        }
    }

    if let Some((domain_id, picture)) = profile_picture_input {
        if let Some(domain) = aggregated.iter_mut().find(|d| d.id == domain_id) {
            domain.profile_picture = Some(picture);
        } else {
            aggregated.push(WebStoreDomainRecord {
                id: domain_id,
                name: String::new(),
                count: 0,
                profile_picture: Some(picture),
                url: None,
                most_recent_created_at: None,
                articles: None,
            });
        }
    }

    for domain in &aggregated {
        upsert_domain(conn, domain)?;
    }

    migrate_remove_unknown_profile_domain(conn)?;

    Ok(())
}

#[tauri::command]
pub async fn list_web_store_articles(
    app: AppHandle,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let conn = get_db(&app)?;
    let records = query_articles(&conn, ARTICLE_LIST_COLUMNS, None, None, None)?;
    Ok(records
        .iter()
        .map(|record| filter_record_to_json(record, &fields))
        .collect())
}

/// WHERE fragment restricting entities to those linked to any of `category_ids`.
///
/// Filtering reads the stored `profile_category` links (never the categories of
/// the entity's articles): a link is what the profile page writes, so it is the
/// only way to tag a domain or channel that has no (or unrelated) articles.
fn category_link_clause(alias: &str, category_ids: &[String]) -> (String, Vec<String>) {
    let placeholders = category_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");

    (
        format!(
            "LOWER({alias}.id) IN (
                SELECT DISTINCT LOWER(pc.profile_id)
                FROM profile_category pc
                INNER JOIN web_categories c ON pc.category_id = c.id
                WHERE pc.category_id IN ({placeholders}) AND c.deleted_at IS NULL
            )"
        ),
        category_ids.to_vec(),
    )
}

fn query_domains_filtered(
    conn: &Connection,
    category_ids: Option<&[String]>,
    created_at_from: Option<i64>,
    include_articles: bool,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<WebStoreDomainRecord>, String> {
    let mut sql = String::from(
        "SELECT p.id, p.name, p.count, p.profile_picture, p.url,
                (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.domain) = LOWER(p.id)) AS max_created_at
         FROM web_domains p",
    );

    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(cats) = category_ids {
        if !cats.is_empty() {
            let (clause, values) = category_link_clause("p", cats);
            where_clauses.push(clause);
            for value in values {
                params.push(Box::new(value));
            }
        }
    }

    if let Some(from) = created_at_from {
        where_clauses.push(
            "(SELECT MAX(a3.created_at) FROM web_articles a3 WHERE LOWER(a3.domain) = LOWER(p.id)) >= ?"
                .to_string(),
        );
        params.push(Box::new(from));
    }

    if !where_clauses.is_empty() {
        sql.push_str(&format!(" WHERE {}", where_clauses.join(" AND ")));
    }

    sql.push_str(if include_articles {
        " ORDER BY max_created_at DESC NULLS LAST"
    } else {
        " ORDER BY p.count DESC, p.name ASC"
    });

    if include_articles {
        sql.push_str(&format!(
            " LIMIT {} OFFSET {}",
            limit.unwrap_or(50),
            offset.unwrap_or(0)
        ));
    } else if limit.is_some() || offset.is_some() {
        sql.push_str(&format!(
            " LIMIT {} OFFSET {}",
            limit.unwrap_or(usize::MAX),
            offset.unwrap_or(0)
        ));
    }

    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let domain_rows = stmt
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            |row| {
                Ok(WebStoreDomainRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    count: row.get(2)?,
                    profile_picture: row.get(3)?,
                    url: row.get(4)?,
                    most_recent_created_at: row.get(5)?,
                    articles: None,
                })
            },
        )
        .map_err(|error| error.to_string())?;

    let mut domains = Vec::new();
    for domain_result in domain_rows {
        domains.push(domain_result.map_err(|error| error.to_string())?);
    }

    Ok(domains)
}

#[tauri::command]
pub async fn list_web_store_domains(
    app: AppHandle,
    category_ids: Option<Vec<String>>,
    created_at_from: Option<i64>,
    include_articles: Option<bool>,
    article_count: Option<usize>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<WebStoreDomainRecord>, String> {
    let conn = get_db(&app)?;

    let include = include_articles.unwrap_or(false);
    let mut domains = query_domains_filtered(
        &conn,
        category_ids.as_deref(),
        created_at_from,
        include,
        offset,
        limit,
    )?;

    if domains.is_empty() && !include {
        let aggregated =
            aggregate_domains(query_articles(&conn, ARTICLE_COLUMNS, None, None, None)?);
        for domain in &aggregated {
            upsert_domain(&conn, domain)?;
        }
        domains = query_domains_filtered(
            &conn,
            category_ids.as_deref(),
            created_at_from,
            include,
            offset,
            limit,
        )?;
    }

    if include {
        let per_domain_count = article_count.unwrap_or(10);
        for domain in &mut domains {
            domain.articles = Some(query_articles_for_domain(
                &conn,
                &domain.id,
                per_domain_count,
            )?);
        }
    }

    Ok(domains)
}

#[tauri::command]
pub async fn get_web_store_domain(
    app: AppHandle,
    domain_id: String,
) -> Result<Option<WebStoreDomainRecord>, String> {
    let conn = get_db(&app)?;
    query_domain_by_id(&conn, &domain_id)
}

fn query_profiles_filtered(
    conn: &Connection,
    domain_id: Option<&str>,
    category_ids: Option<&[String]>,
    include_articles: bool,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<WebStoreProfileRecord>, String> {
    let mut sql = String::from(
        "SELECT p.id, p.name, p.domain_id, p.count, p.profile_picture, p.url,
                (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.profile) = LOWER(p.id)) AS max_created_at
         FROM web_profiles p",
    );

    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(d) = domain_id {
        let normalized = d.trim().to_lowercase();
        if !normalized.is_empty() {
            where_clauses.push("LOWER(p.domain_id) = ?".to_string());
            params.push(Box::new(normalized));
        }
    }

    if let Some(cats) = category_ids {
        if !cats.is_empty() {
            let (clause, values) = category_link_clause("p", cats);
            where_clauses.push(clause);
            for value in values {
                params.push(Box::new(value));
            }
        }
    }

    if !where_clauses.is_empty() {
        sql.push_str(&format!(" WHERE {}", where_clauses.join(" AND ")));
    }

    sql.push_str(if include_articles {
        " ORDER BY max_created_at DESC NULLS LAST"
    } else {
        " ORDER BY p.count DESC, p.name ASC"
    });

    if include_articles {
        sql.push_str(&format!(
            " LIMIT {} OFFSET {}",
            limit.unwrap_or(50),
            offset.unwrap_or(0)
        ));
    } else if limit.is_some() || offset.is_some() {
        sql.push_str(&format!(
            " LIMIT {} OFFSET {}",
            limit.unwrap_or(usize::MAX),
            offset.unwrap_or(0)
        ));
    }

    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let profile_rows = stmt
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            |row| {
                Ok(WebStoreProfileRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    domain_id: row.get(2)?,
                    count: row.get(3)?,
                    profile_picture: row.get(4)?,
                    url: row.get(5)?,
                    most_recent_created_at: row.get(6)?,
                    articles: None,
                })
            },
        )
        .map_err(|error| error.to_string())?;

    let mut profiles = Vec::new();
    for profile_result in profile_rows {
        profiles.push(profile_result.map_err(|error| error.to_string())?);
    }

    Ok(profiles)
}

#[tauri::command]
pub async fn list_web_store_profiles(
    app: AppHandle,
    domain_id: Option<String>,
    category_ids: Option<Vec<String>>,
    include_articles: Option<bool>,
    article_count: Option<usize>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<WebStoreProfileRecord>, String> {
    let conn = get_db(&app)?;

    let include = include_articles.unwrap_or(false);
    let mut profiles = query_profiles_filtered(
        &conn,
        domain_id.as_deref(),
        category_ids.as_deref(),
        include,
        offset,
        limit,
    )?;

    if include {
        let per_profile_count = article_count.unwrap_or(10);
        for profile in &mut profiles {
            profile.articles = Some(query_articles_for_profile(
                &conn,
                &profile.id,
                per_profile_count,
            )?);
        }
    }

    Ok(profiles)
}

#[tauri::command]
pub async fn get_web_store_profile(
    app: AppHandle,
    profile_id: String,
) -> Result<Option<WebStoreProfileRecord>, String> {
    let conn = get_db(&app)?;
    query_profile_by_id(&conn, &profile_id)
}

async fn list_web_store_articles_by_column(
    app: AppHandle,
    column: &str,
    bucket_id: String,
    date_from: Option<String>,
    limit: Option<usize>,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let conn = get_db(&app)?;

    let normalized_bucket_id = bucket_id.trim().to_lowercase();

    let filter = if normalized_bucket_id.is_empty()
        || normalized_bucket_id == WEB_STORE_UNKNOWN_PROFILE_ID
    {
        None
    } else {
        Some(format!(
            "LOWER({}) = '{}'",
            column,
            normalized_bucket_id.replace('\'', "''")
        ))
    };

    let records = if let Some(ref from) = date_from {
        let base_filter = format!("date >= '{}'", from.replace('\'', "''"));
        let combined_filter = match filter {
            Some(f) => format!("{} AND {}", base_filter, f),
            None => base_filter,
        };
        query_articles(
            &conn,
            ARTICLE_LIST_COLUMNS,
            Some(&combined_filter),
            limit,
            Some("date"),
        )?
    } else {
        query_articles(
            &conn,
            ARTICLE_LIST_COLUMNS,
            filter.as_deref(),
            limit,
            Some("date"),
        )?
    };

    let filtered_records = if normalized_bucket_id.is_empty()
        || normalized_bucket_id == WEB_STORE_UNKNOWN_PROFILE_ID
    {
        records
            .into_iter()
            .filter(|record| {
                let bucket_value = if column == "domain" {
                    record.domain.as_deref()
                } else {
                    record.profile.as_deref()
                };
                let (raw_id, _) = normalize_profile_bucket(bucket_value);
                raw_id.to_lowercase() == WEB_STORE_UNKNOWN_PROFILE_ID
            })
            .collect()
    } else {
        records
    };

    Ok(filtered_records
        .iter()
        .map(|record| filter_record_to_json(record, &fields))
        .collect())
}

async fn list_web_store_articles_by_profile(
    app: AppHandle,
    profile_id: String,
    date_from: Option<String>,
    limit: Option<usize>,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    list_web_store_articles_by_column(app, "profile", profile_id, date_from, limit, fields).await
}

async fn list_web_store_articles_by_domain(
    app: AppHandle,
    domain_id: String,
    date_from: Option<String>,
    limit: Option<usize>,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    list_web_store_articles_by_column(app, "domain", domain_id, date_from, limit, fields).await
}

#[tauri::command]
pub async fn get_web_store_article_by_url(
    app: AppHandle,
    url: String,
) -> Result<Option<WebStoreArticleRecord>, String> {
    let conn = get_db(&app)?;
    let filter = format!("url = '{}' COLLATE NOCASE", url.replace('\'', "''"));
    let mut records = query_articles(&conn, ARTICLE_COLUMNS, Some(&filter), Some(1), None)?;
    Ok(records.pop())
}

#[tauri::command]
pub async fn filter_existing_article_urls(
    app: AppHandle,
    urls: Vec<String>,
) -> Result<Vec<String>, String> {
    if urls.is_empty() {
        return Ok(vec![]);
    }
    let conn = get_db(&app)?;

    let mut existing = Vec::new();
    for chunk in urls.chunks(900) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "SELECT url FROM web_articles WHERE url IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(chunk.iter()), |row| {
                row.get::<_, String>(0)
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            existing.push(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(existing)
}

#[tauri::command]
pub async fn upsert_web_store_article(
    app: AppHandle,
    input: UpsertWebStoreArticleInput,
) -> Result<(), String> {
    let conn = get_db(&app)?;
    upsert_web_store_article_row(&conn, input)
}

/// Upserts one article row.
///
/// The identity of the row is the article id, not the url text: a YouTube
/// video captured under another form of the same url (tracking params,
/// `youtu.be`, ...) must be updated, never re-inserted.
fn upsert_web_store_article_row(
    conn: &Connection,
    mut input: UpsertWebStoreArticleInput,
) -> Result<(), String> {
    input.title = normalize_optional_string(input.title);
    input.thumbnail = normalize_optional_string(input.thumbnail);
    input.content = normalize_optional_string(input.content);
    input.directory = normalize_optional_string(input.directory);
    input.main_color = normalize_optional_string(input.main_color);
    input.profile = normalize_optional_string(input.profile).map(|p| p.to_lowercase());
    input.embedding_source_text = normalize_optional_string(input.embedding_source_text);
    input.date = normalize_optional_string(input.date);
    input.mode = normalize_optional_string(input.mode);

    let now = chrono_like_now();
    let article_id = article_id_for_url(&input.url);
    let domain = domain_from_url(&input.url);
    if let Some(ref d) = domain {
        ensure_web_domain(conn, d).map_err(|error| {
            format!(
                "Failed to ensure domain '{}' for article url='{}': {}",
                d, input.url, error
            )
        })?;
    }

    let filter = format!("url = '{}' COLLATE NOCASE", input.url.replace('\'', "''"));
    let mut records =
        query_articles(conn, ARTICLE_COLUMNS, Some(&filter), Some(1), None).map_err(|error| {
            format!(
                "Failed to query existing article for url='{}': {}",
                input.url, error
            )
        })?;
    let previous_article = records.pop();

    if previous_article.is_some() {
        conn.execute(
            "UPDATE web_articles SET
                title = ?1, thumbnail = ?2, content = ?3, media_directory = ?4,
                main_color = ?5, profile = ?6, domain = ?7,
                embedding_source_text = ?8, date = ?9, mode = COALESCE(?10, mode), updated_at = ?11
             WHERE url = ?12 COLLATE NOCASE",
            params![
                input.title,
                input.thumbnail,
                input.content,
                input.directory,
                input.main_color,
                input.profile,
                domain,
                input.embedding_source_text,
                input.date,
                input.mode,
                now,
                input.url
            ],
        )
        .map_err(|error| {
            format!(
                "Failed to UPDATE article url='{}' domain='{}' profile='{}': {}",
                input.url,
                domain.as_deref().unwrap_or("NULL"),
                input.profile.as_deref().unwrap_or("NULL"),
                error
            )
        })?;
        return Ok(());
    }

    // The url is stored under another form of the same article: the id is the
    // stable identity, so that row is updated in place and its url is
    // rewritten to the canonical form every later lookup uses.
    let stored_url: Option<String> = conn
        .query_row(
            "SELECT url FROM web_articles WHERE id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| {
            format!(
                "Failed to query article by id='{}' url='{}': {}",
                article_id, input.url, error
            )
        })?;

    if let Some(stored_url) = stored_url {
        conn.execute(
            "UPDATE web_articles SET
                url = ?1, title = ?2, thumbnail = ?3, content = ?4, media_directory = ?5,
                main_color = ?6, profile = ?7, domain = ?8,
                embedding_source_text = ?9, date = ?10, mode = COALESCE(?11, mode), updated_at = ?12
             WHERE id = ?13",
            params![
                input.url,
                input.title,
                input.thumbnail,
                input.content,
                input.directory,
                input.main_color,
                input.profile,
                domain,
                input.embedding_source_text,
                input.date,
                input.mode,
                now,
                article_id
            ],
        )
        .map_err(|error| {
            format!(
                "Failed to UPDATE article by id='{}' stored-url='{}' url='{}': {}",
                article_id, stored_url, input.url, error
            )
        })?;
        return Ok(());
    }

    conn.execute(
        "INSERT INTO web_articles (id, url, domain, created_at, title, thumbnail, content,
                               media_directory, main_color, profile,
                               embedding_source_text, date, mode, updated_at, viewed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0)",
        params![
            article_id,
            input.url,
            domain,
            now,
            input.title,
            input.thumbnail,
            input.content,
            input.directory,
            input.main_color,
            input.profile,
            input.embedding_source_text,
            input.date,
            input.mode,
            now
        ],
    )
    .map_err(|error| {
        format!(
            "Failed to INSERT article url='{}' domain='{}' profile='{}': {}",
            input.url,
            domain.as_deref().unwrap_or("NULL"),
            input.profile.as_deref().unwrap_or("NULL"),
            error
        )
    })?;

    Ok(())
}

/// Batch article deletion (IPC-6): one transaction for every url — task rows,
/// article rows, one `rebuild_domains_from_articles` — then embeddings, raw
/// content files and thumbnails cleaned up server-side. Missing urls are
/// tolerated and simply contribute zero to the returned count.
#[tauri::command]
pub async fn delete_web_store_articles_by_urls(
    app: AppHandle,
    urls: Vec<String>,
) -> Result<usize, String> {
    if urls.is_empty() {
        return Ok(0);
    }
    let conn = get_db(&app)?;

    // Thumbnails must be collected before the rows are gone.
    let mut thumbnails: Vec<String> = Vec::new();
    for chunk in urls.chunks(900) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "SELECT thumbnail FROM web_articles WHERE url COLLATE NOCASE IN ({placeholders})"
        );
        let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(chunk.iter()), |row| {
                row.get::<_, Option<String>>(0)
            })
            .map_err(|error| error.to_string())?;
        for row in rows {
            let thumbnail = row.map_err(|error| error.to_string())?;
            if let Some(thumbnail) = thumbnail.filter(|value| !value.is_empty()) {
                if !thumbnails.contains(&thumbnail) {
                    thumbnails.push(thumbnail);
                }
            }
        }
    }

    let deleted_count = delete_bucket_rows(&conn, &urls, &urls)?;

    // Best-effort: rows are already gone; embeddings cleanup must not fail the
    // operation (the client-side flow swallowed these errors too).
    let _ = crate::embedding_store::delete_article_embeddings_batch(&app, &urls).await;

    for url in &urls {
        delete_raw_content_file(&app, url);
    }
    delete_bucket_media(&app, None, &thumbnails)?;

    Ok(deleted_count)
}

#[tauri::command]
pub async fn update_web_store_article_viewed(
    app: AppHandle,
    url: String,
    viewed: bool,
) -> Result<bool, String> {
    let conn = get_db(&app)?;

    let changes = conn
        .execute(
            "UPDATE web_articles SET viewed = ?1 WHERE url = ?2 COLLATE NOCASE",
            params![viewed as i64, url],
        )
        .map_err(|error| error.to_string())?;

    Ok(changes > 0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertWebStoreDomainInput {
    pub id: String,
    pub name: String,
    pub profile_picture: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertWebStoreProfileInput {
    pub id: String,
    pub name: String,
    pub domain_id: String,
    pub profile_picture: Option<String>,
    pub url: Option<String>,
}

#[tauri::command]
pub async fn upsert_web_store_domain(
    app: AppHandle,
    input: UpsertWebStoreDomainInput,
) -> Result<(), String> {
    let conn = get_db(&app)?;

    let domain = WebStoreDomainRecord {
        id: input.id,
        name: input.name,
        count: 0,
        profile_picture: input.profile_picture,
        url: input.url,
        most_recent_created_at: None,
        articles: None,
    };

    upsert_domain(&conn, &domain)?;
    Ok(())
}

#[tauri::command]
pub async fn upsert_web_store_profile(
    app: AppHandle,
    input: UpsertWebStoreProfileInput,
) -> Result<(), String> {
    let conn = get_db(&app)?;

    let profile = WebStoreProfileRecord {
        id: input.id,
        name: input.name,
        domain_id: input.domain_id,
        count: 0,
        profile_picture: input.profile_picture,
        url: input.url,
        most_recent_created_at: None,
        articles: None,
    };

    upsert_profile(&conn, &profile)?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_remote_profile(
    app: AppHandle,
    base_url: String,
    profile_name: String,
) -> Result<RemoteProfile, String> {
    let _ = app;

    let name = profile_name.trim();
    if name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let mut url = reqwest::Url::parse(&base_url)
        .map_err(|error| format!("Invalid base URL {}: {}", base_url, error))?;
    url.path_segments_mut()
        .map_err(|_| "Invalid base URL".to_string())?
        .extend(["api", "profile", "youtube", name]);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {}", error))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Failed to fetch remote profile: {}", error))?;

    if !response.status().is_success() {
        return Err(format!(
            "Remote profile returned status {}",
            response.status()
        ));
    }

    response
        .json::<RemoteProfile>()
        .await
        .map_err(|error| format!("Failed to parse remote profile: {}", error))
}

const THUMBNAILS_DIR: &str = "thumbnails";

/// Removes the bucket media files: one thumbnail per article (filenames are
/// derived from the article URL, so sharing across articles is not expected)
/// plus the bucket's own picture. fs failures are ignored to preserve the
/// client-side behavior this replaces (deleteMediaFile logged and continued).
fn delete_bucket_media(
    app: &AppHandle,
    entity_picture: Option<String>,
    thumbnails: &[String],
) -> Result<(), String> {
    let thumbnails_dir = crate::db_manager::media_dir(app)?.join(THUMBNAILS_DIR);

    for filename in thumbnails.iter().chain(entity_picture.iter()) {
        let path = thumbnails_dir.join(filename);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }

    Ok(())
}

/// Deletes window rows and article rows for a whole bucket in one transaction
/// and rebuilds the domains table exactly once. Returns the number of articles
/// actually deleted (missing urls contribute zero, without failing).
fn delete_bucket_rows(
    conn: &Connection,
    window_urls: &[String],
    article_urls: &[String],
) -> Result<usize, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    for url in window_urls {
        tx.execute(
            "DELETE FROM article_windows WHERE article_url = ?1 COLLATE NOCASE",
            params![url],
        )
        .map_err(|error| error.to_string())?;
    }

    let mut deleted_count = 0;
    for url in article_urls {
        deleted_count += tx
            .execute(
                "DELETE FROM web_articles WHERE url = ?1 COLLATE NOCASE",
                params![url],
            )
            .map_err(|error| error.to_string())?;
    }

    rebuild_domains_from_articles(&tx, None)?;
    tx.commit().map_err(|error| error.to_string())?;

    Ok(deleted_count)
}

async fn delete_articles_for_bucket(
    app: &AppHandle,
    entity_url: Option<String>,
    entity_picture: Option<String>,
    article_values: Vec<Value>,
) -> Result<usize, String> {
    let conn = get_db(app)?;

    let mut article_urls: Vec<String> = Vec::new();
    let mut thumbnails: Vec<String> = Vec::new();
    for article_value in &article_values {
        if let Some(url) = article_value.get("url").and_then(|value| value.as_str()) {
            if !article_urls.iter().any(|existing| existing == url) {
                article_urls.push(url.to_string());
            }
        }
        if let Some(thumbnail) = article_value
            .get("thumbnail")
            .and_then(|value| value.as_str())
        {
            if !thumbnails.iter().any(|existing| existing == thumbnail) {
                thumbnails.push(thumbnail.to_string());
            }
        }
    }

    // Task rows for every article plus the bucket's own url (e.g. the channel
    // url), mirroring what the per-article client loop deleted before.
    let mut task_urls = article_urls.clone();
    if let Some(url) = &entity_url {
        if !task_urls.iter().any(|existing| existing == url) {
            task_urls.push(url.clone());
        }
    }

    // Previously every article went through delete_web_store_tasks_by_url +
    // delete_web_store_article_by_url, each reopening a connection and running
    // rebuild_domains_from_articles (O(N) over all articles) per item.
    let deleted_count = delete_bucket_rows(&conn, &task_urls, &article_urls)?;

    // File cleanup after the commit: raw content per deleted url, then media.
    for url in &task_urls {
        delete_raw_content_file(app, url);
    }
    delete_bucket_media(app, entity_picture, &thumbnails)?;

    Ok(deleted_count)
}

#[tauri::command]
pub async fn delete_web_store_domain(
    app: AppHandle,
    domain_id: String,
) -> Result<WebStoreProfileDeletion, String> {
    let conn = get_db(&app)?;

    let entity = query_domain_by_id(&conn, &domain_id)?;
    let entity_url = entity.as_ref().and_then(|domain| domain.url.clone());
    let entity_picture = entity
        .as_ref()
        .and_then(|domain| domain.profile_picture.clone());
    let articles =
        list_web_store_articles_by_domain(app.clone(), domain_id.clone(), None, None, None).await?;
    let deleted_count =
        delete_articles_for_bucket(&app, entity_url, entity_picture, articles).await?;

    delete_domain(&conn, &domain_id)?;

    Ok(WebStoreProfileDeletion {
        success: true,
        deleted_count,
    })
}

#[tauri::command]
pub async fn delete_web_store_profile(
    app: AppHandle,
    profile_id: String,
) -> Result<WebStoreProfileDeletion, String> {
    let conn = get_db(&app)?;

    let entity = query_profile_by_id(&conn, &profile_id)?;
    let entity_url = entity.as_ref().and_then(|profile| profile.url.clone());
    let entity_picture = entity
        .as_ref()
        .and_then(|profile| profile.profile_picture.clone());
    let articles =
        list_web_store_articles_by_profile(app.clone(), profile_id.clone(), None, None, None)
            .await?;
    let deleted_count =
        delete_articles_for_bucket(&app, entity_url, entity_picture, articles).await?;

    delete_profile(&conn, &profile_id)?;

    Ok(WebStoreProfileDeletion {
        success: true,
        deleted_count,
    })
}

/// One analysed window of an article.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleWindowRecord {
    pub id: String,
    pub article_url: String,
    pub window_index: i64,
    pub start_offset: i64,
    pub end_offset: i64,
    /// JSON object payload, e.g. `{"summary": "..."}`. The shape is open on
    /// purpose: adding a new analytic key does not need a schema change.
    pub payload: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The whole analysis of an article: the combined summary plus every window.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleAnalysisRecord {
    pub url: String,
    pub summary: Option<String>,
    /// The window divisor that was actually executed. `None` means the
    /// article was split by markdown headings.
    pub divisor: Option<i64>,
    pub mode: Option<String>,
    pub windows: Vec<ArticleWindowRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleWindowInput {
    pub window_index: i64,
    pub start_offset: i64,
    pub end_offset: i64,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveArticleAnalysisInput {
    pub url: String,
    pub summary: Option<String>,
    pub divisor: Option<i64>,
    pub windows: Vec<ArticleWindowInput>,
}

/// Deterministic window id: the same article + window index always maps to
/// the same row id, so re-saving an analysis replaces rows instead of
/// duplicating them.
fn article_window_id(url: &str, window_index: i64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.trim().as_bytes());
    hasher.update(format!("#{window_index}").as_bytes());
    hex::encode(hasher.finalize())
}

fn row_to_article_window(row: &rusqlite::Row<'_>) -> Result<ArticleWindowRecord, rusqlite::Error> {
    Ok(ArticleWindowRecord {
        id: row.get("id")?,
        article_url: row.get("article_url")?,
        window_index: row.get("window_index")?,
        start_offset: row.get("start_offset")?,
        end_offset: row.get("end_offset")?,
        payload: row.get("payload")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Reads the persisted analysis of an article: summary, executed divisor and
/// every window, in one round trip (the article view needs all three).
fn read_article_analysis(
    conn: &Connection,
    url: &str,
) -> Result<Option<ArticleAnalysisRecord>, String> {
    let (summary, divisor, mode): (Option<String>, Option<i64>, Option<String>) = match conn
        .query_row(
        "SELECT summary, analysis_divisor, mode FROM web_articles WHERE url = ?1 COLLATE NOCASE",
        params![url],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ) {
        Ok(value) => value,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };

    let mut stmt = conn
        .prepare(
            "SELECT id, article_url, window_index, start_offset, end_offset, payload,
                    created_at, updated_at
             FROM article_windows
             WHERE article_url = ?1 COLLATE NOCASE
             ORDER BY window_index ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = stmt
        .query_map(params![url], row_to_article_window)
        .map_err(|error| error.to_string())?;

    let mut windows = Vec::new();
    for row in rows {
        windows.push(row.map_err(|error| error.to_string())?);
    }

    Ok(Some(ArticleAnalysisRecord {
        url: url.to_string(),
        summary,
        divisor,
        mode,
        windows,
    }))
}

/// Writes the analysis of an article in a single transaction: the previous
/// windows are replaced (never merged), the summary and the executed divisor
/// are stored on the article row and the article is flagged as `full`.
fn write_article_analysis(
    conn: &Connection,
    input: &SaveArticleAnalysisInput,
) -> Result<(), String> {
    let now = chrono_like_now();
    let tx = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;

    tx.execute(
        "DELETE FROM article_windows WHERE article_url = ?1 COLLATE NOCASE",
        params![input.url],
    )
    .map_err(|error| error.to_string())?;

    for window in &input.windows {
        tx.execute(
            "INSERT OR REPLACE INTO article_windows
                 (id, article_url, window_index, start_offset, end_offset, payload,
                  created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                article_window_id(&input.url, window.window_index),
                input.url,
                window.window_index,
                window.start_offset,
                window.end_offset,
                window.payload,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    tx.execute(
        "UPDATE web_articles
         SET summary = ?1, analysis_divisor = ?2, mode = 'full', updated_at = ?3
         WHERE url = ?4 COLLATE NOCASE",
        params![input.summary, input.divisor, now, input.url],
    )
    .map_err(|error| error.to_string())?;

    tx.commit().map_err(|error| error.to_string())?;

    Ok(())
}

/// Reads the persisted analysis of an article: summary, executed divisor and
/// every window, in one round trip (the article view needs all three).
#[tauri::command]
pub async fn get_article_analysis(
    app: AppHandle,
    url: String,
) -> Result<Option<ArticleAnalysisRecord>, String> {
    let conn = get_db(&app)?;
    read_article_analysis(&conn, &url)
}

/// Persists the analysis of an article in a single transaction: the previous
/// windows are replaced (never merged), the summary and the executed divisor
/// are stored on the article row and the article is flagged as `full`.
#[tauri::command]
pub async fn save_article_analysis(
    app: AppHandle,
    input: SaveArticleAnalysisInput,
) -> Result<(), String> {
    let conn = get_db(&app)?;
    write_article_analysis(&conn, &input)
}

/// Reads the category ids linked to an article.
///
/// The category editor and the pipeline both need to know whether an article
/// already has categories: the pipeline only auto-classifies when it has
/// none.
#[tauri::command]
pub async fn get_article_categories(
    app: AppHandle,
    article_url: String,
) -> Result<Vec<String>, String> {
    let conn = get_db(&app)?;

    let mut stmt = conn
        .prepare(
            "SELECT category_id FROM article_category
             WHERE article_url = ?1 COLLATE NOCASE
             ORDER BY category_id ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = stmt
        .query_map(params![article_url], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut categories = Vec::new();
    for row in rows {
        categories.push(row.map_err(|error| error.to_string())?);
    }

    Ok(categories)
}

/// Reads the category ids linked to a profile (channel or domain).
///
/// The profile page editor seeds from this on load; the links are also what
/// the dashboard's category facet filters on.
#[tauri::command]
pub async fn get_profile_categories(
    app: AppHandle,
    profile_id: String,
) -> Result<Vec<String>, String> {
    let conn = get_db(&app)?;
    query_profile_categories(&conn, &profile_id)
}

fn query_profile_categories(conn: &Connection, profile_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT category_id FROM profile_category
             WHERE profile_id = ?1 COLLATE NOCASE
             ORDER BY category_id ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = stmt
        .query_map(params![profile_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut categories = Vec::new();
    for row in rows {
        categories.push(row.map_err(|error| error.to_string())?);
    }

    Ok(categories)
}

#[tauri::command]
pub async fn write_raw_content(
    app: AppHandle,
    url: String,
    text: String,
) -> Result<String, String> {
    let key = raw_content_key(&url);
    let dir = raw_content_dir(&app)?;
    let path = dir.join(format!("{}.txt", key));
    fs::write(&path, text).map_err(|error| error.to_string())?;
    Ok(key)
}

#[tauri::command]
pub async fn read_raw_content(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let dir = raw_content_dir(&app)?;
    let path = dir.join(format!("{}.txt", key));
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn read_raw_content_by_url(app: AppHandle, url: String) -> Option<String> {
    let key = raw_content_key(&url);
    read_raw_content(app, key).await.ok().flatten()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawContentMatchResult {
    pub url: String,
    pub before: String,
    pub match_text: String,
    pub after: String,
    pub article: WebStoreArticleRecord,
}

/// Literal, case-insensitive first-match search inside a raw content document.
/// The user query is escaped so regex metacharacters are treated as text.
fn find_first_match_snippet(
    content: &str,
    pattern: &str,
    context: usize,
) -> Option<(String, String, String)> {
    let re = regex::RegexBuilder::new(&regex::escape(pattern))
        .case_insensitive(true)
        .build()
        .ok()?;

    for line in content.lines() {
        if let Some(m) = re.find(line) {
            let match_start = m.start();
            let match_end = m.end();
            let snippet_start = match_start.saturating_sub(context);
            let snippet_end = std::cmp::min(line.len(), match_end + context);

            return Some((
                line[snippet_start..match_start].to_string(),
                line[match_start..match_end].to_string(),
                line[match_end..snippet_end].to_string(),
            ));
        }
    }

    None
}

fn load_raw_content_url_index(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let mut stmt = conn
        .prepare("SELECT url FROM web_articles")
        .map_err(|e| e.to_string())?;
    let urls = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut index = HashMap::new();
    for url_result in urls {
        let url = url_result.map_err(|e| e.to_string())?;
        index.insert(raw_content_key(&url), url);
    }
    Ok(index)
}

fn fetch_articles_by_urls(
    conn: &Connection,
    urls: &[String],
) -> Result<HashMap<String, WebStoreArticleRecord>, String> {
    let mut map = HashMap::new();
    if urls.is_empty() {
        return Ok(map);
    }

    for chunk in urls.chunks(900) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let body = format!("WHERE a.url IN ({})", placeholders);
        let params: Vec<Box<dyn rusqlite::types::ToSql>> = chunk
            .iter()
            .map(|url| Box::new(url.clone()) as Box<dyn rusqlite::types::ToSql>)
            .collect();
        let records = query_articles_sql(conn, ARTICLE_LIST_COLUMNS, &body, &params)?;
        for record in records {
            if let Some(url) = record.url.clone() {
                map.insert(url, record);
            }
        }
    }
    Ok(map)
}

#[tauri::command]
pub async fn search_raw_content(
    app: AppHandle,
    pattern: String,
    context_chars: Option<usize>,
) -> Result<Vec<RawContentMatchResult>, String> {
    let context = context_chars.unwrap_or(20);
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return Ok(Vec::new());
    }

    let dir = raw_content_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let conn = get_db(&app)?;
    let url_index = load_raw_content_url_index(&conn)?;
    if url_index.is_empty() {
        return Ok(Vec::new());
    }

    let mut matched: Vec<(String, String, String, String)> = Vec::new();
    let mut seen_urls: std::collections::HashSet<String> = std::collections::HashSet::new();

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = match path.file_stem().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        let Some(url) = url_index.get(&file_name).cloned() else {
            continue;
        };
        if seen_urls.contains(&url) {
            continue;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        let Some((before, match_text, after)) =
            find_first_match_snippet(&content, pattern, context)
        else {
            continue;
        };

        seen_urls.insert(url.clone());
        matched.push((url, before, match_text, after));
    }

    if matched.is_empty() {
        return Ok(Vec::new());
    }

    let matched_urls: Vec<String> = matched.iter().map(|(url, _, _, _)| url.clone()).collect();
    let articles = fetch_articles_by_urls(&conn, &matched_urls)?;

    let mut results: Vec<RawContentMatchResult> = Vec::new();
    for (url, before, match_text, after) in matched {
        let Some(article) = articles.get(&url).cloned() else {
            continue;
        };
        results.push(RawContentMatchResult {
            url,
            before,
            match_text,
            after,
            article,
        });
    }

    results.sort_by(|left, right| right.article.created_at.cmp(&left.article.created_at));

    Ok(results)
}

#[tauri::command]
pub async fn list_web_store_categories(
    app: AppHandle,
) -> Result<Vec<WebStoreCategoryRecord>, String> {
    let conn = get_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT id, name, description, last_modified, deleted_at FROM web_categories WHERE deleted_at IS NULL ORDER BY name ASC")
        .map_err(|error| error.to_string())?;

    let category_iter = stmt
        .query_map([], |row| {
            Ok(WebStoreCategoryRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                last_modified: row.get(3)?,
                deleted_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut categories = Vec::new();
    for category_result in category_iter {
        categories.push(category_result.map_err(|error| error.to_string())?);
    }

    Ok(categories)
}

#[tauri::command]
pub async fn upsert_web_store_category(
    app: AppHandle,
    mut input: UpsertWebStoreCategoryInput,
) -> Result<(), String> {
    input.description = normalize_optional_string(input.description);

    let conn = get_db(&app)?;

    let now = chrono_like_now();

    conn.execute(
        "INSERT INTO web_categories (id, name, description, last_modified, deleted_at) 
         VALUES (?1, ?2, ?4, ?3, NULL)
         ON CONFLICT(id) DO UPDATE SET name = ?2, description = ?4, last_modified = ?3, deleted_at = NULL",
        params![input.id, input.name, now, input.description],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn delete_category_rows(conn: &mut Connection, category_id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(|error| {
        format!(
            "Failed to start transaction for category delete id='{}': {}",
            category_id, error
        )
    })?;

    tx.execute(
        "DELETE FROM article_category WHERE category_id = ?1",
        params![category_id],
    )
    .map_err(|error| {
        format!(
            "Failed to delete article links for category id='{}': {}",
            category_id, error
        )
    })?;

    tx.execute(
        "DELETE FROM profile_category WHERE category_id = ?1",
        params![category_id],
    )
    .map_err(|error| {
        format!(
            "Failed to delete profile links for category id='{}': {}",
            category_id, error
        )
    })?;

    tx.execute(
        "DELETE FROM category_exemplars WHERE category_id = ?1",
        params![category_id],
    )
    .map_err(|error| {
        format!(
            "Failed to delete exemplars for category id='{}': {}",
            category_id, error
        )
    })?;

    tx.execute(
        "DELETE FROM web_categories WHERE id = ?1",
        params![category_id],
    )
    .map_err(|error| format!("Failed to delete category id='{}': {}", category_id, error))?;

    tx.commit().map_err(|error| {
        format!(
            "Failed to commit category delete id='{}': {}",
            category_id, error
        )
    })?;

    Ok(())
}

#[tauri::command]
pub async fn delete_web_store_category(
    app: AppHandle,
    category_id: String,
) -> Result<bool, String> {
    let mut conn = get_db(&app)?;

    delete_category_rows(&mut conn, &category_id)?;

    Ok(true)
}

#[tauri::command]
pub async fn assign_categories_to_article(
    app: AppHandle,
    input: AssignCategoriesToArticleInput,
) -> Result<(), String> {
    let mut conn = get_db(&app)?;

    let tx = conn.transaction().map_err(|error| {
        format!(
            "Failed to start transaction for category assignment on article url='{}': {}",
            input.article_url, error
        )
    })?;

    tx.execute(
        "DELETE FROM article_category WHERE article_url = ?1",
        params![input.article_url],
    )
    .map_err(|error| {
        format!(
            "Failed to clear existing categories for article url='{}': {}",
            input.article_url, error
        )
    })?;

    for category_id in &input.category_ids {
        let category_exists: bool = tx
            .query_row(
                "SELECT COUNT(*) > 0 FROM web_categories WHERE id = ?1 AND deleted_at IS NULL",
                [category_id],
                |row| row.get(0),
            )
            .map_err(|error| {
                format!(
                    "Failed to check existence of category '{}' for article url='{}': {}",
                    category_id, input.article_url, error
                )
            })?;

        if !category_exists {
            return Err(format!(
                "Category '{}' does not exist or is deleted (article url='{}')",
                category_id, input.article_url
            ));
        }

        tx.execute(
            "INSERT OR IGNORE INTO article_category (article_url, category_id) VALUES (?1, ?2)",
            params![input.article_url, category_id],
        )
        .map_err(|error| {
            format!(
                "Failed to assign category '{}' to article url='{}': {}",
                category_id, input.article_url, error
            )
        })?;
    }

    tx.commit().map_err(|error| {
        format!(
            "Failed to commit category assignment for article url='{}': {}",
            input.article_url, error
        )
    })?;
    Ok(())
}

/// Replaces the categories linked to a profile (channel or domain).
///
/// Replace-all, mirroring `assign_categories_to_article`: the input is the
/// full desired set, so removing a pill means it is absent from the next write.
#[tauri::command]
pub async fn assign_categories_to_profile(
    app: AppHandle,
    input: AssignCategoriesToProfileInput,
) -> Result<(), String> {
    let mut conn = get_db(&app)?;
    assign_profile_categories(&mut conn, &input.profile_id, &input.category_ids)
}

fn assign_profile_categories(
    conn: &mut Connection,
    profile_id: &str,
    category_ids: &[String],
) -> Result<(), String> {
    // Soft key: every reader matches it case-insensitively, so store one
    // canonical form and the PK can never split the same profile in two.
    let profile_key = profile_id.trim().to_lowercase();

    let tx = conn.transaction().map_err(|error| {
        format!(
            "Failed to start transaction for category assignment on profile id='{}': {}",
            profile_id, error
        )
    })?;

    tx.execute(
        "DELETE FROM profile_category WHERE profile_id = ?1 COLLATE NOCASE",
        params![profile_key],
    )
    .map_err(|error| {
        format!(
            "Failed to clear existing categories for profile id='{}': {}",
            profile_id, error
        )
    })?;

    for category_id in category_ids {
        let category_exists: bool = tx
            .query_row(
                "SELECT COUNT(*) > 0 FROM web_categories WHERE id = ?1 AND deleted_at IS NULL",
                [category_id],
                |row| row.get(0),
            )
            .map_err(|error| {
                format!(
                    "Failed to check existence of category '{}' for profile id='{}': {}",
                    category_id, profile_id, error
                )
            })?;

        if !category_exists {
            return Err(format!(
                "Category '{}' does not exist or is deleted (profile id='{}')",
                category_id, profile_id
            ));
        }

        tx.execute(
            "INSERT OR IGNORE INTO profile_category (profile_id, category_id) VALUES (?1, ?2)",
            params![profile_key, category_id],
        )
        .map_err(|error| {
            format!(
                "Failed to assign category '{}' to profile id='{}': {}",
                category_id, profile_id, error
            )
        })?;
    }

    tx.commit().map_err(|error| {
        format!(
            "Failed to commit category assignment for profile id='{}': {}",
            profile_id, error
        )
    })?;
    Ok(())
}

fn map_category_exemplar_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CategoryExemplarRecord> {
    Ok(CategoryExemplarRecord {
        id: row.get(0)?,
        category_id: row.get(1)?,
        article_url: row.get(2)?,
        article_title: row.get(3)?,
        text: row.get(4)?,
        model_name: row.get(5)?,
        model_dimensions: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        window_index: row.get(9)?,
    })
}

const CATEGORY_EXEMPLAR_SELECT: &str = "SELECT e.id, e.category_id, e.article_url,
        (SELECT a.title FROM web_articles a WHERE a.url = e.article_url
            ORDER BY a.updated_at DESC LIMIT 1),
        e.text, e.model_name, e.model_dimensions, e.created_at, e.updated_at, e.window_index
     FROM category_exemplars e";

fn query_category_exemplars(
    conn: &Connection,
    where_clause: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<Vec<CategoryExemplarRecord>, String> {
    let sql =
        format!("{CATEGORY_EXEMPLAR_SELECT} {where_clause} ORDER BY e.created_at DESC, e.id ASC");
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params, map_category_exemplar_row)
        .map_err(|error| error.to_string())?;

    let mut exemplars = Vec::new();
    for row in rows {
        exemplars.push(row.map_err(|error| error.to_string())?);
    }
    Ok(exemplars)
}

/// List the exemplars fed to a single category (most recent first).
#[tauri::command]
pub async fn list_category_exemplars(
    app: AppHandle,
    category_id: String,
) -> Result<Vec<CategoryExemplarRecord>, String> {
    let conn = get_db(&app)?;
    query_category_exemplars(&conn, "WHERE e.category_id = ?1", &[&category_id])
}

/// List every exemplar across all categories. Used to rebuild the derived
/// LanceDB index from the SQLite source of truth.
#[tauri::command]
pub async fn list_all_category_exemplars(
    app: AppHandle,
) -> Result<Vec<CategoryExemplarRecord>, String> {
    let conn = get_db(&app)?;
    query_category_exemplars(&conn, "", &[])
}

/// Insert a new exemplar or replace the text of an existing
/// `(category_id, article_url, window_index)` triple. Returns the persisted row
/// so the caller can key the derived vector with the same id.
#[tauri::command]
pub async fn upsert_category_exemplar(
    app: AppHandle,
    input: UpsertCategoryExemplarInput,
) -> Result<CategoryExemplarRecord, String> {
    let conn = get_db(&app)?;

    let now = chrono_like_now();
    let id = uuid::Uuid::new_v4().to_string();
    let window_index = input.window_index.unwrap_or(0);

    conn.execute(
        "INSERT INTO category_exemplars
            (id, category_id, article_url, window_index, text, model_name, model_dimensions, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(category_id, article_url, window_index) DO UPDATE SET
            text = excluded.text,
            model_name = excluded.model_name,
            model_dimensions = excluded.model_dimensions,
            updated_at = excluded.updated_at",
        params![
            id,
            input.category_id,
            input.article_url,
            window_index,
            input.text,
            input.model_name,
            input.model_dimensions,
            now
        ],
    )
    .map_err(|error| error.to_string())?;

    let mut rows = query_category_exemplars(
        &conn,
        "WHERE e.category_id = ?1 AND e.article_url = ?2 AND e.window_index = ?3",
        &[&input.category_id, &input.article_url, &window_index],
    )?;

    rows.pop()
        .ok_or_else(|| "Exemplar upsert did not persist a row".to_string())
}

/// Remove every window exemplar of one article in one category, returning the
/// removed ids so the caller can drop the matching derived vectors.
fn delete_category_exemplars_for_article_rows(
    conn: &Connection,
    category_id: &str,
    article_url: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM category_exemplars WHERE category_id = ?1 AND article_url = ?2")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![category_id, article_url], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|error| error.to_string())?;

    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|error| error.to_string())?);
    }

    conn.execute(
        "DELETE FROM category_exemplars WHERE category_id = ?1 AND article_url = ?2",
        params![category_id, article_url],
    )
    .map_err(|error| error.to_string())?;

    Ok(ids)
}

#[tauri::command]
pub async fn delete_category_exemplars_for_article(
    app: AppHandle,
    category_id: String,
    article_url: String,
) -> Result<Vec<String>, String> {
    let conn = get_db(&app)?;

    delete_category_exemplars_for_article_rows(&conn, &category_id, &article_url)
}

#[tauri::command]
pub async fn delete_category_exemplar(app: AppHandle, id: String) -> Result<bool, String> {
    let conn = get_db(&app)?;

    let changes = conn
        .execute("DELETE FROM category_exemplars WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;

    Ok(changes > 0)
}

/// Compare the stored exemplar model signature against the current embedding
/// model. When `matching < total` the derived index is stale and the caller
/// should rebuild it.
fn category_exemplar_model_status(
    conn: &Connection,
    model_name: &str,
    model_dimensions: Option<i32>,
) -> Result<CategoryExemplarModelStatus, String> {
    let (total, matching): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*),
                    COALESCE(SUM(CASE WHEN model_name = ?1
                        AND ((?2 IS NULL AND model_dimensions IS NULL) OR model_dimensions = ?2)
                        THEN 1 ELSE 0 END), 0)
             FROM category_exemplars",
            params![model_name, model_dimensions],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;

    Ok(CategoryExemplarModelStatus { total, matching })
}

#[tauri::command]
pub async fn get_category_exemplar_model_status(
    app: AppHandle,
    model_name: String,
    model_dimensions: Option<i32>,
) -> Result<CategoryExemplarModelStatus, String> {
    let conn = get_db(&app)?;

    category_exemplar_model_status(&conn, &model_name, model_dimensions)
}

/// Stamp every exemplar with the current model signature after a rebuild.
#[tauri::command]
pub async fn update_category_exemplars_model(
    app: AppHandle,
    model_name: String,
    model_dimensions: Option<i32>,
) -> Result<usize, String> {
    let conn = get_db(&app)?;

    let changes = conn
        .execute(
            "UPDATE category_exemplars SET model_name = ?1, model_dimensions = ?2, updated_at = ?3",
            params![model_name, model_dimensions, chrono_like_now()],
        )
        .map_err(|error| error.to_string())?;

    Ok(changes)
}

fn query_articles_for_bucket(
    conn: &Connection,
    column: &str,
    bucket_id: &str,
    article_count: usize,
) -> Result<Vec<WebStoreArticleRecord>, String> {
    let body = format!(
        "WHERE LOWER(a.{column}) = LOWER(?1) AND a.{column} IS NOT NULL{} LIMIT ?2",
        article_order_clause(column == "profile")
    );

    query_articles_sql(
        conn,
        ARTICLE_LIST_COLUMNS,
        &body,
        &[Box::new(bucket_id.to_string()), Box::new(article_count)],
    )
}

fn query_articles_for_profile(
    conn: &Connection,
    profile_id: &str,
    article_count: usize,
) -> Result<Vec<WebStoreArticleRecord>, String> {
    query_articles_for_bucket(conn, "profile", profile_id, article_count)
}

fn query_articles_for_domain(
    conn: &Connection,
    domain_id: &str,
    article_count: usize,
) -> Result<Vec<WebStoreArticleRecord>, String> {
    query_articles_for_bucket(conn, "domain", domain_id, article_count)
}

/// Filters accepted by the article-list query. The single `profile_id` keeps
/// the legacy "this entity, either kind" match (profile OR domain) used by the
/// profile page; the `profile_ids` / `domain_ids` lists are facet filters that
/// match their own column only, OR within a kind and AND across kinds.
#[derive(Default)]
struct ArticlesWithoutProfileFilter {
    category_ids: Option<Vec<String>>,
    profile_id: Option<String>,
    profile_ids: Option<Vec<String>>,
    domain_ids: Option<Vec<String>>,
    date_from: Option<String>,
    /// `metadata` restricts the list to captured-but-not-analysed articles.
    /// `full` restricts it to analysed ones. `None` means "any mode".
    mode: Option<String>,
    only_without_profile: Option<bool>,
}

/// Normalizes facet ids for comparison against `LOWER(a.profile/a.domain)`:
/// trims whitespace, lowercases and drops empties so an empty list means
/// "facet not applied" instead of an impossible `IN ()` clause.
fn normalize_filter_ids(ids: &[String]) -> Vec<String> {
    ids.iter()
        .map(|id| id.trim().to_lowercase())
        .filter(|id| !id.is_empty())
        .collect()
}

fn query_articles_without_profile(
    conn: &Connection,
    filter: &ArticlesWithoutProfileFilter,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<ArticlesWithoutProfileResponse, String> {
    let mut where_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    let profile_ids = filter
        .profile_ids
        .as_deref()
        .map(|ids| normalize_filter_ids(ids))
        .unwrap_or_default();
    let domain_ids = filter
        .domain_ids
        .as_deref()
        .map(|ids| normalize_filter_ids(ids))
        .unwrap_or_default();
    let has_facet_ids = !profile_ids.is_empty() || !domain_ids.is_empty();

    if let Some(ref pid) = filter.profile_id {
        let normalized = pid.trim().to_lowercase();
        if !normalized.is_empty() {
            where_clauses.push("(LOWER(a.profile) = ? OR LOWER(a.domain) = ?)".to_string());
            params.push(Box::new(normalized.clone()));
            params.push(Box::new(normalized));
            where_clauses.push("(a.profile IS NOT NULL OR a.domain IS NOT NULL)".to_string());
        }
    } else if !has_facet_ids && filter.only_without_profile.unwrap_or(true) {
        where_clauses.push("a.profile IS NULL".to_string());
    }

    if !profile_ids.is_empty() {
        let placeholders = profile_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        where_clauses.push(format!("LOWER(a.profile) IN ({placeholders})"));
        for id in &profile_ids {
            params.push(Box::new(id.clone()));
        }
    }

    if !domain_ids.is_empty() {
        let placeholders = domain_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        where_clauses.push(format!("LOWER(a.domain) IN ({placeholders})"));
        for id in &domain_ids {
            params.push(Box::new(id.clone()));
        }
    }

    if let Some(ref from) = filter.date_from {
        where_clauses.push("a.date >= ?".to_string());
        params.push(Box::new(from.clone()));
    }

    if let Some(ref cats) = filter.category_ids {
        if !cats.is_empty() {
            let placeholders = cats.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            where_clauses.push(format!(
                "a.url IN (
                    SELECT ac.article_url
                    FROM article_category ac
                    WHERE ac.category_id IN ({})
                )",
                placeholders
            ));
            for id in cats {
                params.push(Box::new(id.clone()));
            }
        }
    }

    if let Some(ref mode) = filter
        .mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        where_clauses.push("a.mode = ?".to_string());
        params.push(Box::new(mode.to_string()));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM web_articles a{}", where_sql);

    let total: usize = {
        let mut count_stmt = conn
            .prepare(&count_sql)
            .map_err(|error| error.to_string())?;
        count_stmt
            .query_row(
                rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?
    };

    let body = format!(
        "{}{} LIMIT {} OFFSET {}",
        where_sql,
        article_order_clause(filter.profile_id.is_some()),
        limit.unwrap_or(20),
        offset.unwrap_or(0)
    );

    let articles = query_articles_sql(conn, ARTICLE_LIST_COLUMNS, &body, &params)?;

    Ok(ArticlesWithoutProfileResponse { articles, total })
}

#[tauri::command]
pub async fn list_articles_without_profile(
    app: AppHandle,
    category_ids: Option<Vec<String>>,
    offset: Option<usize>,
    limit: Option<usize>,
    only_without_profile: Option<bool>,
    profile_id: Option<String>,
    profile_ids: Option<Vec<String>>,
    domain_ids: Option<Vec<String>>,
    date_from: Option<String>,
    mode: Option<String>,
) -> Result<ArticlesWithoutProfileResponse, String> {
    let conn = get_db(&app)?;

    query_articles_without_profile(
        &conn,
        &ArticlesWithoutProfileFilter {
            category_ids,
            profile_id,
            profile_ids,
            domain_ids,
            date_from,
            mode,
            only_without_profile,
        },
        offset,
        limit,
    )
}

/// Applies the channel-page order captured by the scraper to a profile's
/// articles: `urls` must be in scrape order (newest first). Rows no longer
/// present in the scrape window lose their rank so they fall back to
/// `created_at` instead of keeping a stale position.
/// A missing profile id or an empty scrape is a no-op: clearing ranks with
/// nothing to replace them would silently destroy the stored ordering.
fn apply_profile_article_order(
    conn: &mut Connection,
    profile_id: &str,
    urls: &[String],
) -> Result<usize, String> {
    let normalized = profile_id.trim().to_lowercase();
    if normalized.is_empty() || urls.is_empty() {
        return Ok(0);
    }

    let tx = conn.transaction().map_err(|error| {
        format!(
            "Failed to start transaction for profile article order id='{}': {}",
            normalized, error
        )
    })?;

    tx.execute(
        "UPDATE web_articles SET profile_rank = NULL
         WHERE LOWER(profile) = ?1 OR LOWER(domain) = ?1",
        [&normalized],
    )
    .map_err(|error| {
        format!(
            "Failed to clear profile ranks for id='{}': {}",
            normalized, error
        )
    })?;

    for (rank, url) in urls.iter().enumerate() {
        tx.execute(
            "UPDATE web_articles SET profile_rank = ?1 WHERE url = ?2",
            params![rank as i64, url],
        )
        .map_err(|error| {
            format!(
                "Failed to rank profile article url='{}' for id='{}': {}",
                url, normalized, error
            )
        })?;
    }

    tx.commit().map_err(|error| {
        format!(
            "Failed to commit profile article order for id='{}': {}",
            normalized, error
        )
    })?;

    Ok(urls.len())
}

#[tauri::command]
pub async fn set_profile_article_order(
    app: AppHandle,
    profile_id: String,
    urls: Vec<String>,
) -> Result<usize, String> {
    let mut conn = get_db(&app)?;
    apply_profile_article_order(&mut conn, &profile_id, &urls)
}

#[tauri::command]
pub async fn list_articles_by_categories(
    app: AppHandle,
    queries: Vec<CategoryArticlesQuery>,
    created_at_from: Option<i64>,
) -> Result<Vec<CategoryWithArticles>, String> {
    let conn = get_db(&app)?;

    query_articles_by_categories(&conn, &queries, created_at_from)
}

fn query_articles_by_categories(
    conn: &Connection,
    queries: &[CategoryArticlesQuery],
    created_at_from: Option<i64>,
) -> Result<Vec<CategoryWithArticles>, String> {
    let mut result = Vec::new();
    for query in queries {
        let targets: Vec<(String, String)> = match &query.category_id {
            Some(id) => match get_category_name(conn, id)? {
                Some(name) => vec![(id.clone(), name)],
                None => Vec::new(),
            },
            None => list_all_category_names(conn)?,
        };

        for (category_id, category_name) in targets {
            let (articles, has_more) = query_articles_for_category(
                conn,
                &category_id,
                query.offset,
                query.article_count,
                created_at_from,
            )?;
            result.push(CategoryWithArticles {
                category_id,
                category_name,
                articles,
                has_more,
            });
        }
    }

    Ok(result)
}

fn list_all_category_names(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name FROM web_categories WHERE deleted_at IS NULL ORDER BY name ASC")
        .map_err(|error| error.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;

    let mut names = Vec::new();
    for row in rows {
        names.push(row.map_err(|error| error.to_string())?);
    }

    Ok(names)
}

fn get_category_name(conn: &Connection, category_id: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM web_categories WHERE id = ?1 AND deleted_at IS NULL")
        .map_err(|error| error.to_string())?;

    let mut rows = stmt
        .query_map([category_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    match rows.next() {
        Some(result) => Ok(Some(result.map_err(|error| error.to_string())?)),
        None => Ok(None),
    }
}

fn query_articles_for_category(
    conn: &Connection,
    category_id: &str,
    offset: usize,
    article_count: usize,
    created_at_from: Option<i64>,
) -> Result<(Vec<WebStoreArticleRecord>, bool), String> {
    let mut body = String::from(
        "INNER JOIN article_category ac ON ac.article_url = a.url
         WHERE ac.category_id = ?1",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(category_id.to_string())];

    if let Some(from) = created_at_from {
        body.push_str(" AND a.created_at >= ?2");
        params.push(Box::new(from));
    }

    // Fetch one extra row so the caller can tell whether another page exists.
    let fetch_limit = article_count.saturating_add(1);
    body.push_str(" ORDER BY a.created_at DESC, a.date DESC NULLS LAST LIMIT ? OFFSET ?");
    params.push(Box::new(fetch_limit));
    params.push(Box::new(offset));

    let mut articles = query_articles_sql(conn, ARTICLE_LIST_COLUMNS, &body, &params)?;
    let has_more = articles.len() > article_count;
    articles.truncate(article_count);

    Ok((articles, has_more))
}

#[tauri::command]
pub async fn list_categories_with_articles(
    app: AppHandle,
    offset: Option<usize>,
    limit: Option<usize>,
    article_count: Option<usize>,
    created_at_from: Option<i64>,
) -> Result<CategoriesWithArticlesPage, String> {
    let conn = get_db(&app)?;

    query_categories_with_articles(
        &conn,
        offset.unwrap_or(0),
        limit.unwrap_or(50),
        article_count.unwrap_or(10),
        created_at_from,
    )
}

/// Paginated category catalog for the categories wheel. Ordering (most recent
/// article first) and the "has at least one article" filter are resolved in SQL
/// so the offset stays stable across pages.
fn query_categories_with_articles(
    conn: &Connection,
    offset: usize,
    limit: usize,
    article_count: usize,
    created_at_from: Option<i64>,
) -> Result<CategoriesWithArticlesPage, String> {
    let mut sql = String::from(
        "SELECT c.id, c.name
         FROM web_categories c
         INNER JOIN article_category ac ON ac.category_id = c.id
         INNER JOIN web_articles a ON a.url = ac.article_url
         WHERE c.deleted_at IS NULL",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(from) = created_at_from {
        sql.push_str(" AND a.created_at >= ?");
        params.push(Box::new(from));
    }

    // Fetch one extra row so the caller can tell whether another page exists.
    // Tiebreak on c.id so two categories sharing the same newest-article
    // timestamp keep a deterministic order across OFFSET page fetches.
    sql.push_str(
        " GROUP BY c.id, c.name ORDER BY MAX(a.created_at) DESC, c.id ASC LIMIT ? OFFSET ?",
    );
    params.push(Box::new(limit.saturating_add(1)));
    params.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| error.to_string())?;

    let mut targets: Vec<(String, String)> = Vec::new();
    for row in rows {
        targets.push(row.map_err(|error| error.to_string())?);
    }

    let has_more = targets.len() > limit;
    targets.truncate(limit);

    let mut categories = Vec::with_capacity(targets.len());
    for (category_id, category_name) in targets {
        let (articles, _) =
            query_articles_for_category(conn, &category_id, 0, article_count, created_at_from)?;
        categories.push(CategoryWithArticles {
            category_id,
            category_name,
            articles,
            has_more: false,
        });
    }

    Ok(CategoriesWithArticlesPage {
        categories,
        has_more,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn build_in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        init_schema(&conn).expect("init schema");
        conn
    }

    fn insert_article(
        conn: &Connection,
        id: &str,
        profile: &str,
        created_at: i64,
        date: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO web_articles
                (id, url, created_at, title, thumbnail, content, media_directory,
                 main_color, profile, embedding_source_text, updated_at, viewed, date)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, ?6, NULL, ?3, 0, ?7)",
            params![
                id,
                id,
                created_at,
                format!("title-{}", id),
                None::<String>,
                profile,
                date
            ],
        )
        .expect("insert article");
    }

    fn insert_category(conn: &Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO web_categories (id, name, last_modified, deleted_at)
             VALUES (?1, ?2, 0, NULL)",
            params![id, name],
        )
        .expect("insert category");
    }

    fn link_article_to_category(conn: &Connection, article_url: &str, category_id: &str) {
        conn.execute(
            "INSERT INTO article_category (article_url, category_id) VALUES (?1, ?2)",
            params![article_url, category_id],
        )
        .expect("link article to category");
    }

    fn insert_profile_row(conn: &Connection, id: &str, domain_id: &str) {
        insert_domain_row(conn, domain_id);
        conn.execute(
            "INSERT OR IGNORE INTO web_profiles (id, name, domain_id, count, profile_picture, url, updated_at)
             VALUES (?1, ?1, ?2, 0, NULL, NULL, 0)",
            params![id, domain_id],
        )
        .expect("insert profile");
    }

    fn link_profile_to_category(conn: &Connection, profile_id: &str, category_id: &str) {
        conn.execute(
            "INSERT INTO profile_category (profile_id, category_id) VALUES (?1, ?2)",
            params![profile_id, category_id],
        )
        .expect("link profile to category");
    }

    /// List queries must not drag the article body through IPC: the frontend
    /// renders bodies from task data (`raw_content` files), so the `content`
    /// and `embedding_source_text` columns stay reserved for the detail path.
    #[test]
    fn list_columns_omit_content_and_detail_columns_include_it() {
        let conn = build_in_memory_db();
        conn.execute(
            "INSERT INTO web_articles
                (id, url, created_at, title, content, embedding_source_text, updated_at, viewed)
             VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?2, 0)",
            params![
                "https://example.com/article",
                1_000_000_000_000i64,
                "title",
                "FULL BODY",
                "EMBEDDING SOURCE"
            ],
        )
        .expect("insert article with body");

        let body = " ORDER BY a.created_at DESC";

        let listed =
            query_articles_sql(&conn, ARTICLE_LIST_COLUMNS, body, &[]).expect("list query");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title.as_deref(), Some("title"));
        assert!(
            listed[0].content.is_none(),
            "list queries must not select the article body"
        );
        assert!(
            listed[0].embedding_source_text.is_none(),
            "list queries must not select the embedding source text"
        );

        let detail = query_articles_sql(&conn, ARTICLE_COLUMNS, body, &[]).expect("detail query");
        assert_eq!(detail.len(), 1);
        assert_eq!(detail[0].content.as_deref(), Some("FULL BODY"));
        assert_eq!(
            detail[0].embedding_source_text.as_deref(),
            Some("EMBEDDING SOURCE")
        );
    }

    #[test]
    fn query_articles_by_categories_returns_all_when_category_id_none() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_category(&conn, "cat-b", "Beta");
        insert_category(&conn, "cat-deleted", "Deleted");

        for i in 0..5 {
            insert_article(
                &conn,
                &format!("a-{i}"),
                "channel",
                2_000_000_000_000 + i,
                None,
            );
            link_article_to_category(&conn, &format!("a-{i}"), "cat-a");
        }
        insert_article(&conn, "b-1", "channel", 3_000_000_000_000, None);
        link_article_to_category(&conn, "b-1", "cat-b");

        conn.execute(
            "UPDATE web_categories SET deleted_at = 1 WHERE id = 'cat-deleted'",
            [],
        )
        .expect("mark category deleted");

        let queries = vec![CategoryArticlesQuery {
            category_id: None,
            offset: 0,
            article_count: 4,
        }];
        let result = query_articles_by_categories(&conn, &queries, None).expect("query");

        let names: Vec<&str> = result.iter().map(|c| c.category_name.as_str()).collect();
        assert_eq!(
            names,
            vec!["Alpha", "Beta"],
            "expected all non-deleted categories"
        );

        let alpha = result.iter().find(|c| c.category_id == "cat-a").unwrap();
        assert_eq!(
            alpha.articles.len(),
            4,
            "expected article count capped at 4"
        );
        assert!(
            alpha.has_more,
            "expected has_more when more articles exist beyond the page"
        );
    }

    #[test]
    fn query_articles_by_categories_respects_offset_and_reports_has_more() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");

        for i in 0..5 {
            insert_article(
                &conn,
                &format!("a-{i}"),
                "channel",
                2_000_000_000_000 + i,
                None,
            );
            link_article_to_category(&conn, &format!("a-{i}"), "cat-a");
        }

        let page = |offset: usize| -> Vec<CategoryWithArticles> {
            let queries = vec![CategoryArticlesQuery {
                category_id: Some("cat-a".to_string()),
                offset,
                article_count: 2,
            }];
            query_articles_by_categories(&conn, &queries, None).expect("query")
        };

        let first = page(0);
        let second = page(2);
        let last = page(4);

        assert_eq!(first[0].articles.len(), 2, "first page full");
        assert!(first[0].has_more, "more pages exist after the first");
        assert_eq!(second[0].articles.len(), 2, "second page full");
        assert!(second[0].has_more, "last article lands on page three");
        assert_eq!(
            last[0].articles.len(),
            1,
            "tail page carries the remaining article"
        );
        assert!(!last[0].has_more, "no page after the tail");

        let first_urls: Vec<Option<String>> =
            first[0].articles.iter().map(|a| a.url.clone()).collect();
        let second_urls: Vec<Option<String>> =
            second[0].articles.iter().map(|a| a.url.clone()).collect();
        for url in &first_urls {
            assert!(!second_urls.contains(url), "paged results must not overlap");
        }
    }

    #[test]
    fn query_articles_by_categories_filters_by_created_at() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");

        insert_article(&conn, "old-article", "channel", 1_000_000_000_000, None);
        insert_article(&conn, "new-article", "channel", 2_000_000_000_000, None);
        link_article_to_category(&conn, "old-article", "cat-a");
        link_article_to_category(&conn, "new-article", "cat-a");

        let queries = vec![CategoryArticlesQuery {
            category_id: Some("cat-a".to_string()),
            offset: 0,
            article_count: 4,
        }];
        let result =
            query_articles_by_categories(&conn, &queries, Some(1_500_000_000_000)).expect("query");

        let category = &result[0];
        let urls: Vec<&str> = category
            .articles
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(
            urls,
            vec!["new-article"],
            "expected only articles created after the cutoff"
        );
        assert!(
            !category.has_more,
            "a page shorter than the limit has no next page"
        );
    }

    #[test]
    fn query_categories_with_articles_orders_by_recent_and_paginates() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-old", "Old");
        insert_category(&conn, "cat-new", "New");
        insert_category(&conn, "cat-empty", "Empty");

        insert_article(&conn, "old-1", "channel", 1_000_000_000_000, None);
        link_article_to_category(&conn, "old-1", "cat-old");
        insert_article(&conn, "new-1", "channel", 2_000_000_000_000, None);
        link_article_to_category(&conn, "new-1", "cat-new");

        let first = query_categories_with_articles(&conn, 0, 1, 10, None).expect("query");
        assert!(
            first.has_more,
            "two non-empty categories remain after a page of one"
        );
        assert_eq!(first.categories.len(), 1);
        assert_eq!(
            first.categories[0].category_id, "cat-new",
            "most recent article first"
        );

        let second = query_categories_with_articles(&conn, 1, 1, 10, None).expect("query");
        assert!(!second.has_more, "no page after the second category");
        assert_eq!(second.categories[0].category_id, "cat-old");

        // Empty categories never appear, and both pages together cover the set.
        let all = query_categories_with_articles(&conn, 0, 10, 10, None).expect("query");
        let ids: Vec<&str> = all
            .categories
            .iter()
            .map(|c| c.category_id.as_str())
            .collect();
        assert_eq!(ids, vec!["cat-new", "cat-old"]);
        assert!(!all.has_more);
    }

    #[test]
    fn query_categories_with_articles_breaks_ties_deterministically() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-b", "Beta");
        insert_category(&conn, "cat-a", "Alpha");

        // Both categories' newest articles share the same timestamp: without a
        // tiebreaker, truncating and paging can duplicate or skip categories.
        insert_article(&conn, "a-1", "channel", 1_500_000_000_000, None);
        insert_article(&conn, "b-1", "channel", 1_500_000_000_000, None);
        link_article_to_category(&conn, "a-1", "cat-a");
        link_article_to_category(&conn, "b-1", "cat-b");

        let first = query_categories_with_articles(&conn, 0, 1, 10, None).expect("query");
        let second = query_categories_with_articles(&conn, 1, 1, 10, None).expect("query");

        assert!(!second.has_more, "no page after the second category");
        let ids: Vec<&str> = [
            first.categories[0].category_id.as_str(),
            second.categories[0].category_id.as_str(),
        ]
        .to_vec();
        assert_eq!(ids.len(), 2, "pages must not overlap on ties");
        assert_eq!(
            ids[0], "cat-a",
            "equal newest timestamps fall back to id ordering"
        );
        assert_eq!(ids[1], "cat-b");
    }

    #[test]
    fn query_categories_with_articles_respects_created_at_cutoff() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_article(&conn, "old-1", "channel", 1_000_000_000_000, None);
        insert_article(&conn, "new-1", "channel", 2_000_000_000_000, None);
        link_article_to_category(&conn, "old-1", "cat-a");
        link_article_to_category(&conn, "new-1", "cat-a");

        let page = query_categories_with_articles(&conn, 0, 10, 10, Some(1_500_000_000_000))
            .expect("query");
        assert_eq!(
            page.categories.len(),
            1,
            "category survives via its newer article"
        );
        let urls: Vec<&str> = page.categories[0]
            .articles
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(urls, vec!["new-1"], "cutoff filters older articles");
    }

    #[test]
    fn query_articles_for_profile_orders_by_created_at_desc() {
        let conn = build_in_memory_db();
        let profile = "channel-a";

        insert_article(
            &conn,
            "old-yt-newly-added",
            profile,
            2_000_000_000_000,
            Some("15 jun 2024"),
        );
        insert_article(
            &conn,
            "newer-yt-added-earlier",
            profile,
            1_000_000_000_000,
            Some("20 dic 2025"),
        );
        insert_article(
            &conn,
            "newest-yt-old-publish",
            profile,
            3_000_000_000_000,
            Some("1 ene 2023"),
        );
        insert_article(
            &conn,
            "other-profile",
            "channel-b",
            9_000_000_000_000,
            Some("1 mar 2026"),
        );

        let articles = query_articles_for_profile(&conn, profile, 10).expect("query");

        let urls: Vec<&str> = articles
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(
            urls,
            vec![
                "newest-yt-old-publish",
                "old-yt-newly-added",
                "newer-yt-added-earlier"
            ],
            "expected most recently added article first, regardless of publication date"
        );
    }

    #[test]
    fn query_articles_for_profile_uses_profile_rank_before_created_at() {
        let conn = build_in_memory_db();
        let profile = "channel-a";

        // Insertion time says: newest last. Channel rank says the opposite.
        insert_article(&conn, "rank-0", profile, 1_000_000_000_000, None);
        insert_article(&conn, "rank-1", profile, 2_000_000_000_000, None);
        insert_article(&conn, "rank-2", profile, 3_000_000_000_000, None);
        // Highest created_at but never ranked: must fall behind ranked rows.
        insert_article(&conn, "unranked", profile, 9_000_000_000_000, None);
        insert_article(&conn, "other-profile", "channel-b", 9_000_000_000_000, None);

        for (rank, url) in ["rank-0", "rank-1", "rank-2"].iter().enumerate() {
            conn.execute(
                "UPDATE web_articles SET profile_rank = ?1 WHERE url = ?2",
                params![rank as i64, url],
            )
            .expect("set rank");
        }

        let articles = query_articles_for_profile(&conn, profile, 10).expect("query");

        let urls: Vec<&str> = articles
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(
            urls,
            vec!["rank-0", "rank-1", "rank-2", "unranked"],
            "channel-page rank wins over insertion time; unranked rows come last"
        );
    }

    #[test]
    fn apply_profile_article_order_noop_on_empty_urls() {
        let mut conn = build_in_memory_db();
        let profile = "channel-a";

        insert_article(&conn, "keep-rank", profile, 1_000_000_000_000, None);
        conn.execute(
            "UPDATE web_articles SET profile_rank = 4 WHERE url = 'keep-rank'",
            [],
        )
        .expect("seed rank");

        // An empty scrape (scraper hiccup) must not wipe the stored ordering.
        let changed = apply_profile_article_order(&mut conn, profile, &[]).expect("apply");

        assert_eq!(changed, 0);
        let rank: Option<i64> = conn
            .query_row(
                "SELECT profile_rank FROM web_articles WHERE url = 'keep-rank'",
                [],
                |row| row.get(0),
            )
            .expect("read rank");
        assert_eq!(rank, Some(4), "empty url list must be a no-op");
    }

    #[test]
    fn apply_profile_article_order_ranks_scrape_order_and_clears_stale_ranks() {
        let mut conn = build_in_memory_db();
        let profile = "channel-a";

        insert_article(&conn, "a-first", profile, 1_000_000_000_000, None);
        insert_article(&conn, "b-second", profile, 2_000_000_000_000, None);
        // Out of the scrape window now: stale rank must be cleared.
        insert_article(&conn, "c-stale", profile, 3_000_000_000_000, None);
        conn.execute(
            "UPDATE web_articles SET profile_rank = 7 WHERE url = 'c-stale'",
            [],
        )
        .expect("seed stale rank");

        let changed = apply_profile_article_order(
            &mut conn,
            profile,
            &["b-second".to_string(), "a-first".to_string()],
        )
        .expect("apply");

        assert_eq!(changed, 2);
        let rank_of = |url: &str| -> Option<i64> {
            conn.query_row(
                "SELECT profile_rank FROM web_articles WHERE url = ?1",
                [url],
                |row| row.get(0),
            )
            .expect("read rank")
        };
        assert_eq!(rank_of("b-second"), Some(0));
        assert_eq!(rank_of("a-first"), Some(1));
        assert_eq!(rank_of("c-stale"), None, "stale rank is cleared");
    }

    #[test]
    fn list_order_clause_follows_profile_rank_for_profile_listings() {
        let conn = build_in_memory_db();
        let profile = "channel-a";

        insert_article(&conn, "rank-0", profile, 1_000_000_000_000, None);
        insert_article(&conn, "unranked", profile, 3_000_000_000_000, None);
        conn.execute(
            "UPDATE web_articles SET profile_rank = 0 WHERE url = 'rank-0'",
            [],
        )
        .expect("set rank");

        let body = format!(
            "WHERE LOWER(a.profile) = 'channel-a'{}",
            article_order_clause(true)
        );
        let listed = query_articles_sql(&conn, ARTICLE_LIST_COLUMNS, &body, &[]).expect("query");

        let urls: Vec<&str> = listed
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(urls, vec!["rank-0", "unranked"]);
    }

    #[test]
    fn article_id_for_url_extracts_youtube_v_param() {
        assert_eq!(
            article_id_for_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        );
        assert_eq!(
            article_id_for_url("https://youtu.be/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        );
        assert_eq!(
            article_id_for_url("https://youtube.com/watch?v=abc&t=10"),
            "abc"
        );
        assert_eq!(
            article_id_for_url("https://example.com/article?id=123"),
            "https://example.com/article?id=123"
        );
        assert_eq!(article_id_for_url("raw-abc"), "raw-abc");
    }

    #[test]
    fn upsert_article_row_updates_by_id_when_the_url_form_differs() {
        let conn = build_in_memory_db();

        // A legacy row captured before url normalization existed: same video,
        // dirty url (tracking param).
        conn.execute(
            "INSERT INTO web_articles
                (id, url, created_at, title, thumbnail, content, media_directory,
                 main_color, profile, embedding_source_text, updated_at, viewed, date)
             VALUES ('Vaksg4xJqm0',
                     'https://www.youtube.com/watch?v=Vaksg4xJqm0&pp=ugUHEgVlcy1NWA%3D%3D',
                     100, 'legacy title', NULL, NULL, NULL, NULL, 'chan', NULL, 100, 0, NULL)",
            [],
        )
        .expect("insert legacy row");

        let canonical = "https://www.youtube.com/watch?v=Vaksg4xJqm0".to_string();
        upsert_web_store_article_row(
            &conn,
            UpsertWebStoreArticleInput {
                url: canonical.clone(),
                title: Some("New title".to_string()),
                thumbnail: None,
                content: None,
                directory: None,
                main_color: None,
                profile: Some("AndreaTrega".to_string()),
                embedding_source_text: None,
                date: None,
                mode: Some("metadata".to_string()),
            },
        )
        .expect("upsert by canonical url");

        // The legacy row was updated in place: no second row was created.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM web_articles", [], |row| row.get(0))
            .expect("count articles");
        assert_eq!(count, 1);

        let (url, title, profile, mode): (String, String, String, String) = conn
            .query_row(
                "SELECT url, title, profile, mode FROM web_articles WHERE id = 'Vaksg4xJqm0'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read updated row");
        assert_eq!(url, canonical, "the stored url is rewritten to canonical");
        assert_eq!(title, "New title");
        assert_eq!(profile, "andreatrega", "profile is lowercased");
        assert_eq!(mode, "metadata");
    }

    #[test]
    fn upsert_article_row_inserts_when_no_row_matches_url_or_id() {
        let conn = build_in_memory_db();

        upsert_web_store_article_row(
            &conn,
            UpsertWebStoreArticleInput {
                url: "https://www.youtube.com/watch?v=abc123".to_string(),
                title: Some("Fresh".to_string()),
                thumbnail: None,
                content: None,
                directory: None,
                main_color: None,
                profile: None,
                embedding_source_text: None,
                date: None,
                mode: Some("metadata".to_string()),
            },
        )
        .expect("upsert new article");

        let (count, mode): (i64, String) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(mode, '') FROM web_articles",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("count articles");
        assert_eq!(count, 1);
        assert_eq!(mode, "metadata");
    }

    #[test]
    fn find_first_match_snippet_is_case_insensitive_literal() {
        let content = "Intro line\nsay Hello World from the article\noutro";

        let (before, match_text, after) =
            find_first_match_snippet(content, "hello world", 5).expect("match");

        assert_eq!(match_text, "Hello World");
        assert_eq!(before, "say ");
        assert_eq!(after, " from");
    }

    #[test]
    fn find_first_match_snippet_escapes_regex_metacharacters() {
        let content = "price is 100.50 today";

        let (_, match_text, _) =
            find_first_match_snippet(content, "100.50", 10).expect("literal dot match");

        assert_eq!(match_text, "100.50");

        assert!(
            find_first_match_snippet(content, "100X50", 10).is_none(),
            "escaped dot must not match arbitrary characters"
        );
    }

    #[test]
    fn find_first_match_snippet_returns_first_line_only() {
        let content = "nothing here\nsecond line has TARGET\nthird TARGET";

        let (_, match_text, _) = find_first_match_snippet(content, "target", 4).expect("match");

        assert_eq!(match_text, "TARGET");
    }

    #[test]
    fn domain_from_url_strips_www_prefix() {
        assert_eq!(
            domain_from_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ").as_deref(),
            Some("youtube.com")
        );
        assert_eq!(
            domain_from_url("https://youtube.com/watch?v=dQw4w9WgXcQ").as_deref(),
            Some("youtube.com")
        );
        assert_eq!(
            domain_from_url("https://example.com/post").as_deref(),
            Some("example.com")
        );
        assert_eq!(
            domain_from_url("https://m.example.com/post").as_deref(),
            Some("m.example.com")
        );
        assert_eq!(domain_from_url("not a url"), None);
    }

    #[test]
    fn migrate_strip_www_domains_merges_www_domain_into_existing() {
        let conn = build_in_memory_db();
        ensure_web_domain(&conn, "www.youtube.com").expect("ensure www domain");
        ensure_web_domain(&conn, "youtube.com").expect("ensure domain");

        conn.execute(
            "INSERT INTO web_articles (id, url, domain, created_at, title, updated_at, viewed)
             VALUES ('v1', 'https://www.youtube.com/watch?v=v1', 'www.youtube.com', 1, 't1', 1, 0)",
            [],
        )
        .expect("insert article");

        migrate_strip_www_domains(&conn).expect("migrate");

        let www_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = 'www.youtube.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(www_count, 0, "www domain row must be removed");

        let domain: Option<String> = conn
            .query_row(
                "SELECT domain FROM web_articles WHERE id = 'v1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(domain.as_deref(), Some("youtube.com"));
    }

    #[test]
    fn migrate_strip_www_domains_renames_when_target_missing() {
        let conn = build_in_memory_db();
        ensure_web_domain(&conn, "www.example.com").expect("ensure www domain");

        conn.execute(
            "INSERT INTO web_profiles (id, name, domain_id, count, profile_picture, url, updated_at)
             VALUES ('@chan', '@chan', 'www.example.com', 0, NULL, NULL, 1)",
            [],
        )
        .expect("insert profile");

        migrate_strip_www_domains(&conn).expect("migrate");

        let www_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = 'www.example.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(www_count, 0);

        let domain_id: String = conn
            .query_row(
                "SELECT domain_id FROM web_profiles WHERE id = '@chan'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(domain_id, "example.com");

        let domain_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = 'example.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(domain_count, 1);
    }

    #[test]
    fn ensure_web_domain_is_idempotent() {
        let conn = build_in_memory_db();
        ensure_web_domain(&conn, "youtube.com").expect("first insert");
        ensure_web_domain(&conn, "youtube.com").expect("second insert");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = 'youtube.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let picture: Option<String> = conn
            .query_row(
                "SELECT profile_picture FROM web_domains WHERE id = 'youtube.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            picture.as_deref(),
            Some("https://www.google.com/s2/favicons?sz=64&domain=youtube.com")
        );
    }

    #[test]
    fn fresh_init_schema_does_not_seed_youtube_domain() {
        let conn = build_in_memory_db();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM web_domains", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0, "fresh db must not contain seeded domains");
    }

    #[test]
    fn aggregate_domains_skips_articles_without_domain() {
        let conn = build_in_memory_db();
        // raw-text pastes are saved under a `raw-<timestamp>` url, which has no
        // parseable domain, so their `domain` column stays NULL.
        insert_article(&conn, "raw-123", "raw-text", 1_000_000_000_000, None);
        ensure_web_domain(&conn, "youtube.com").expect("ensure domain");
        conn.execute(
            "INSERT INTO web_articles (id, url, domain, created_at, title, updated_at, viewed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?4, 0)",
            params![
                "v1",
                "https://youtube.com/watch?v=v1",
                "youtube.com",
                2_000_000_000_000i64,
                "title-1"
            ],
        )
        .expect("insert article");

        let articles =
            query_articles(&conn, ARTICLE_COLUMNS, None, None, None).expect("query articles");
        let domains = aggregate_domains(articles);

        let ids: Vec<&str> = domains.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["youtube.com"],
            "articles without a domain must not produce a bucket"
        );
        assert!(
            domains.iter().all(|d| d.id != WEB_STORE_UNKNOWN_PROFILE_ID),
            "the synthetic unknown bucket must never be aggregated"
        );
    }

    #[test]
    fn migrate_remove_unknown_profile_domain_removes_stale_bucket() {
        let conn = build_in_memory_db();
        ensure_web_domain(&conn, WEB_STORE_UNKNOWN_PROFILE_ID).expect("insert stale bucket");
        ensure_web_domain(&conn, "youtube.com").expect("insert real domain");

        init_schema(&conn).expect("re-run migrations");

        let stale: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = ?1",
                params![WEB_STORE_UNKNOWN_PROFILE_ID],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stale, 0, "stale unknown bucket must be removed");

        let real: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = 'youtube.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(real, 1, "real domains must be kept");
    }

    #[test]
    fn migrate_remove_unknown_profile_domain_keeps_referenced_bucket() {
        let conn = build_in_memory_db();
        ensure_web_domain(&conn, WEB_STORE_UNKNOWN_PROFILE_ID).expect("insert bucket");
        // A row still referenced by an article cannot be deleted with foreign
        // keys enabled; the guard must leave it in place.
        conn.execute(
            "INSERT INTO web_articles (id, url, domain, created_at, title, updated_at, viewed)
             VALUES ('a1', 'a1', ?1, 1, 'title', 1, 0)",
            params![WEB_STORE_UNKNOWN_PROFILE_ID],
        )
        .expect("insert referencing article");

        init_schema(&conn).expect("re-run migrations");

        let kept: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = ?1",
                params![WEB_STORE_UNKNOWN_PROFILE_ID],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kept, 1, "referenced bucket must not be deleted");
    }

    #[test]
    fn migrate_channels_to_web_profiles_moves_channel_rows() {
        let conn = build_in_memory_db();
        conn.execute(
            "INSERT INTO web_domains (id, name, count, profile_picture, url, updated_at)
             VALUES ('@somechannel', '@somechannel', 3, 'pic.png', 'https://scrap.test/api/profile/youtube/somechannel', 1)",
            [],
        )
        .expect("insert channel domain");

        init_schema(&conn).expect("re-run migrations");

        let domain_id: Option<String> = conn
            .query_row(
                "SELECT domain_id FROM web_profiles WHERE id = '@somechannel'",
                [],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        assert_eq!(domain_id.as_deref(), Some("youtube.com"));

        let channel_gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = '@somechannel'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(channel_gone, 0);

        let youtube_kept: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM web_domains WHERE id = 'youtube.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            youtube_kept, 1,
            "youtube.com must exist because a profile references it"
        );
    }

    #[test]
    fn query_articles_for_domain_returns_domain_articles() {
        let conn = build_in_memory_db();
        ensure_web_domain(&conn, "youtube.com").expect("ensure domain");
        ensure_web_domain(&conn, "example.com").expect("ensure domain");

        let created_at_1: i64 = 1_000_000_000_000;
        let created_at_2: i64 = 2_000_000_000_000;
        let created_at_3: i64 = 3_000_000_000_000;

        conn.execute(
            "INSERT INTO web_articles (id, url, domain, created_at, title, updated_at, viewed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?4, 0)",
            params![
                "v1",
                "https://youtube.com/watch?v=v1",
                "youtube.com",
                created_at_1,
                "title-1"
            ],
        )
        .expect("insert article");
        conn.execute(
            "INSERT INTO web_articles (id, url, domain, created_at, title, updated_at, viewed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?4, 0)",
            params![
                "v2",
                "https://youtube.com/watch?v=v2",
                "youtube.com",
                created_at_2,
                "title-2"
            ],
        )
        .expect("insert article");
        conn.execute(
            "INSERT INTO web_articles (id, url, domain, created_at, title, updated_at, viewed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?4, 0)",
            params![
                "other",
                "https://example.com/post",
                "example.com",
                created_at_3,
                "title-3"
            ],
        )
        .expect("insert article");

        let articles = query_articles_for_domain(&conn, "youtube.com", 10).expect("query");
        let urls: Vec<&str> = articles
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(
            urls,
            vec![
                "https://youtube.com/watch?v=v2",
                "https://youtube.com/watch?v=v1"
            ]
        );

        let articles = query_articles_for_domain(&conn, "example.com", 10).expect("query");
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].domain.as_deref(), Some("example.com"));
    }

    #[test]
    fn save_article_analysis_round_trips_and_replaces_windows() {
        let conn = build_in_memory_db();
        insert_article(&conn, "a1", "chan", 100, None);

        let first = SaveArticleAnalysisInput {
            url: "a1".to_string(),
            summary: Some("first summary".to_string()),
            divisor: Some(4),
            windows: vec![
                ArticleWindowInput {
                    window_index: 0,
                    start_offset: 0,
                    end_offset: 10,
                    payload: r#"{"summary":"w0"}"#.to_string(),
                },
                ArticleWindowInput {
                    window_index: 1,
                    start_offset: 10,
                    end_offset: 20,
                    payload: r#"{"summary":"w1"}"#.to_string(),
                },
            ],
        };

        write_article_analysis(&conn, &first).expect("save analysis");

        let stored = read_article_analysis(&conn, "a1")
            .expect("read analysis")
            .expect("analysis exists");
        assert_eq!(stored.summary.as_deref(), Some("first summary"));
        assert_eq!(stored.divisor, Some(4));
        assert_eq!(stored.mode.as_deref(), Some("full"));
        assert_eq!(stored.windows.len(), 2);
        assert_eq!(stored.windows[0].window_index, 0);
        assert_eq!(stored.windows[1].start_offset, 10);
        assert_eq!(stored.windows[1].payload, r#"{"summary":"w1"}"#);

        // Saving again replaces the previous windows instead of merging them.
        let second = SaveArticleAnalysisInput {
            url: "a1".to_string(),
            summary: Some("second summary".to_string()),
            divisor: Some(8),
            windows: vec![ArticleWindowInput {
                window_index: 0,
                start_offset: 0,
                end_offset: 42,
                payload: r#"{"summary":"only"}"#.to_string(),
            }],
        };

        write_article_analysis(&conn, &second).expect("save analysis again");

        let stored = read_article_analysis(&conn, "a1")
            .expect("read analysis")
            .expect("analysis exists");
        assert_eq!(stored.windows.len(), 1, "windows are replaced, not merged");
        assert_eq!(stored.summary.as_deref(), Some("second summary"));
        assert_eq!(stored.divisor, Some(8));

        let window_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM article_windows", [], |row| row.get(0))
            .expect("count windows");
        assert_eq!(window_count, 1);
    }

    #[test]
    fn read_article_analysis_returns_none_for_unknown_article() {
        let conn = build_in_memory_db();
        assert!(read_article_analysis(&conn, "missing")
            .expect("read")
            .is_none());
    }

    #[test]
    fn delete_bucket_rows_clears_rows_tolerates_missing_urls_and_rebuilds_once() {
        let conn = build_in_memory_db();

        insert_article(&conn, "a1", "chan", 100, None);
        insert_article(&conn, "a2", "chan", 200, None);
        insert_article(&conn, "a3", "other", 300, None);

        for url in ["a1", "a2", "a3", "chan"] {
            conn.execute(
                "INSERT INTO article_windows
                     (id, article_url, window_index, start_offset, end_offset, payload,
                      created_at, updated_at)
                 VALUES (?1, ?2, 0, 0, 1, '{}', 0, 0)",
                params![format!("window-{url}"), url],
            )
            .expect("insert window");
        }

        // "ghost" does not exist: must contribute zero, not fail.
        let deleted_count = delete_bucket_rows(
            &conn,
            &["a1".to_string(), "a2".to_string(), "chan".to_string()],
            &["a1".to_string(), "a2".to_string(), "ghost".to_string()],
        )
        .expect("delete bucket rows");

        assert_eq!(deleted_count, 2);

        let article_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM web_articles", [], |row| row.get(0))
            .expect("count articles");
        assert_eq!(article_count, 1, "only a3 must survive");

        let window_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM article_windows", [], |row| row.get(0))
            .expect("count windows");
        assert_eq!(window_count, 1, "only a3 windows must survive");

        // Domains were rebuilt from the surviving articles exactly once.
        let domain_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM web_domains", [], |row| row.get(0))
            .expect("count domains");
        assert_eq!(domain_count, 0, "no articles carry a domain");
    }

    #[test]
    fn list_articles_without_profile_filters_by_mode() {
        let conn = build_in_memory_db();

        conn.execute(
            "INSERT INTO web_articles (id, url, created_at, title, updated_at, viewed, mode)
             VALUES ('pending', 'https://example.com/pending', 1, 'p', 1, 0, 'metadata')",
            [],
        )
        .expect("insert pending");
        conn.execute(
            "INSERT INTO web_articles (id, url, created_at, title, updated_at, viewed, mode)
             VALUES ('done', 'https://example.com/done', 2, 'd', 2, 0, 'full')",
            [],
        )
        .expect("insert done");
        conn.execute(
            "INSERT INTO web_articles (id, url, created_at, title, updated_at, viewed)
             VALUES ('none', 'https://example.com/none', 3, 'n', 3, 0)",
            [],
        )
        .expect("insert without mode");

        let metadata = query_articles_without_profile(
            &conn,
            &ArticlesWithoutProfileFilter {
                mode: Some("metadata".to_string()),
                only_without_profile: Some(false),
                ..Default::default()
            },
            None,
            None,
        )
        .expect("query metadata");

        assert_eq!(metadata.articles.len(), 1);
        assert_eq!(
            metadata.articles[0].url.as_deref(),
            Some("https://example.com/pending")
        );

        let full = query_articles_without_profile(
            &conn,
            &ArticlesWithoutProfileFilter {
                mode: Some("full".to_string()),
                only_without_profile: Some(false),
                ..Default::default()
            },
            None,
            None,
        )
        .expect("query full");

        assert_eq!(full.articles.len(), 1);
        assert_eq!(
            full.articles[0].url.as_deref(),
            Some("https://example.com/done")
        );

        // Without a mode filter every article is returned, including the ones
        // that were never analysed.
        let all = query_articles_without_profile(
            &conn,
            &ArticlesWithoutProfileFilter {
                only_without_profile: Some(false),
                ..Default::default()
            },
            None,
            None,
        )
        .expect("query all");

        assert_eq!(all.articles.len(), 3);
    }

    #[test]
    fn filter_existing_article_urls_returns_existing_case_sensitive() {
        let conn = build_in_memory_db();
        conn.execute(
            "INSERT INTO web_articles (id, url, created_at, title, updated_at, viewed) VALUES (?1, ?2, ?3, ?4, ?3, 0)",
            params!["v1", "https://www.youtube.com/watch?v=AbC123XyZ", 1, "t1"],
        )
        .expect("insert");
        conn.execute(
            "INSERT INTO web_articles (id, url, created_at, title, updated_at, viewed) VALUES (?1, ?2, ?3, ?4, ?3, 0)",
            params!["v2", "https://www.youtube.com/watch?v=abc123xyz", 2, "t2"],
        )
        .expect("insert");

        // exact match preserves v case, case-variant is distinct
        let urls = vec![
            "https://www.youtube.com/watch?v=AbC123XyZ".to_string(),
            "https://www.youtube.com/watch?v=abc123xyz".to_string(),
            "https://www.youtube.com/watch?v=ABC123XYZ".to_string(),
            "https://www.youtube.com/watch?v=missing".to_string(),
        ];
        let placeholders = urls.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "SELECT url FROM web_articles WHERE url IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql).expect("prepare");
        let rows = stmt
            .query_map(rusqlite::params_from_iter(urls.iter()), |r| {
                r.get::<_, String>(0)
            })
            .expect("query");
        let mut existing: Vec<String> = rows.map(|r| r.expect("row")).collect();
        existing.sort();
        assert_eq!(
            existing,
            vec![
                "https://www.youtube.com/watch?v=AbC123XyZ",
                "https://www.youtube.com/watch?v=abc123xyz"
            ]
        );
        // ensure case-variant not falsely matched
        assert!(!existing.contains(&"https://www.youtube.com/watch?v=ABC123XYZ".to_string()));
    }

    #[test]
    fn filter_existing_article_urls_is_case_sensitive_via_helper() {
        let conn = build_in_memory_db();
        conn.execute(
            "INSERT INTO web_articles (id, url, created_at, title, updated_at, viewed) VALUES (?1, ?2, ?3, ?4, ?3, 0)",
            params!["v1", "https://www.youtube.com/watch?v=AbC", 1, "t1"],
        )
        .expect("insert");
        let urls = vec!["https://www.youtube.com/watch?v=abc".to_string()];
        let placeholders = urls.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "SELECT url FROM web_articles WHERE url IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql).expect("prepare");
        let rows = stmt
            .query_map(rusqlite::params_from_iter(urls.iter()), |r| {
                r.get::<_, String>(0)
            })
            .expect("query");
        let existing: Vec<String> = rows.map(|r| r.expect("row")).collect();
        assert!(
            existing.is_empty(),
            "lowercased v should not match stored mixed-case ID"
        );
    }

    fn insert_exemplar(
        conn: &Connection,
        id: &str,
        category_id: &str,
        article_url: &str,
        text: &str,
        model_name: &str,
    ) {
        conn.execute(
            "INSERT INTO category_exemplars
                (id, category_id, article_url, text, model_name, model_dimensions, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1024, 0, 0)",
            params![id, category_id, article_url, text, model_name],
        )
        .expect("insert exemplar");
    }

    fn insert_window_exemplar(
        conn: &Connection,
        id: &str,
        category_id: &str,
        article_url: &str,
        window_index: i32,
        text: &str,
    ) {
        conn.execute(
            "INSERT INTO category_exemplars
                (id, category_id, article_url, window_index, text, model_name, model_dimensions, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'bge-m3', 1024, 0, 0)",
            params![id, category_id, article_url, window_index, text],
        )
        .expect("insert window exemplar");
    }

    #[test]
    fn category_exemplar_upsert_replaces_same_article_and_exposes_title() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_article(&conn, "https://example.com/a", "channel", 1_000, None);
        insert_exemplar(
            &conn,
            "e1",
            "cat-a",
            "https://example.com/a",
            "rust, ownership",
            "bge-m3",
        );

        // Same (category_id, article_url, window_index) triple must update in
        // place, keeping id.
        conn.execute(
            "INSERT INTO category_exemplars
                (id, category_id, article_url, text, model_name, model_dimensions, created_at, updated_at)
             VALUES ('e2', 'cat-a', 'https://example.com/a', 'python, pandas', 'bge-m3', 1024, 20, 20)
             ON CONFLICT(category_id, article_url, window_index) DO UPDATE SET
                text = excluded.text,
                model_name = excluded.model_name,
                model_dimensions = excluded.model_dimensions,
                updated_at = excluded.updated_at",
            [],
        )
        .expect("upsert exemplar");

        let rows =
            query_category_exemplars(&conn, "WHERE e.category_id = ?1", &[&"cat-a"]).expect("list");
        assert_eq!(rows.len(), 1, "upsert must not duplicate the pair");
        assert_eq!(rows[0].id, "e1", "conflict must keep the original id");
        assert_eq!(rows[0].text, "python, pandas");
        assert_eq!(
            rows[0].article_title.as_deref(),
            Some("title-https://example.com/a"),
            "list must surface the joined article title"
        );
    }

    #[test]
    fn category_exemplar_windows_coexist_and_replace_per_window() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_article(&conn, "https://example.com/a", "channel", 1_000, None);

        insert_window_exemplar(
            &conn,
            "e0",
            "cat-a",
            "https://example.com/a",
            0,
            "final summary",
        );
        insert_window_exemplar(
            &conn,
            "e1",
            "cat-a",
            "https://example.com/a",
            1,
            "window one",
        );
        insert_window_exemplar(
            &conn,
            "e2",
            "cat-a",
            "https://example.com/a",
            2,
            "window two",
        );

        let rows =
            query_category_exemplars(&conn, "WHERE e.category_id = ?1", &[&"cat-a"]).expect("list");
        assert_eq!(rows.len(), 3, "each window must keep its own row");

        // Re-feeding the same window replaces it in place and keeps its id.
        conn.execute(
            "INSERT INTO category_exemplars
                (id, category_id, article_url, window_index, text, model_name, model_dimensions, created_at, updated_at)
             VALUES ('e-new', 'cat-a', 'https://example.com/a', 1, 'window one v2', 'bge-m3', 1024, 30, 30)
             ON CONFLICT(category_id, article_url, window_index) DO UPDATE SET
                text = excluded.text,
                updated_at = excluded.updated_at",
            [],
        )
        .expect("upsert window exemplar");

        let rows =
            query_category_exemplars(&conn, "WHERE e.category_id = ?1", &[&"cat-a"]).expect("list");
        assert_eq!(rows.len(), 3, "upsert must not add a window");
        let updated = rows
            .iter()
            .find(|row| row.window_index == 1)
            .expect("window one row");
        assert_eq!(updated.id, "e1", "conflict must keep the original id");
        assert_eq!(updated.text, "window one v2");
    }

    #[test]
    fn delete_category_exemplars_for_article_removes_all_windows() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_window_exemplar(&conn, "e0", "cat-a", "https://example.com/a", 0, "final");
        insert_window_exemplar(&conn, "e1", "cat-a", "https://example.com/a", 1, "window");
        insert_window_exemplar(
            &conn,
            "e2",
            "cat-a",
            "https://example.com/b",
            0,
            "other article",
        );

        let mut removed =
            delete_category_exemplars_for_article_rows(&conn, "cat-a", "https://example.com/a")
                .expect("delete windows");
        removed.sort();

        assert_eq!(removed, vec!["e0".to_string(), "e1".to_string()]);
        let remaining =
            query_category_exemplars(&conn, "WHERE e.category_id = ?1", &[&"cat-a"]).expect("list");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].article_url, "https://example.com/b");
    }

    #[test]
    fn migrate_category_exemplars_window_index_rebuilds_legacy_table() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE category_exemplars (
                id TEXT PRIMARY KEY,
                category_id TEXT NOT NULL,
                article_url TEXT NOT NULL,
                text TEXT NOT NULL,
                model_name TEXT,
                model_dimensions INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE (category_id, article_url)
            );
            CREATE INDEX idx_category_exemplars_category_id
                ON category_exemplars(category_id);
            INSERT INTO category_exemplars
                (id, category_id, article_url, text, model_name, model_dimensions, created_at, updated_at)
            VALUES ('e1', 'cat-a', 'https://example.com/a', 'old text', 'bge-m3', 1024, 5, 5);
            PRAGMA user_version = 1;",
        )
        .expect("legacy schema");

        init_schema(&conn).expect("init schema");

        assert!(
            table_has_column(&conn, "category_exemplars", "window_index"),
            "migration must add the window index column"
        );
        let rows =
            query_category_exemplars(&conn, "WHERE e.category_id = ?1", &[&"cat-a"]).expect("list");
        assert_eq!(rows.len(), 1, "existing exemplars must survive the rebuild");
        assert_eq!(rows[0].window_index, 0);
        assert_eq!(rows[0].text, "old text");

        insert_window_exemplar(
            &conn,
            "e2",
            "cat-a",
            "https://example.com/a",
            1,
            "second window",
        );
        let rows =
            query_category_exemplars(&conn, "WHERE e.category_id = ?1", &[&"cat-a"]).expect("list");
        assert_eq!(
            rows.len(),
            2,
            "new key must allow several windows per article"
        );
    }

    #[test]
    fn delete_category_rows_cascades_to_exemplars_and_links() {
        let mut conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_article(&conn, "https://example.com/a", "channel", 1_000, None);
        link_article_to_category(&conn, "https://example.com/a", "cat-a");
        insert_profile_row(&conn, "channel", "example.com");
        link_profile_to_category(&conn, "channel", "cat-a");
        insert_exemplar(
            &conn,
            "e1",
            "cat-a",
            "https://example.com/a",
            "text",
            "bge-m3",
        );

        delete_category_rows(&mut conn, "cat-a").expect("delete category");

        let exemplar_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM category_exemplars", [], |r| r.get(0))
            .expect("count exemplars");
        let link_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM article_category", [], |r| r.get(0))
            .expect("count links");
        let profile_link_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM profile_category", [], |r| r.get(0))
            .expect("count profile links");
        let category_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM web_categories", [], |r| r.get(0))
            .expect("count categories");

        assert_eq!(exemplar_count, 0);
        assert_eq!(link_count, 0);
        assert_eq!(profile_link_count, 0);
        assert_eq!(category_count, 0);
    }

    /// Replace-all: the input is the full desired set, so unassigned pills
    /// disappear. The key is stored lowercase and read case-insensitively.
    #[test]
    fn assign_profile_categories_replaces_the_whole_set() {
        let mut conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_category(&conn, "cat-b", "Beta");

        assign_profile_categories(&mut conn, "ChannelOne", &["cat-a".into(), "cat-b".into()])
            .expect("assign both");
        assign_profile_categories(&mut conn, "ChannelOne", &["cat-b".into()]).expect("replace");

        let stored: Vec<String> = query_profile_categories(&conn, "channelone").expect("read back");
        assert_eq!(stored, vec!["cat-b".to_string()]);

        // One canonical row per profile: replace-all left exactly the desired
        // set, with no case-variant duplicate key.
        let row_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM profile_category", [], |r| r.get(0))
            .expect("count rows");
        assert_eq!(row_count, 1);
    }

    #[test]
    fn assign_profile_categories_rejects_unknown_or_deleted_categories() {
        let mut conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");

        let unknown = assign_profile_categories(&mut conn, "channel", &["nope".into()]);
        assert!(unknown.is_err(), "unknown category must be rejected");

        delete_category_rows(&mut conn, "cat-a").expect("delete category");
        let deleted = assign_profile_categories(&mut conn, "channel", &["cat-a".into()]);
        assert!(deleted.is_err(), "deleted category must be rejected");
    }

    /// Q5 semantics: filtering reads stored links only — never the categories
    /// of the entity's articles.
    #[test]
    fn category_filters_read_stored_links_not_article_categories() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");

        // Domain with a categorized article but no link of its own: not a match.
        insert_article_with_domain(&conn, "art-1", None, Some("linked-less.com"), 1_000);
        link_article_to_category(&conn, "art-1", "cat-a");

        // Domain tagged directly (no articles at all): match.
        insert_domain_row(&conn, "tagged.com");

        // Channel tagged directly: match. Channel with a categorized article: not.
        insert_profile_row(&conn, "tagged-channel", "tagged.com");
        insert_profile_row(&conn, "article-channel", "linked-less.com");
        insert_article(&conn, "art-2", "article-channel", 1_000, None);
        link_article_to_category(&conn, "art-2", "cat-a");

        link_profile_to_category(&conn, "tagged.com", "cat-a");
        link_profile_to_category(&conn, "tagged-channel", "cat-a");

        let cats = ["cat-a".to_string()];
        let domains = query_domains_filtered(&conn, Some(&cats), None, false, None, None)
            .expect("domains by category");
        let domain_ids: Vec<&str> = domains.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(domain_ids, vec!["tagged.com"], "only stored links match");

        let profiles = query_profiles_filtered(&conn, None, Some(&cats), false, None, None)
            .expect("profiles by category");
        let profile_ids: Vec<&str> = profiles.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            profile_ids, vec!["tagged-channel"],
            "only stored links match"
        );
    }

    /// Deleting a profile/domain removes only its own links; a shared category
    /// stays alive for everyone else (Q7: removal never takes a live category
    /// away from another profile).
    #[test]
    fn delete_profile_and_domain_cascade_only_their_own_links() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_profile_row(&conn, "keep-channel", "keep.com");
        insert_profile_row(&conn, "drop-channel", "drop.com");
        link_profile_to_category(&conn, "keep.com", "cat-a");
        link_profile_to_category(&conn, "keep-channel", "cat-a");
        link_profile_to_category(&conn, "drop.com", "cat-a");
        link_profile_to_category(&conn, "drop-channel", "cat-a");

        delete_profile(&conn, "drop-channel").expect("delete channel");

        let after_profile = query_profile_categories(&conn, "drop-channel").expect("read");
        assert!(after_profile.is_empty(), "profile links must be gone");

        delete_domain(&conn, "drop.com").expect("delete domain");
        let after_domain = query_profile_categories(&conn, "drop.com").expect("read");
        assert!(after_domain.is_empty(), "domain links must be gone");

        // The survivor keeps its link and the category itself stays.
        assert_eq!(
            query_profile_categories(&conn, "keep-channel").expect("read"),
            vec!["cat-a".to_string()]
        );
        let category_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM web_categories", [], |r| r.get(0))
            .expect("count categories");
        assert_eq!(category_count, 1, "category must survive a profile delete");
    }

    #[test]
    fn category_exemplar_model_status_flags_stale_rows() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_exemplar(&conn, "e1", "cat-a", "a", "text", "bge-m3");
        insert_exemplar(&conn, "e2", "cat-a", "b", "text", "bge-m3");

        let same =
            category_exemplar_model_status(&conn, "bge-m3", Some(1024)).expect("status same");
        assert_eq!((same.total, same.matching), (2, 2));

        let stale =
            category_exemplar_model_status(&conn, "other-model", Some(1024)).expect("status stale");
        assert_eq!((stale.total, stale.matching), (2, 0));
    }

    #[test]
    fn migrate_clear_category_exemplars_drops_old_text_once() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_exemplar(&conn, "e1", "cat-a", "a", "old keywords", "bge-m3");

        // Simulate a database created before the representation change.
        conn.execute_batch("PRAGMA user_version = 0")
            .expect("reset version");
        init_schema(&conn).expect("init schema");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM category_exemplars", [], |r| r.get(0))
            .expect("count");
        assert_eq!(count, 0, "old exemplars must be cleared once");

        // Later inits must not clear exemplars added with the new representation.
        insert_exemplar(&conn, "e2", "cat-a", "b", "new text", "bge-m3");
        init_schema(&conn).expect("init schema again");
        let count_after: i64 = conn
            .query_row("SELECT COUNT(*) FROM category_exemplars", [], |r| r.get(0))
            .expect("count");
        assert_eq!(count_after, 1, "new exemplars must survive later inits");
    }

    fn insert_domain_row(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO web_domains (id, name, count, profile_picture, url, updated_at)
             VALUES (?1, ?1, 0, NULL, NULL, 0)",
            params![id],
        )
        .expect("insert domain");
    }

    fn insert_article_with_domain(
        conn: &Connection,
        id: &str,
        profile: Option<&str>,
        domain: Option<&str>,
        created_at: i64,
    ) {
        if let Some(domain_id) = domain {
            insert_domain_row(conn, domain_id);
        }
        conn.execute(
            "INSERT INTO web_articles
                (id, url, created_at, title, thumbnail, content, media_directory,
                 main_color, profile, domain, embedding_source_text, updated_at, viewed, date)
             VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, NULL, ?5, ?6, NULL, ?3, 0, NULL)",
            params![id, id, created_at, format!("title-{}", id), profile, domain],
        )
        .expect("insert article with domain");
    }

    fn list_urls(conn: &Connection, filter: &ArticlesWithoutProfileFilter) -> Vec<String> {
        let result = query_articles_without_profile(conn, filter, Some(0), Some(50))
            .expect("query articles without profile");
        result
            .articles
            .iter()
            .map(|a| a.url.clone().unwrap_or_default())
            .collect()
    }

    #[test]
    fn query_articles_without_profile_facets_match_their_own_column() {
        let conn = build_in_memory_db();
        insert_article_with_domain(&conn, "a-p", Some("alpha"), None, 1);
        insert_article_with_domain(&conn, "a-d", None, Some("gamma.com"), 2);
        insert_article_with_domain(&conn, "a-both", Some("alpha"), Some("gamma.com"), 3);
        insert_article_with_domain(&conn, "a-other", Some("beta"), None, 4);

        // Profile facet only matches a.profile, ignoring domains.
        // Results are ordered by created_at DESC.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                profile_ids: Some(vec!["alpha".into()]),
                only_without_profile: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-both", "a-p"]);

        // Domain facet only matches a.domain, ignoring profiles.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                domain_ids: Some(vec!["gamma.com".into()]),
                only_without_profile: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-both", "a-d"]);

        // Ids are matched case-insensitively after trimming.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                profile_ids: Some(vec!["  ALPHA ".into()]),
                only_without_profile: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-both", "a-p"]);
    }

    #[test]
    fn query_articles_without_profile_facets_or_within_and_across_kinds() {
        let conn = build_in_memory_db();
        insert_article_with_domain(&conn, "a-p", Some("alpha"), None, 1);
        insert_article_with_domain(&conn, "a-p2", Some("beta"), None, 2);
        insert_article_with_domain(&conn, "a-both", Some("beta"), Some("gamma.com"), 3);
        insert_article_with_domain(&conn, "a-d", None, Some("gamma.com"), 4);

        // Two profile ids: OR within the kind.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                profile_ids: Some(vec!["alpha".into(), "beta".into()]),
                only_without_profile: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-both", "a-p2", "a-p"]);

        // Profile AND domain lists: intersection across kinds.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                profile_ids: Some(vec!["beta".into()]),
                domain_ids: Some(vec!["gamma.com".into()]),
                only_without_profile: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-both"]);
    }

    #[test]
    fn query_articles_without_profile_facets_combine_with_categories() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_article_with_domain(&conn, "a-1", Some("alpha"), None, 1);
        insert_article_with_domain(&conn, "a-2", Some("alpha"), None, 2);
        insert_article_with_domain(&conn, "a-3", Some("beta"), None, 3);
        link_article_to_category(&conn, "a-1", "cat-a");
        link_article_to_category(&conn, "a-3", "cat-a");

        // Category facet alone: every linked article.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                category_ids: Some(vec!["cat-a".into()]),
                only_without_profile: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-3", "a-1"]);

        // Profile AND category: only the intersection survives.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                profile_ids: Some(vec!["alpha".into()]),
                category_ids: Some(vec!["cat-a".into()]),
                only_without_profile: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-1"]);
    }

    #[test]
    fn query_articles_without_profile_empty_facets_keep_default_filters() {
        let conn = build_in_memory_db();
        insert_article_with_domain(&conn, "a-profiled", Some("alpha"), None, 1);
        insert_article_with_domain(&conn, "a-bare", None, None, 2);

        // Empty facet lists mean "not applied": the profile-less default holds.
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                profile_ids: Some(Vec::new()),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-bare"]);

        // The legacy single profile_id keeps its either-kind match.
        insert_article_with_domain(&conn, "a-dom", None, Some("alpha"), 3);
        let urls = list_urls(
            &conn,
            &ArticlesWithoutProfileFilter {
                profile_id: Some("alpha".into()),
                ..Default::default()
            },
        );
        assert_eq!(urls, vec!["a-dom", "a-profiled"]);
    }
}
