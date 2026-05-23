use std::fs;
use std::collections::HashMap;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use tauri::{AppHandle, Manager};

const DB_FILE: &str = "notian.db";
pub const UNKNOWN_PROFILE_ID: &str = "__unknown_profile__";
pub const UNKNOWN_PROFILE_LABEL: &str = "Unknown profile";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredArticleRecord {
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
    pub tasks_json: Option<String>,
    pub updated_at: i64,
    pub embedding_source_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredArticleProfileRecord {
    pub id: String,
    pub name: String,
    pub count: i64,
    pub profile_picture: Option<String>,
    pub last_video_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteStoredArticleProfileResult {
    pub success: bool,
    pub deleted_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileWithMostRecentArticle {
    pub id: String,
    pub name: String,
    pub most_recent_created_at: i64,
    pub profile_picture: Option<String>,
    pub last_video_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredArticleSearchRowInput {
    pub row_id: String,
    pub kind: String,
    pub ordinal: i32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertStoredArticleInput {
    pub url: String,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub content: Option<String>,
    pub directory: Option<String>,
    pub main_color: Option<String>,
    pub profile: Option<String>,
    pub profile_picture: Option<String>,
    pub tasks_json: String,
    pub embedding_source_text: Option<String>,
    pub search_rows: Vec<StoredArticleSearchRowInput>,
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

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS articles (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT 0,
            title TEXT,
            thumbnail TEXT,
            content TEXT,
            media_directory TEXT,
            main_color TEXT,
            profile TEXT,
            tasks_json TEXT NOT NULL DEFAULT '[]',
            embedding_source_text TEXT,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
        CREATE INDEX IF NOT EXISTS idx_articles_profile ON articles(profile);

        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            profile_picture TEXT,
            last_video_date TEXT,
            updated_at INTEGER NOT NULL
        );"
    ).map_err(|error| error.to_string())?;

    migrate_add_last_video_date(conn)?;

    Ok(())
}

fn migrate_add_last_video_date(conn: &Connection) -> Result<(), String> {
    let table_sql: Result<String, _> = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='profiles'",
        [],
        |row| row.get(0),
    );

    match table_sql {
        Ok(sql) if sql.contains("last_video_date") => {
            // Column exists, nothing to do
        }
        _ => {
            conn.execute("ALTER TABLE profiles ADD COLUMN last_video_date TEXT", [])
                .map_err(|e| e.to_string())?;
        }
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
            UNKNOWN_PROFILE_ID.to_string(),
            UNKNOWN_PROFILE_LABEL.to_string(),
        ),
    }
}

fn filter_record_to_json(record: &StoredArticleRecord, fields: &Option<Vec<String>>) -> Value {
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

fn aggregate_profiles(records: Vec<StoredArticleRecord>) -> Vec<StoredArticleProfileRecord> {
    let mut aggregated = HashMap::<String, StoredArticleProfileRecord>::new();

    for record in records {
        let (id, name) = normalize_profile_bucket(record.profile.as_deref());
        aggregated
            .entry(id.clone())
            .and_modify(|profile| {
                profile.count += 1;
            })
            .or_insert(StoredArticleProfileRecord {
                id,
                name,
                count: 1,
                profile_picture: None,
                last_video_date: None,
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

fn sort_articles_by_created_at_desc(records: &mut [StoredArticleRecord]) {
    records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
}

fn row_to_stored_article(row: &rusqlite::Row<'_>) -> Result<StoredArticleRecord, rusqlite::Error> {
    let id: String = row.get(0)?;
    let url: String = row.get(1)?;
    let created_at: i64 = row.get(2)?;
    let title: Option<String> = row.get(3)?;
    let thumbnail: Option<String> = row.get(4)?;
    let content: Option<String> = row.get(5)?;
    let media_directory: Option<String> = row.get(6)?;
    let main_color: Option<String> = row.get(7)?;
    let profile: Option<String> = row.get(8)?;
    let tasks_json: String = row.get(9)?;
    let embedding_source_text: Option<String> = row.get(10)?;
    let updated_at: i64 = row.get(11)?;

    Ok(StoredArticleRecord {
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
        tasks_json: Some(tasks_json),
        updated_at,
        embedding_source_text,
    })
}

fn query_articles(
    conn: &Connection,
    filter: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<StoredArticleRecord>, String> {
    let mut sql = String::from(
        "SELECT id, url, created_at, title, thumbnail, content, 
                media_directory, main_color, profile, tasks_json, embedding_source_text, updated_at 
         FROM articles"
    );
    
    if let Some(f) = filter {
        sql.push_str(" WHERE ");
        sql.push_str(f);
    }
    
    sql.push_str(" ORDER BY created_at DESC");
    
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

fn query_profiles(conn: &Connection) -> Result<Vec<StoredArticleProfileRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, count, profile_picture, last_video_date FROM profiles ORDER BY count DESC, name ASC")
        .map_err(|error| error.to_string())?;

    let profile_iter = stmt
        .query_map([], |row| {
            Ok(StoredArticleProfileRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
                profile_picture: row.get(3)?,
                last_video_date: row.get(4)?,
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
    profile: &StoredArticleProfileRecord,
) -> Result<(), String> {
    let updated_at = chrono_like_now();
    conn.execute(
        "INSERT OR REPLACE INTO profiles (id, name, count, profile_picture, last_video_date, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            profile.id,
            profile.name,
            profile.count,
            profile.profile_picture,
            profile.last_video_date,
            updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn delete_profile(conn: &Connection, profile_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM profiles WHERE id = ?1", params![profile_id])
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

    let all_articles = query_articles(conn, None, None)?;
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
            aggregated.push(StoredArticleProfileRecord {
                id: profile_id,
                name: String::new(),
                count: 0,
                profile_picture: Some(picture),
                last_video_date: None,
            });
        }
    }

    for profile in &aggregated {
        upsert_profile(conn, profile)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn list_stored_articles(
    app: AppHandle,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;
    let records = query_articles(&conn, None, None)?;
    Ok(records
        .iter()
        .map(|record| filter_record_to_json(record, &fields))
        .collect())
}

#[tauri::command]
pub async fn list_stored_article_profiles(
    app: AppHandle,
) -> Result<Vec<StoredArticleProfileRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;
    let mut profiles = query_profiles(&conn)?;

    if profiles.is_empty() {
        let aggregated = aggregate_profiles(query_articles(&conn, None, None)?);
        for profile in &aggregated {
            upsert_profile(&conn, profile)?;
        }
        profiles = aggregated;
    }

    Ok(profiles)
}

#[tauri::command]
pub async fn list_stored_articles_by_profile(
    app: AppHandle,
    profile_id: String,
    created_at_from: Option<i64>,
    limit: Option<usize>,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let normalized_profile_id = profile_id.trim();

    let filter = if normalized_profile_id.is_empty() || normalized_profile_id == UNKNOWN_PROFILE_ID {
        None
    } else {
        Some(format!("profile = '{}'", normalized_profile_id.replace('\'', "''")))
    };

    let records = if let Some(from) = created_at_from {
        let base_filter = format!("created_at >= {}", from);
        let combined_filter = match filter {
            Some(f) => format!("{} AND {}", base_filter, f),
            None => base_filter,
        };
        query_articles(&conn, Some(&combined_filter), limit)?
    } else {
        query_articles(&conn, filter.as_deref(), limit)?
    };

    let filtered_records = if normalized_profile_id.is_empty() || normalized_profile_id == UNKNOWN_PROFILE_ID {
        records
            .into_iter()
            .filter(|record| {
                normalize_profile_bucket(record.profile.as_deref()).0 == UNKNOWN_PROFILE_ID
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
pub async fn list_profiles_with_articles_after(
    app: AppHandle,
    created_at_from: i64,
) -> Result<Vec<ProfileWithMostRecentArticle>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let filter = format!("created_at >= {}", created_at_from);
    let records = query_articles(&conn, Some(&filter), None)?;

    let mut profile_map: HashMap<String, (String, i64)> = HashMap::new();

    for record in records {
        let (id, name) = normalize_profile_bucket(record.profile.as_deref());
        let most_recent = record.created_at;
        profile_map
            .entry(id.clone())
            .and_modify(|(_, existing)| {
                if most_recent > *existing {
                    *existing = most_recent;
                }
            })
            .or_insert((name, most_recent));
    }

    let profile_data: HashMap<String, (Option<String>, Option<String>)> = query_profiles(&conn)?
        .into_iter()
        .map(|profile| (profile.id, (profile.profile_picture, profile.last_video_date)))
        .collect();

    let mut profiles: Vec<ProfileWithMostRecentArticle> = profile_map
        .into_iter()
        .map(|(id, (name, most_recent_created_at))| {
            let (profile_picture, last_video_date) = profile_data
                .get(&id)
                .cloned()
                .unwrap_or((None, None));
            ProfileWithMostRecentArticle {
                id: id.clone(),
                name,
                most_recent_created_at,
                profile_picture,
                last_video_date,
            }
        })
        .collect();

    profiles.sort_by(|a, b| b.most_recent_created_at.cmp(&a.most_recent_created_at));

    Ok(profiles)
}

#[tauri::command]
pub async fn get_stored_article_by_url(
    app: AppHandle,
    url: String,
) -> Result<Option<StoredArticleRecord>, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;
    let filter = format!("url = '{}'", url.replace('\'', "''"));
    let mut records = query_articles(&conn, Some(&filter), Some(1))?;
    Ok(records.pop())
}

#[tauri::command]
pub async fn upsert_stored_article(
    app: AppHandle,
    mut input: UpsertStoredArticleInput,
) -> Result<(), String> {
    input.title = normalize_optional_string(input.title);
    input.thumbnail = normalize_optional_string(input.thumbnail);
    input.content = normalize_optional_string(input.content);
    input.directory = normalize_optional_string(input.directory);
    input.main_color = normalize_optional_string(input.main_color);
    input.profile = normalize_optional_string(input.profile);
    input.embedding_source_text = normalize_optional_string(input.embedding_source_text);

    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let now = chrono_like_now();

    let previous_article = get_stored_article_by_url(app.clone(), input.url.clone()).await?;
    
    if previous_article.is_some() {
        conn.execute(
            "UPDATE articles SET 
                title = ?1, thumbnail = ?2, content = ?3, media_directory = ?4, 
                main_color = ?5, profile = ?6, tasks_json = ?7, 
                embedding_source_text = ?8, updated_at = ?9 
             WHERE url = ?10",
            params![
                input.title,
                input.thumbnail,
                input.content,
                input.directory,
                input.main_color,
                input.profile,
                input.tasks_json,
                input.embedding_source_text,
                now,
                input.url
            ],
        )
        .map_err(|error| error.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO articles (id, url, created_at, title, thumbnail, content, 
                                   media_directory, main_color, profile, tasks_json, 
                                   embedding_source_text, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                input.tasks_json,
                input.embedding_source_text,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    let next_profile_bucket = normalize_profile_bucket(input.profile.as_deref());
    let profile_picture_input = input.profile_picture.clone().map(|picture| (next_profile_bucket.0, picture));
    rebuild_profiles_from_articles(&conn, profile_picture_input)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_stored_article_by_url(
    app: AppHandle,
    url: String,
) -> Result<bool, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let article = get_stored_article_by_url(app.clone(), url.clone()).await?;

    let Some(_article) = article else {
        return Ok(false);
    };

    conn.execute("DELETE FROM articles WHERE url = ?1", params![url])
        .map_err(|error| error.to_string())?;

    rebuild_profiles_from_articles(&conn, None)?;

    Ok(true)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertStoredArticleProfileInput {
    pub id: String,
    pub name: String,
    pub profile_picture: Option<String>,
    pub last_video_date: Option<String>,
}

#[tauri::command]
pub async fn upsert_stored_article_profile(
    app: AppHandle,
    input: UpsertStoredArticleProfileInput,
) -> Result<(), String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let profile = StoredArticleProfileRecord {
        id: input.id,
        name: input.name,
        count: 0,
        profile_picture: input.profile_picture,
        last_video_date: input.last_video_date,
    };

    upsert_profile(&conn, &profile)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_stored_article_profile(
    app: AppHandle,
    profile_id: String,
) -> Result<DeleteStoredArticleProfileResult, String> {
    let conn = get_db(&app)?;
    init_schema(&conn)?;

    let articles = list_stored_articles_by_profile(
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
            if delete_stored_article_by_url(app.clone(), url.to_string()).await? {
                deleted_count += 1;
            }
        }
    }

    delete_profile(&conn, &profile_id)?;

    Ok(DeleteStoredArticleProfileResult {
        success: true,
        deleted_count,
    })
}
