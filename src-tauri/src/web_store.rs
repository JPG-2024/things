use std::fs;
use std::collections::HashMap;
use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use tauri::{AppHandle, Manager};

const DB_FILE:&str = "things.db";
pub const WEB_STORE_UNKNOWN_PROFILE_ID: &str = "__unknown_profile__";
pub const WEB_STORE_UNKNOWN_PROFILE_LABEL: &str = "Unknown profile";

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
    pub primary_color: Option<String>,
    pub updated_at: i64,
    pub embedding_source_text: Option<String>,
    pub viewed: bool,
    pub date: Option<String>,
    pub profile_picture: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreProfileRecord {
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
pub struct WebStoreProfileDeletion {
    pub success: bool,
    pub deleted_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProfile {
    pub id: String,
    pub videos: Vec<String>,
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
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    Ok(app_data_dir.join(DB_FILE).to_string_lossy().to_string())
}

fn raw_content_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("raw_content");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
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

fn get_db(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let conn = Connection::open(&path).map_err(|error| error.to_string())?;
    
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;"
    ).map_err(|error| error.to_string())?;
    
    Ok(conn)
}

fn init_schema(conn:&Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS web_articles (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
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
            date TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_web_articles_url ON web_articles(url);
        CREATE INDEX IF NOT EXISTS idx_web_articles_profile ON web_articles(profile);

        CREATE TABLE IF NOT EXISTS web_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            profile_picture TEXT,
            url TEXT,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS web_tasks (
            url TEXT PRIMARY KEY,
            tasks_json TEXT NOT NULL DEFAULT '[]',
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS web_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            last_modified INTEGER NOT NULL,
            deleted_at INTEGER
        );

        DROP TABLE IF EXISTS profile_category;

        CREATE TABLE IF NOT EXISTS article_category (
            article_url TEXT NOT NULL,
            category_id TEXT NOT NULL,
            PRIMARY KEY (article_url, category_id),
            FOREIGN KEY (category_id) REFERENCES web_categories(id)
        );

        CREATE INDEX IF NOT EXISTS idx_article_category_category_id ON article_category(category_id);

        CREATE TABLE IF NOT EXISTS web_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            tasks_json TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS web_profile_templates (
            profile_id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (profile_id) REFERENCES web_profiles(id),
            FOREIGN KEY (template_id) REFERENCES web_templates(id)
        );"
    ).map_err(|error| error.to_string())?;

    migrate_legacy_tables(conn)?;
    migrate_profile_url_column(conn)?;
    migrate_viewed_column(conn)?;
    migrate_date_column(conn)?;
    migrate_category_description_column(conn)?;
    migrate_drop_last_video_date_column(conn)?;

    Ok(())
}

fn migrate_legacy_tables(conn:&Connection) -> Result<(), String> {
    let has_old_articles: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='articles'",
        [],
        |row| row.get(0),
    ).unwrap_or(false);

    if !has_old_articles {
        return Ok(());
    }

    conn.execute_batch(
        "ALTER TABLE articles RENAME TO old_articles;
         ALTER TABLE profiles RENAME TO old_profiles;"
    ).map_err(|error| error.to_string())?;

    conn.execute_batch(
        "INSERT OR IGNORE INTO web_articles (id, url, created_at, title, thumbnail, content, 
                media_directory, main_color, profile, embedding_source_text, updated_at)
         SELECT id, url, created_at, title, thumbnail, content, 
                media_directory, main_color, profile, embedding_source_text, updated_at
         FROM old_articles;"
    ).map_err(|error| error.to_string())?;

    conn.execute_batch(
        "INSERT OR IGNORE INTO web_profiles (id, name, count, profile_picture, updated_at)
         SELECT id, name, count, profile_picture, updated_at
         FROM old_profiles;"
    ).map_err(|error| error.to_string())?;

    conn.execute_batch(
        "INSERT OR IGNORE INTO web_tasks (url, tasks_json, updated_at)
         SELECT url, tasks_json, updated_at
         FROM old_articles
         WHERE tasks_json IS NOT NULL AND tasks_json != '[]';"
    ).map_err(|error| error.to_string())?;

    conn.execute_batch(
        "DROP TABLE old_articles;
         DROP TABLE old_profiles;"
    ).map_err(|error| error.to_string())?;

    Ok(())
}

fn migrate_profile_url_column(conn:&Connection) -> Result<(), String> {
    let has_url_column: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('web_profiles') WHERE name='url'",
        [],
        |row| row.get(0),
    ).unwrap_or(false);

    if !has_url_column {
        conn.execute_batch("ALTER TABLE web_profiles ADD COLUMN url TEXT")
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn migrate_viewed_column(conn:&Connection) -> Result<(), String> {
    let has_viewed_column: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('web_articles') WHERE name='viewed'",
        [],
        |row| row.get(0),
    ).unwrap_or(false);

    if !has_viewed_column {
        conn.execute_batch("ALTER TABLE web_articles ADD COLUMN viewed INTEGER NOT NULL DEFAULT 0")
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn migrate_date_column(conn:&Connection) -> Result<(), String> {
    let has_date_column: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('web_articles') WHERE name='date'",
        [],
        |row| row.get(0),
    ).unwrap_or(false);

    if !has_date_column {
        conn.execute_batch("ALTER TABLE web_articles ADD COLUMN date TEXT")
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn migrate_category_description_column(conn:&Connection) -> Result<(), String> {
    let has_description_column: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('web_categories') WHERE name='description'",
        [],
        |row| row.get(0),
    ).unwrap_or(false);

    if !has_description_column {
        conn.execute_batch("ALTER TABLE web_categories ADD COLUMN description TEXT")
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn migrate_drop_last_video_date_column(conn:&Connection) -> Result<(), String> {
    let has_last_video_date_column: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('web_profiles') WHERE name='last_video_date'",
        [],
        |row| row.get(0),
    ).unwrap_or(false);

    if has_last_video_date_column {
        conn.execute_batch("ALTER TABLE web_profiles DROP COLUMN last_video_date")
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

fn filter_record_to_json(record:&WebStoreArticleRecord, fields: &Option<Vec<String>>) -> Value {
    match fields {
        None => {
            serde_json::to_value(record).unwrap_or(Value::Null)
        }
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

fn aggregate_profiles(records: Vec<WebStoreArticleRecord>) -> Vec<WebStoreProfileRecord> {
    let mut aggregated = HashMap::<String, WebStoreProfileRecord>::new();

    for record in records {
        let (raw_id, name) = normalize_profile_bucket(record.profile.as_deref());
        let id = raw_id.to_lowercase();
        let display_name = if id == WEB_STORE_UNKNOWN_PROFILE_ID {
            name
        } else {
            name.to_lowercase()
        };
        aggregated
            .entry(id.clone())
            .and_modify(|profile| {
                profile.count += 1;
            })
            .or_insert(WebStoreProfileRecord {
                id,
                name: display_name,
                count: 1,
                profile_picture: None,
                url: None,
                most_recent_created_at: None,
                articles: None,
            });
    }

    let mut profiles = aggregated.into_values().collect::<Vec<_>>();
    profiles.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.name.cmp(&right.name))
    });
    profiles
}

fn sort_articles_by_created_at_desc(records: &mut [WebStoreArticleRecord]) {
    records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
}

fn row_to_stored_article(row: &rusqlite::Row<'_>) -> Result<WebStoreArticleRecord, rusqlite::Error> {
    let id: String = row.get(0)?;
    let url: String = row.get(1)?;
    let created_at: i64 = row.get(2)?;
    let title: Option<String> = row.get(3)?;
    let thumbnail: Option<String> = row.get(4)?;
    let content: Option<String> = row.get(5)?;
    let media_directory: Option<String> = row.get(6)?;
    let main_color: Option<String> = row.get(7)?;
    let profile: Option<String> = row.get(8)?;
    let embedding_source_text: Option<String> = row.get(9)?;
    let updated_at: i64 = row.get(10)?;
    let viewed_int: i64 = row.get(11)?;
    let date: Option<String> = row.get(12)?;
    let profile_picture: Option<String> = row.get(13)?;

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
        primary_color: main_color,
        updated_at,
        embedding_source_text,
        viewed: viewed_int != 0,
        date,
        profile_picture,
    })
}

fn query_articles(
    conn: &Connection,
    filter: Option<&str>,
    limit: Option<usize>,
    sort: Option<&str>,
) -> Result<Vec<WebStoreArticleRecord>, String> {
    let mut sql = String::from(
        "SELECT id, url, created_at, title, thumbnail, content,
                media_directory, main_color, profile, embedding_source_text, updated_at,
                viewed, date,
                (SELECT p.profile_picture FROM web_profiles p WHERE LOWER(p.id) = LOWER(web_articles.profile)) AS profile_picture
         FROM web_articles"
    );
    
    if let Some(f) = filter {
        sql.push_str(" WHERE ");
        sql.push_str(f);
    }
    
    match sort {
        Some("date") => sql.push_str(" ORDER BY date IS NULL, date DESC"),
        _ => sql.push_str(" ORDER BY created_at DESC"),
    }
    
    if let Some(lim) = limit {
        sql.push_str(&format!(" LIMIT {}", lim));
    }

    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let article_iter = stmt
        .query_map([], row_to_stored_article)
        .map_err(|error| error.to_string())?;

    let mut records = Vec::new();
    for article_result in article_iter {
        records.push(article_result.map_err(|error| error.to_string())?);
    }

    Ok(records)
}

fn query_profile_by_id(conn: &Connection, profile_id: &str) -> Result<Option<WebStoreProfileRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, count, profile_picture, url,
                    (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.profile) = LOWER(web_profiles.id)) AS max_created_at
             FROM web_profiles WHERE id = ?1 COLLATE NOCASE",
        )
        .map_err(|error| error.to_string())?;

    let mut rows = stmt
        .query_map([profile_id], |row| {
            Ok(WebStoreProfileRecord {
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

fn query_profiles(conn: &Connection) -> Result<Vec<WebStoreProfileRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, count, profile_picture, url,
                    (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.profile) = LOWER(web_profiles.id)) AS max_created_at
             FROM web_profiles ORDER BY count DESC, name ASC",
        )
        .map_err(|error| error.to_string())?;

    let profile_iter = stmt
        .query_map([], |row| {
            Ok(WebStoreProfileRecord {
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

    let mut profiles = Vec::new();
    for profile_result in profile_iter {
        profiles.push(profile_result.map_err(|error| error.to_string())?);
    }

    Ok(profiles)
}

fn upsert_profile(
    conn: &Connection,
    profile: &WebStoreProfileRecord,
) -> Result<(), String> {
    let updated_at = chrono_like_now();
    conn.execute(
        "INSERT INTO web_profiles (id, name, count, profile_picture, url, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET 
           name = excluded.name,
           count = excluded.count,
           profile_picture = excluded.profile_picture,
           url = excluded.url,
           updated_at = excluded.updated_at",
        params![
            profile.id,
            profile.name,
            profile.count,
            profile.profile_picture,
            profile.url,
            updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn delete_profile(conn:&Connection, profile_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM web_profile_templates WHERE profile_id = ?1",
        params![profile_id]
    ).map_err(|error| error.to_string())?;
    
    conn.execute("DELETE FROM web_profiles WHERE id = ?1", params![profile_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn rebuild_profiles_from_articles(
    conn: &Connection,
    profile_picture_input: Option<(String, String)>,
) -> Result<(), String> {
    let existing_profiles = query_profiles(conn)?;
    let existing_pictures: HashMap<String, Option<String>> = existing_profiles
        .into_iter()
        .map(|p| (p.id, p.profile_picture))
        .collect();

    let all_articles = query_articles(conn, None, None, None)?;
    let mut aggregated = aggregate_profiles(all_articles);

    for profile in &mut aggregated {
        if profile.profile_picture.is_none() {
            if let Some(existing_picture) = existing_pictures.get(&profile.id) {
                profile.profile_picture = existing_picture.clone();
            }
        }
    }

    if let Some((profile_id, picture)) = profile_picture_input {
        if let Some(profile) = aggregated.iter_mut().find(|p| p.id == profile_id) {
            profile.profile_picture = Some(picture);
        } else {
            aggregated.push(WebStoreProfileRecord {
                id: profile_id,
                name: String::new(),
                count: 0,
                profile_picture: Some(picture),
                url: None,
                most_recent_created_at: None,
                articles: None,
            });
        }
    }

    for profile in&aggregated {
        upsert_profile(conn, profile)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn list_web_store_articles(
    app: AppHandle,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;
    let records = query_articles(&conn, None, None, None)?;
    Ok(records
        .iter()
        .map(|record| filter_record_to_json(record, &fields))
        .collect())
}

fn query_profiles_filtered(
    conn: &Connection,
    category_ids: Option<&[String]>,
    created_at_from: Option<i64>,
    include_articles: bool,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<WebStoreProfileRecord>, String> {
    let mut sql = String::from(
        "SELECT p.id, p.name, p.count, p.profile_picture, p.url,
                (SELECT MAX(a2.created_at) FROM web_articles a2 WHERE LOWER(a2.profile) = LOWER(p.id)) AS max_created_at
         FROM web_profiles p",
    );

    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if include_articles {
        where_clauses.push(
            "EXISTS (SELECT 1 FROM web_articles a WHERE LOWER(a.profile) = LOWER(p.id) AND a.profile IS NOT NULL)"
                .to_string(),
        );
    }

    if let Some(cats) = category_ids {
        if !cats.is_empty() {
            let placeholders = cats.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            where_clauses.push(format!(
                "LOWER(p.id) IN (
                    SELECT DISTINCT LOWER(a.profile)
                    FROM web_articles a
                    INNER JOIN article_category ac ON ac.article_url = a.url
                    INNER JOIN web_categories c ON ac.category_id = c.id
                    WHERE ac.category_id IN ({}) AND c.deleted_at IS NULL AND a.profile IS NOT NULL
                )",
                placeholders
            ));
            for id in cats {
                params.push(Box::new(id.clone()));
            }
        }
    }

    if let Some(from) = created_at_from {
        where_clauses.push(
            "(SELECT MAX(a3.created_at) FROM web_articles a3 WHERE LOWER(a3.profile) = LOWER(p.id)) >= ?"
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
    let profile_rows = stmt
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            |row| {
                Ok(WebStoreProfileRecord {
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

    let mut profiles = Vec::new();
    for profile_result in profile_rows {
        profiles.push(profile_result.map_err(|error| error.to_string())?);
    }

    Ok(profiles)
}

#[tauri::command]
pub async fn list_web_store_profiles(
    app: AppHandle,
    category_ids: Option<Vec<String>>,
    created_at_from: Option<i64>,
    include_articles: Option<bool>,
    article_count: Option<usize>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<WebStoreProfileRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let include = include_articles.unwrap_or(false);
    let mut profiles = query_profiles_filtered(
        &conn,
        category_ids.as_deref(),
        created_at_from,
        include,
        offset,
        limit,
    )?;

    if profiles.is_empty() && !include {
        let aggregated = aggregate_profiles(query_articles(&conn, None, None, None)?);
        for profile in &aggregated {
            upsert_profile(&conn, profile)?;
        }
        profiles = query_profiles_filtered(
            &conn,
            category_ids.as_deref(),
            created_at_from,
            include,
            offset,
            limit,
        )?;
    }

    if include {
        let per_profile_count = article_count.unwrap_or(10);
        for profile in &mut profiles {
            profile.articles = Some(query_articles_for_profile(&conn, &profile.id, per_profile_count)?);
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
    init_schema(&conn)?;
    query_profile_by_id(&conn, &profile_id)
}

async fn list_web_store_articles_by_profile(
    app: AppHandle,
    profile_id: String,
    date_from: Option<String>,
    limit: Option<usize>,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let normalized_profile_id = profile_id.trim().to_lowercase();

    let filter = if normalized_profile_id.is_empty() || normalized_profile_id == WEB_STORE_UNKNOWN_PROFILE_ID {
        None
    } else {
        Some(format!("LOWER(profile) = '{}'", normalized_profile_id.replace('\'', "''")))
    };

    let records = if let Some(ref from) = date_from {
        let base_filter = format!("date >= '{}'", from.replace('\'', "''"));
        let combined_filter = match filter {
            Some(f) => format!("{} AND {}", base_filter, f),
            None => base_filter,
        };
        query_articles(&conn, Some(&combined_filter), limit, Some("date"))?
    } else {
        query_articles(&conn, filter.as_deref(), limit, Some("date"))?
    };

    let filtered_records = if normalized_profile_id.is_empty() || normalized_profile_id == WEB_STORE_UNKNOWN_PROFILE_ID {
        records
            .into_iter()
            .filter(|record| {
                let (raw_id, _) = normalize_profile_bucket(record.profile.as_deref());
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

#[tauri::command]
pub async fn get_web_store_article_by_url(
    app: AppHandle,
    url: String,
) -> Result<Option<WebStoreArticleRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;
    let filter = format!("url = '{}' COLLATE NOCASE", url.replace('\'', "''"));
    let mut records = query_articles(&conn, Some(&filter), Some(1), None)?;
    Ok(records.pop())
}

#[tauri::command]
pub async fn upsert_web_store_article(
    app: AppHandle,
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

    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let now = chrono_like_now();

    let previous_article = get_web_store_article_by_url(app.clone(), input.url.clone()).await?;
    
    if previous_article.is_some() {
        conn.execute(
            "UPDATE web_articles SET 
                title = ?1, thumbnail = ?2, content = ?3, media_directory = ?4, 
                main_color = ?5, profile = ?6, 
                embedding_source_text = ?7, date = ?8, updated_at = ?9 
             WHERE url = ?10 COLLATE NOCASE",
            params![
                input.title,
                input.thumbnail,
                input.content,
                input.directory,
                input.main_color,
                input.profile,
                input.embedding_source_text,
                input.date,
                now,
                input.url
            ],
        )
        .map_err(|error| error.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO web_articles (id, url, created_at, title, thumbnail, content,
                                   media_directory, main_color, profile,
                                   embedding_source_text, date, updated_at, viewed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0)",
            params![
                input.url,
                input.url,
                now,
                input.title,
                input.thumbnail,
                input.content,
                input.directory,
                input.main_color,
                input.profile,
                input.embedding_source_text,
                input.date,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_web_store_article_by_url(
    app: AppHandle,
    url: String,
) -> Result<bool, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let article = get_web_store_article_by_url(app.clone(), url.clone()).await?;

    let Some(_article) = article else {
        return Ok(false);
    };

    conn.execute("DELETE FROM web_articles WHERE url = ?1 COLLATE NOCASE", params![url])
        .map_err(|error| error.to_string())?;

    rebuild_profiles_from_articles(&conn, None)?;

    Ok(true)
}

#[tauri::command]
pub async fn update_web_store_article_viewed(
    app: AppHandle,
    url: String,
    viewed: bool,
) -> Result<bool, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

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
pub struct UpsertWebStoreProfileInput {
    pub id: String,
    pub name: String,
    pub profile_picture: Option<String>,
    pub url: Option<String>,
}

#[tauri::command]
pub async fn upsert_web_store_profile(
    app: AppHandle,
    input: UpsertWebStoreProfileInput,
) -> Result<(), String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let profile = WebStoreProfileRecord {
        id: input.id,
        name: input.name,
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
        .extend(["api", "profile", name]);

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
        return Err(format!("Remote profile returned status {}", response.status()));
    }

    response
        .json::<RemoteProfile>()
        .await
        .map_err(|error| format!("Failed to parse remote profile: {}", error))
}

#[tauri::command]
pub async fn delete_web_store_profile(
    app: AppHandle,
    profile_id: String,
) -> Result<WebStoreProfileDeletion, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    if let Some(profile) = query_profile_by_id(&conn, &profile_id)? {
        if let Some(profile_url) = profile.url {
            delete_web_store_tasks_by_url(app.clone(), profile_url).await?;
        }
    }

    let articles = list_web_store_articles_by_profile(
        app.clone(),
        profile_id.clone(),
        None,
        None,
        None,
    )
    .await?;

    let mut deleted_count = 0;

    for article_value in articles {
        if let Some(url) = article_value.get("url").and_then(|v| v.as_str()) {
            delete_web_store_tasks_by_url(app.clone(), url.to_string()).await?;
            if delete_web_store_article_by_url(app.clone(), url.to_string()).await? {
                deleted_count += 1;
            }
        }
    }

    delete_profile(&conn, &profile_id)?;

    Ok(WebStoreProfileDeletion {
        success: true,
        deleted_count,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreTaskRecord {
    pub url: String,
    pub tasks_json: String,
    pub updated_at: i64,
}

fn row_to_web_store_task(row: &rusqlite::Row<'_>) -> Result<WebStoreTaskRecord, rusqlite::Error> {
    let url: String = row.get(0)?;
    let tasks_json: String = row.get(1)?;
    let updated_at: i64 = row.get(2)?;

    Ok(WebStoreTaskRecord {
        url,
        tasks_json,
        updated_at,
    })
}

fn strip_recursive_chunks(tasks_json: &str) -> String {
    let Ok(Value::Array(tasks)) = serde_json::from_str::<Value>(tasks_json) else {
        return tasks_json.to_string();
    };

    let filtered: Vec<Value> = tasks
        .into_iter()
        .map(|mut task| {
            if let Some(data) = task.get_mut("data") {
                let has_chunks = data
                    .get("chunks")
                    .map_or(false, |chunks| chunks.is_array());
                if has_chunks {
                    if let Some(final_response) = data.get("finalResponse").cloned() {
                        *data = final_response;
                    }
                }
            }
            task
        })
        .collect();

    serde_json::to_string(&filtered).unwrap_or_else(|_| tasks_json.to_string())
}

fn task_chunks_from_json(tasks_json: &str, task_id: &str) -> Option<Value> {
    let parsed: Value = serde_json::from_str(tasks_json).ok()?;
    let tasks = parsed.as_array()?;

    for task in tasks {
        if task.get("id").and_then(|id| id.as_str()) != Some(task_id) {
            continue;
        }
        let chunks = task.get("data").and_then(|data| data.get("chunks"))?;
        return if chunks.is_array() {
            Some(chunks.clone())
        } else {
            None
        };
    }

    None
}

#[tauri::command]
pub async fn list_web_store_tasks(
    app: AppHandle,
) -> Result<Vec<WebStoreTaskRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let mut stmt = conn
        .prepare("SELECT url, tasks_json, updated_at FROM web_tasks ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;

    let task_iter = stmt
        .query_map([], row_to_web_store_task)
        .map_err(|error| error.to_string())?;

    let mut records = Vec::new();
    for task_result in task_iter {
        let mut record = task_result.map_err(|error| error.to_string())?;
        record.tasks_json = strip_recursive_chunks(&record.tasks_json);
        records.push(record);
    }

    Ok(records)
}

#[tauri::command]
pub async fn get_web_store_task_chunks(
    app: AppHandle,
    url: String,
    task_id: String,
) -> Result<Option<Value>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let tasks_json = match conn.query_row(
        "SELECT tasks_json FROM web_tasks WHERE url = ?1 COLLATE NOCASE",
        params![url],
        |row| row.get::<_, Option<String>>(0),
    ) {
        Ok(value) => value,
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(error) => return Err(error.to_string()),
    };

    let Some(tasks_json) = tasks_json else {
        return Ok(None);
    };

    Ok(task_chunks_from_json(&tasks_json, &task_id))
}

#[tauri::command]
pub async fn get_web_store_tasks_by_url(
    app: AppHandle,
    url: String,
) -> Result<Option<WebStoreTaskRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let mut stmt = conn
        .prepare("SELECT url, tasks_json, updated_at FROM web_tasks WHERE url = ?1 COLLATE NOCASE")
        .map_err(|error| error.to_string())?;

    let mut rows = stmt
        .query_map([&url], row_to_web_store_task)
        .map_err(|error| error.to_string())?;

    match rows.next() {
        Some(result) => Ok(Some(result.map_err(|error| error.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn upsert_web_store_tasks(
    app: AppHandle,
    url: String,
    tasks_json: String,
) -> Result<(), String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let now = chrono_like_now();

    conn.execute(
        "INSERT OR REPLACE INTO web_tasks (url, tasks_json, updated_at) VALUES (?1, ?2, ?3)",
        params![url, tasks_json, now],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_web_store_tasks_by_url(
    app: AppHandle,
    url: String,
) -> Result<bool, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let changes = conn
        .execute("DELETE FROM web_tasks WHERE url = ?1 COLLATE NOCASE", params![url])
        .map_err(|error| error.to_string())?;

    delete_raw_content_file(&app, &url);

    Ok(changes > 0)
}

#[tauri::command]
pub async fn write_raw_content(app: AppHandle, url: String, text: String) -> Result<String, String> {
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

#[tauri::command]
pub async fn list_web_store_categories(
    app: AppHandle,
) -> Result<Vec<WebStoreCategoryRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

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
    init_schema(&conn)?;

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

#[tauri::command]
pub async fn delete_web_store_category(
    app: AppHandle,
    category_id: String,
) -> Result<bool, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let now = chrono_like_now();

    conn.execute(
        "UPDATE web_categories SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, category_id],
    )
    .map_err(|error| error.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn assign_categories_to_article(
    app: AppHandle,
    input: AssignCategoriesToArticleInput,
) -> Result<(), String> {
    let mut conn = get_db(&app)?;
    init_schema(&conn)?;

    let tx = conn.transaction().map_err(|error| error.to_string())?;

    tx.execute(
        "DELETE FROM article_category WHERE article_url = ?1",
        params![input.article_url],
    ).map_err(|error| error.to_string())?;

    for category_id in &input.category_ids {
        let category_exists: bool = tx.query_row(
            "SELECT COUNT(*) > 0 FROM web_categories WHERE id = ?1 AND deleted_at IS NULL",
            [category_id],
            |row| row.get(0),
        ).map_err(|error| error.to_string())?;

        if !category_exists {
            return Err(format!("Category {} does not exist or is deleted", category_id));
        }

        tx.execute(
            "INSERT OR IGNORE INTO article_category (article_url, category_id) VALUES (?1, ?2)",
            params![input.article_url, category_id],
        ).map_err(|error| error.to_string())?;
    }

    tx.commit().map_err(|error| error.to_string())?;
    Ok(())
}

fn query_articles_for_profile(
    conn: &Connection,
    profile_id: &str,
    article_count: usize,
) -> Result<Vec<WebStoreArticleRecord>, String> {
    let articles_sql = format!(
        "SELECT id, url, created_at, title, thumbnail, content,
                media_directory, main_color, profile, embedding_source_text, updated_at,
                viewed, date,
                (SELECT p.profile_picture FROM web_profiles p WHERE LOWER(p.id) = LOWER(web_articles.profile)) AS profile_picture
         FROM web_articles
         WHERE LOWER(profile) = LOWER(?1) AND profile IS NOT NULL
         ORDER BY created_at DESC, date DESC NULLS LAST
         LIMIT ?2"
    );

    let mut article_stmt = conn.prepare(&articles_sql).map_err(|error| error.to_string())?;
    let article_rows = article_stmt
        .query_map(params![profile_id, article_count], row_to_stored_article)
        .map_err(|error| error.to_string())?;

    let mut articles = Vec::new();
    for article_result in article_rows {
        articles.push(article_result.map_err(|error| error.to_string())?);
    }
    Ok(articles)
}

#[tauri::command]
pub async fn list_articles_without_profile(
    app: AppHandle,
    category_ids: Option<Vec<String>>,
    offset: Option<usize>,
    limit: Option<usize>,
    only_without_profile: Option<bool>,
    profile_id: Option<String>,
    date_from: Option<String>,
) -> Result<ArticlesWithoutProfileResponse, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let mut where_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref pid) = profile_id {
        let normalized = pid.trim().to_lowercase();
        if !normalized.is_empty() {
            where_clauses.push("LOWER(a.profile) = ?".to_string());
            params.push(Box::new(normalized));
            where_clauses.push("a.profile IS NOT NULL".to_string());
        }
    } else if only_without_profile.unwrap_or(true) {
        where_clauses.push("a.profile IS NULL".to_string());
    }

    if let Some(ref from) = date_from {
        where_clauses.push("a.date >= ?".to_string());
        params.push(Box::new(from.clone()));
    }

    if let Some(ref cats) = category_ids {
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

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM web_articles a{}", where_sql);

    let total: usize = {
        let mut count_stmt = conn.prepare(&count_sql).map_err(|error| error.to_string())?;
        count_stmt
            .query_row(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| row.get(0))
            .map_err(|error| error.to_string())?
    };

    let sql = format!(
        "SELECT a.id, a.url, a.created_at, a.title, a.thumbnail, a.content,
                a.media_directory, a.main_color, a.profile, a.embedding_source_text, a.updated_at,
                a.viewed, a.date,
                (SELECT p.profile_picture FROM web_profiles p WHERE LOWER(p.id) = LOWER(a.profile)) AS profile_picture
         FROM web_articles a
         {}
         ORDER BY a.created_at DESC, a.date DESC NULLS LAST
         LIMIT {} OFFSET {}",
        where_sql,
        limit.unwrap_or(20),
        offset.unwrap_or(0)
    );

    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let article_iter = stmt
        .query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), row_to_stored_article)
        .map_err(|error| error.to_string())?;

    let mut articles = Vec::new();
    for article_result in article_iter {
        articles.push(article_result.map_err(|error| error.to_string())?);
    }

    Ok(ArticlesWithoutProfileResponse { articles, total })
}

#[tauri::command]
pub async fn list_articles_by_categories(
    app: AppHandle,
    category_ids: Vec<String>,
    article_count: usize,
    created_at_from: Option<i64>,
) -> Result<Vec<CategoryWithArticles>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    query_categories_with_articles(&conn, &category_ids, article_count, created_at_from)
}

fn query_categories_with_articles(
    conn: &Connection,
    category_ids: &[String],
    article_count: usize,
    created_at_from: Option<i64>,
) -> Result<Vec<CategoryWithArticles>, String> {
    let categories_sql = if category_ids.is_empty() {
        "SELECT id, name FROM web_categories WHERE deleted_at IS NULL ORDER BY name ASC".to_string()
    } else {
        let placeholders = category_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        format!(
            "SELECT id, name FROM web_categories WHERE id IN ({}) AND deleted_at IS NULL ORDER BY name ASC",
            placeholders
        )
    };

    let mut category_stmt = conn
        .prepare(&categories_sql)
        .map_err(|error| error.to_string())?;

    let category_params: Vec<&String> = category_ids.iter().collect();
    let category_rows = category_stmt
        .query_map(rusqlite::params_from_iter(category_params), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;

    let mut result = Vec::new();
    for category_result in category_rows {
        let (category_id, category_name) = category_result.map_err(|error| error.to_string())?;
        let articles = query_articles_for_category(conn, &category_id, article_count, created_at_from)?;
        result.push(CategoryWithArticles {
            category_id,
            category_name,
            articles,
        });
    }

    Ok(result)
}

fn query_articles_for_category(
    conn: &Connection,
    category_id: &str,
    article_count: usize,
    created_at_from: Option<i64>,
) -> Result<Vec<WebStoreArticleRecord>, String> {
    let mut articles_sql = String::from(
        "SELECT a.id, a.url, a.created_at, a.title, a.thumbnail, a.content,
                a.media_directory, a.main_color, a.profile, a.embedding_source_text, a.updated_at,
                a.viewed, a.date,
                (SELECT p.profile_picture FROM web_profiles p WHERE LOWER(p.id) = LOWER(a.profile)) AS profile_picture
         FROM web_articles a
         INNER JOIN article_category ac ON ac.article_url = a.url
         WHERE ac.category_id = ?1",
    );
    if created_at_from.is_some() {
        articles_sql.push_str(" AND a.created_at >= ?2");
    }
    articles_sql.push_str(" ORDER BY a.created_at DESC, a.date DESC NULLS LAST LIMIT ?");

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(category_id.to_string())];
    if let Some(from) = created_at_from {
        params.push(Box::new(from));
    }
    params.push(Box::new(article_count as i64));

    let mut article_stmt = conn
        .prepare(&articles_sql)
        .map_err(|error| error.to_string())?;
    let article_rows = article_stmt
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            row_to_stored_article,
        )
        .map_err(|error| error.to_string())?;

    let mut articles = Vec::new();
    for article_result in article_rows {
        articles.push(article_result.map_err(|error| error.to_string())?);
    }
    Ok(articles)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebStoreTemplateRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub tasks_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertWebStoreTemplateInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub tasks_json: String,
}

fn row_to_web_store_template(row: &rusqlite::Row<'_>) -> Result<WebStoreTemplateRecord, rusqlite::Error> {
    Ok(WebStoreTemplateRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        tasks_json: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

#[tauri::command]
pub async fn list_web_store_templates(
    app: AppHandle,
) -> Result<Vec<WebStoreTemplateRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let mut stmt = conn
        .prepare("SELECT id, name, description, tasks_json, created_at, updated_at FROM web_templates ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;

    let template_iter = stmt
        .query_map([], row_to_web_store_template)
        .map_err(|error| error.to_string())?;

    let mut records = Vec::new();
    for template_result in template_iter {
        records.push(template_result.map_err(|error| error.to_string())?);
    }

    Ok(records)
}

#[tauri::command]
pub async fn get_web_store_template(
    app: AppHandle,
    id: String,
) -> Result<Option<WebStoreTemplateRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let mut stmt = conn
        .prepare("SELECT id, name, description, tasks_json, created_at, updated_at FROM web_templates WHERE id = ?1")
        .map_err(|error| error.to_string())?;

    let mut rows = stmt
        .query_map([&id], row_to_web_store_template)
        .map_err(|error| error.to_string())?;

    match rows.next() {
        Some(result) => Ok(Some(result.map_err(|error| error.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn upsert_web_store_template(
    app: AppHandle,
    input: UpsertWebStoreTemplateInput,
) -> Result<WebStoreTemplateRecord, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let now = chrono_like_now();

    let existing = get_web_store_template(app.clone(), input.id.clone()).await?;

    if existing.is_some() {
        conn.execute(
            "UPDATE web_templates SET name = ?1, description = ?2, tasks_json = ?3, updated_at = ?4 WHERE id = ?5",
            params![input.name, input.description, input.tasks_json, now, input.id],
        )
        .map_err(|error| error.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO web_templates (id, name, description, tasks_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![input.id, input.name, input.description, input.tasks_json, now, now],
        )
        .map_err(|error| error.to_string())?;
    }

    let result = get_web_store_template(app.clone(), input.id).await?;
    result.ok_or_else(|| "Failed to retrieve template after upsert".to_string())
}

#[tauri::command]
pub async fn delete_web_store_template(
    app: AppHandle,
    id: String,
) -> Result<bool, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    conn.execute(
        "DELETE FROM web_profile_templates WHERE template_id = ?1",
        params![id],
    )
    .map_err(|error| error.to_string())?;

    let changes = conn
        .execute("DELETE FROM web_templates WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;

    Ok(changes > 0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebProfileTemplateRecord {
    pub profile_id: String,
    pub template_id: String,
    pub updated_at: i64,
}

fn row_to_web_profile_template(row: &rusqlite::Row<'_>) -> Result<WebProfileTemplateRecord, rusqlite::Error> {
    Ok(WebProfileTemplateRecord {
        profile_id: row.get(0)?,
        template_id: row.get(1)?,
        updated_at: row.get(2)?,
    })
}

#[tauri::command]
pub async fn get_web_profile_template(
    app: AppHandle,
    profile_id: String,
) -> Result<Option<WebProfileTemplateRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let mut stmt = conn
        .prepare("SELECT profile_id, template_id, updated_at FROM web_profile_templates WHERE profile_id = ?1")
        .map_err(|error| error.to_string())?;

    let mut rows = stmt
        .query_map([&profile_id], row_to_web_profile_template)
        .map_err(|error| error.to_string())?;

    match rows.next() {
        Some(result) => Ok(Some(result.map_err(|error| error.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn upsert_web_profile_template(
    app: AppHandle,
    profile_id: String,
    template_id: String,
) -> Result<WebProfileTemplateRecord, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let now = chrono_like_now();

    conn.execute(
        "INSERT OR IGNORE INTO web_profiles (id, name, count, updated_at) VALUES (?1, ?1, 0, ?2)",
        params![profile_id, now],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        "INSERT INTO web_profile_templates (profile_id, template_id, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(profile_id) DO UPDATE SET template_id = excluded.template_id, updated_at = excluded.updated_at",
        params![profile_id, template_id, now],
    )
    .map_err(|error| error.to_string())?;

    let result = get_web_profile_template(app.clone(), profile_id).await?;
    result.ok_or_else(|| "Failed to retrieve profile template after upsert".to_string())
}

#[tauri::command]
pub async fn delete_web_profile_template(
    app: AppHandle,
    profile_id: String,
) -> Result<bool, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let changes = conn
        .execute("DELETE FROM web_profile_templates WHERE profile_id = ?1", params![profile_id])
        .map_err(|error| error.to_string())?;

    Ok(changes > 0)
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
            params![id, id, created_at, format!("title-{}", id), None::<String>, profile, date],
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

    #[test]
    fn query_categories_with_articles_returns_all_when_ids_empty() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");
        insert_category(&conn, "cat-b", "Beta");
        insert_category(&conn, "cat-deleted", "Deleted");

        for i in 0..5 {
            insert_article(&conn, &format!("a-{i}"), "channel", 2_000_000_000_000 + i, None);
            link_article_to_category(&conn, &format!("a-{i}"), "cat-a");
        }
        insert_article(&conn, "b-1", "channel", 3_000_000_000_000, None);
        link_article_to_category(&conn, "b-1", "cat-b");

        conn.execute(
            "UPDATE web_categories SET deleted_at = 1 WHERE id = 'cat-deleted'",
            [],
        )
        .expect("mark category deleted");

        let result = query_categories_with_articles(&conn, &[], 4, None).expect("query");

        let names: Vec<&str> = result.iter().map(|c| c.category_name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "Beta"], "expected all non-deleted categories");

        let alpha = result.iter().find(|c| c.category_id == "cat-a").unwrap();
        assert_eq!(alpha.articles.len(), 4, "expected article count capped at 4");
    }

    #[test]
    fn query_categories_with_articles_filters_by_created_at() {
        let conn = build_in_memory_db();
        insert_category(&conn, "cat-a", "Alpha");

        insert_article(&conn, "old-article", "channel", 1_000_000_000_000, None);
        insert_article(&conn, "new-article", "channel", 2_000_000_000_000, None);
        link_article_to_category(&conn, "old-article", "cat-a");
        link_article_to_category(&conn, "new-article", "cat-a");

        let result = query_categories_with_articles(&conn, &["cat-a".to_string()], 4, Some(1_500_000_000_000))
            .expect("query");

        let category = &result[0];
        let urls: Vec<&str> = category
            .articles
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(urls, vec!["new-article"], "expected only articles created after the cutoff");
    }

    #[test]
    fn query_articles_for_profile_orders_by_created_at_desc() {
        let conn = build_in_memory_db();
        let profile = "channel-a";

        insert_article(&conn, "old-yt-newly-added", profile, 2_000_000_000_000, Some("15 jun 2024"));
        insert_article(&conn, "newer-yt-added-earlier", profile, 1_000_000_000_000, Some("20 dic 2025"));
        insert_article(&conn, "newest-yt-old-publish", profile, 3_000_000_000_000, Some("1 ene 2023"));
        insert_article(&conn, "other-profile", "channel-b", 9_000_000_000_000, Some("1 mar 2026"));

        let articles = query_articles_for_profile(&conn, profile, 10).expect("query");

        let urls: Vec<&str> = articles
            .iter()
            .map(|a| a.url.as_deref().unwrap_or(""))
            .collect();
        assert_eq!(
            urls,
            vec!["newest-yt-old-publish", "old-yt-newly-added", "newer-yt-added-earlier"],
            "expected most recently added article first, regardless of publication date"
        );
    }

    #[test]
    fn strip_recursive_chunks_keeps_final_response_only() {
        let tasks_json = r#"[
            {"id": "title", "name": "Title", "data": "Hello", "status": "done"},
            {"id": "summary", "name": "Summary", "data": {
                "chunks": [{"key": {"startOffset": 0, "endOffset": 10}, "data": ["chunk-a"]}],
                "finalResponse": "Final summary"
            }, "status": "done"}
        ]"#;

        let stripped = strip_recursive_chunks(tasks_json);
        let parsed: Value = serde_json::from_str(&stripped).expect("valid json");

        let tasks = parsed.as_array().expect("array");
        let title = tasks[0].get("data").expect("title data");
        assert_eq!(title, "Hello");

        let summary_data = tasks[1].get("data").expect("summary data");
        assert_eq!(summary_data, "Final summary", "chunks must be replaced by finalResponse");
        assert!(summary_data.get("chunks").is_none());
    }

    #[test]
    fn strip_recursive_chunks_keeps_chunks_when_no_final_response() {
        let tasks_json = r#"[
            {"id": "summary", "data": {"chunks": [{"key": {}, "data": ["a"]}]}, "status": "running"}
        ]"#;

        let stripped = strip_recursive_chunks(tasks_json);
        let parsed: Value = serde_json::from_str(&stripped).expect("valid json");

        let tasks = parsed.as_array().expect("array");
        assert!(
            tasks[0].get("data").expect("data").get("chunks").is_some(),
            "partial state without finalResponse must keep chunks"
        );
    }

    #[test]
    fn task_chunks_from_json_returns_chunks_for_task() {
        let tasks_json = r#"[
            {"id": "title", "data": "Hello"},
            {"id": "summary", "data": {
                "chunks": [{"key": {"startOffset": 0, "endOffset": 5}, "data": ["a", "b"]}],
                "finalResponse": "Final"
            }}
        ]"#;

        let chunks = task_chunks_from_json(tasks_json, "summary").expect("chunks found");
        assert!(chunks.is_array());
        assert_eq!(chunks.as_array().expect("array").len(), 1);

        let missing = task_chunks_from_json(tasks_json, "title");
        assert!(missing.is_none(), "non-recursive task has no chunks");

        let unknown = task_chunks_from_json(tasks_json, "nope");
        assert!(unknown.is_none());
    }

    #[test]
    fn task_chunks_from_json_returns_none_for_invalid_json() {
        assert!(task_chunks_from_json("not-json", "summary").is_none());
    }
}
