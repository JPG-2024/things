use std::fs;
use std::sync::Arc;
use std::collections::HashMap;

use arrow_array::{Array, Int32Array, Int64Array, RecordBatch, RecordBatchIterator, StringArray};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use futures_util::TryStreamExt;
use lancedb::index::scalar::FtsIndexBuilder;
use lancedb::index::Index;
use lancedb::query::{ExecutableQuery, QueryBase};
use lancedb::table::NewColumnTransform;
use lancedb::{connect, Connection, Table};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const ARTICLES_TABLE: &str = "articles";
const ARTICLE_SEARCH_TABLE: &str = "article_search";
const ARTICLE_PROFILES_TABLE: &str = "article_profiles";
const DB_DIRECTORY: &str = "lancedb";
pub const UNKNOWN_PROFILE_ID: &str = "__unknown_profile__";
pub const UNKNOWN_PROFILE_LABEL: &str = "Unknown profile";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredArticleRecord {
    pub id: i64,
    pub url: Option<String>,
    pub article_uid: String,
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

fn article_uid_from_url(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn article_numeric_id(article_uid: &str) -> i64 {
    let prefix = &article_uid[..16.min(article_uid.len())];
    i64::from_str_radix(prefix, 16).unwrap_or(i64::MAX)
}

fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn sql_optional_string(value: Option<&str>) -> String {
    match value {
        Some(value) => sql_string(value),
        None => "NULL".to_string(),
    }
}

fn database_path(app: &AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    let db_dir = app_data_dir.join(DB_DIRECTORY);
    fs::create_dir_all(&db_dir).map_err(|error| error.to_string())?;

    Ok(db_dir.to_string_lossy().to_string())
}

async fn connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    connect(&path)
        .execute()
        .await
        .map_err(|error| error.to_string())
}

fn articles_schema() -> SchemaRef {
    Arc::new(Schema::new(vec![
        Field::new("id", DataType::Int64, false),
        Field::new("url", DataType::Utf8, false),
        Field::new("article_uid", DataType::Utf8, false),
        Field::new("created_at", DataType::Int64, false),
        Field::new("title", DataType::Utf8, true),
        Field::new("thumbnail", DataType::Utf8, true),
        Field::new("content", DataType::Utf8, true),
        Field::new("directory", DataType::Utf8, true),
        Field::new("main_color", DataType::Utf8, true),
        Field::new("profile", DataType::Utf8, true),
        Field::new("tasks_json", DataType::Utf8, false),
        Field::new("embedding_source_text", DataType::Utf8, true),
        Field::new("updated_at", DataType::Int64, false),
    ]))
}

fn article_search_schema() -> SchemaRef {
    Arc::new(Schema::new(vec![
        Field::new("row_id", DataType::Utf8, false),
        Field::new("article_uid", DataType::Utf8, false),
        Field::new("url", DataType::Utf8, false),
        Field::new("kind", DataType::Utf8, false),
        Field::new("ordinal", DataType::Int32, false),
        Field::new("text", DataType::Utf8, false),
        Field::new("title", DataType::Utf8, true),
        Field::new("updated_at", DataType::Int64, false),
    ]))
}

fn article_profiles_schema() -> SchemaRef {
    Arc::new(Schema::new(vec![
        Field::new("id", DataType::Utf8, false),
        Field::new("name", DataType::Utf8, false),
        Field::new("count", DataType::Int64, false),
        Field::new("profile_picture", DataType::Utf8, true),
        Field::new("updated_at", DataType::Int64, false),
    ]))
}

async fn open_or_create_table(
    db: &Connection,
    table_name: &str,
    schema: SchemaRef,
) -> Result<Table, String> {
    let table_names = db.table_names().execute().await.map_err(|error| error.to_string())?;

    if table_names.iter().any(|name| name == table_name) {
        return db
            .open_table(table_name)
            .execute()
            .await
            .map_err(|error| error.to_string());
    }

    db.create_empty_table(table_name, schema)
        .execute()
        .await
        .map_err(|error| error.to_string())
}

async fn ensure_articles_table_schema(table: &Table) -> Result<(), String> {
    let schema = table.schema().await.map_err(|error| error.to_string())?;

    let mut migrations: Vec<(String, NewColumnTransform)> = Vec::new();

    if schema.field_with_name("created_at").is_err() {
        migrations.push((
            "created_at".to_string(),
            NewColumnTransform::SqlExpressions(vec![(
                "created_at".to_string(),
                "updated_at".to_string(),
            )]),
        ));
    }

    if migrations.is_empty() {
        return Ok(());
    }

    for (name, transform) in migrations {
        table
            .add_columns(transform, Some(vec![name.clone()]))
            .await
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

async fn open_articles_table(db: &Connection) -> Result<Table, String> {
    let table = open_or_create_table(db, ARTICLES_TABLE, articles_schema()).await?;
    ensure_articles_table_schema(&table).await?;
    Ok(table)
}

async fn open_article_search_table(db: &Connection) -> Result<Table, String> {
    let table = open_or_create_table(db, ARTICLE_SEARCH_TABLE, article_search_schema()).await?;
    //ensure_search_indices(&table).await?;
    Ok(table)
}

async fn open_article_profiles_table(db: &Connection) -> Result<Table, String> {
    let table = open_or_create_table(db, ARTICLE_PROFILES_TABLE, article_profiles_schema()).await?;
    ensure_article_profiles_schema(&table).await?;
    Ok(table)
}

async fn ensure_article_profiles_schema(table: &Table) -> Result<(), String> {
    let schema = table.schema().await.map_err(|error| error.to_string())?;
    let mut migrations: Vec<(String, NewColumnTransform)> = Vec::new();

    if schema.field_with_name("profile_picture").is_err() {
        migrations.push((
            "profile_picture".to_string(),
            NewColumnTransform::SqlExpressions(vec![(
                "profile_picture".to_string(),
                "NULL".to_string(),
            )]),
        ));
    }

    if migrations.is_empty() {
        return Ok(());
    }

    for (name, transform) in migrations {
        table
            .add_columns(transform, Some(vec![name.clone()]))
            .await
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

async fn ensure_search_indices(table: &Table) -> Result<(), String> {
    let indices = table.list_indices().await.map_err(|error| error.to_string())?;
    let has_text_index = indices
        .iter()
        .any(|index| index.columns == vec!["text".to_string()]);

    if !has_text_index {
        table
            .create_index(&["text"], Index::FTS(FtsIndexBuilder::default()))
            .execute()
            .await
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn article_batch(input: &UpsertStoredArticleInput, created_at: i64) -> Result<RecordBatch, String> {
    let article_uid = article_uid_from_url(&input.url);
    let id = article_numeric_id(&article_uid);
    let updated_at = chrono_like_now();
    let schema = articles_schema();

    let columns: Vec<Arc<dyn Array>> = vec![
        Arc::new(Int64Array::from(vec![id])),
        Arc::new(StringArray::from(vec![input.url.as_str()])),
        Arc::new(StringArray::from(vec![article_uid.as_str()])),
        Arc::new(Int64Array::from(vec![created_at])),
        Arc::new(StringArray::from(vec![input.title.as_deref()])),
        Arc::new(StringArray::from(vec![input.thumbnail.as_deref()])),
        Arc::new(StringArray::from(vec![input.content.as_deref()])),
        Arc::new(StringArray::from(vec![input.directory.as_deref()])),
        Arc::new(StringArray::from(vec![input.main_color.as_deref()])),
        Arc::new(StringArray::from(vec![input.profile.as_deref()])),
        Arc::new(StringArray::from(vec![Some(input.tasks_json.as_str())])),
        Arc::new(StringArray::from(vec![input.embedding_source_text.as_deref()])),
        Arc::new(Int64Array::from(vec![updated_at])),
    ];

    RecordBatch::try_new(schema, columns)
        .map_err(|error| error.to_string())
}

fn article_search_batch(input: &UpsertStoredArticleInput) -> Result<RecordBatch, String> {
    let article_uid = article_uid_from_url(&input.url);
    let updated_at = chrono_like_now();
    let schema = article_search_schema();

    let row_ids = input
        .search_rows
        .iter()
        .map(|row| Some(format!("{}:{}", article_uid, row.row_id)))
        .collect::<Vec<_>>();
    let article_uids = input
        .search_rows
        .iter()
        .map(|_| Some(article_uid.as_str()))
        .collect::<Vec<_>>();
    let urls = input
        .search_rows
        .iter()
        .map(|_| Some(input.url.as_str()))
        .collect::<Vec<_>>();
    let kinds = input
        .search_rows
        .iter()
        .map(|row| Some(row.kind.as_str()))
        .collect::<Vec<_>>();
    let ordinals = input
        .search_rows
        .iter()
        .map(|row| row.ordinal)
        .collect::<Vec<_>>();
    let texts = input
        .search_rows
        .iter()
        .map(|row| Some(row.text.as_str()))
        .collect::<Vec<_>>();
    let titles = input
        .search_rows
        .iter()
        .map(|_| input.title.as_deref())
        .collect::<Vec<_>>();
    let updated_ats = input
        .search_rows
        .iter()
        .map(|_| updated_at)
        .collect::<Vec<_>>();

    RecordBatch::try_new(
        schema,
        vec![
            Arc::new(StringArray::from(row_ids)),
            Arc::new(StringArray::from(article_uids)),
            Arc::new(StringArray::from(urls)),
            Arc::new(StringArray::from(kinds)),
            Arc::new(Int32Array::from(ordinals)),
            Arc::new(StringArray::from(texts)),
            Arc::new(StringArray::from(titles)),
            Arc::new(Int64Array::from(updated_ats)),
        ],
    )
    .map_err(|error| error.to_string())
}

fn article_profiles_batch(profiles: &[StoredArticleProfileRecord]) -> Result<RecordBatch, String> {
    if profiles.is_empty() {
        return Err("Cannot create profile batch from empty profile list".to_string());
    }

    let updated_at = chrono_like_now();
    let schema = article_profiles_schema();

    let ids = profiles
        .iter()
        .map(|profile| Some(profile.id.as_str()))
        .collect::<Vec<_>>();
    let names = profiles
        .iter()
        .map(|profile| Some(profile.name.as_str()))
        .collect::<Vec<_>>();
    let counts = profiles
        .iter()
        .map(|profile| profile.count)
        .collect::<Vec<_>>();
    let profile_pictures = profiles
        .iter()
        .map(|profile| profile.profile_picture.as_deref())
        .collect::<Vec<_>>();
    let updated_ats = profiles
        .iter()
        .map(|_| updated_at)
        .collect::<Vec<_>>();

    RecordBatch::try_new(
        schema,
        vec![
            Arc::new(StringArray::from(ids)),
            Arc::new(StringArray::from(names)),
            Arc::new(Int64Array::from(counts)),
            Arc::new(StringArray::from(profile_pictures)),
            Arc::new(Int64Array::from(updated_ats)),
        ],
    )
    .map_err(|error| error.to_string())
}

fn chrono_like_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn string_column<'a>(batch: &'a RecordBatch, name: &str) -> Result<&'a StringArray, String> {
    batch
        .column_by_name(name)
        .ok_or_else(|| format!("Missing column '{name}'"))?
        .as_any()
        .downcast_ref::<StringArray>()
        .ok_or_else(|| format!("Column '{name}' is not Utf8"))
}

fn optional_string_column<'a>(
    batch: &'a RecordBatch,
    name: &str,
) -> Result<Option<&'a StringArray>, String> {
    let Some(column) = batch.column_by_name(name) else {
        return Ok(None);
    };

    if column.data_type() == &DataType::Null {
        return Ok(None);
    }

    column
        .as_any()
        .downcast_ref::<StringArray>()
        .map(Some)
        .ok_or_else(|| format!("Column '{name}' is not Utf8"))
}

fn int64_column<'a>(batch: &'a RecordBatch, name: &str) -> Result<&'a Int64Array, String> {
    batch
        .column_by_name(name)
        .ok_or_else(|| format!("Missing column '{name}'"))?
        .as_any()
        .downcast_ref::<Int64Array>()
        .ok_or_else(|| format!("Column '{name}' is not Int64"))
}

fn optional_int64_column<'a>(
    batch: &'a RecordBatch,
    name: &str,
) -> Result<Option<&'a Int64Array>, String> {
    let Some(column) = batch.column_by_name(name) else {
        return Ok(None);
    };

    column
        .as_any()
        .downcast_ref::<Int64Array>()
        .map(Some)
        .ok_or_else(|| format!("Column '{name}' is not Int64"))
}

fn read_optional_string(array: &StringArray, row: usize) -> Option<String> {
    if array.is_null(row) {
        None
    } else {
        Some(array.value(row).to_string())
    }
}

fn read_optional_string_from_column(array: Option<&StringArray>, row: usize) -> Option<String> {
    array.and_then(|value| read_optional_string(value, row))
}

fn read_optional_int64(array: &Int64Array, row: usize) -> Option<i64> {
    if array.is_null(row) {
        None
    } else {
        Some(array.value(row))
    }
}

fn read_optional_int64_from_column(array: Option<&Int64Array>, row: usize) -> Option<i64> {
    array.and_then(|value| read_optional_int64(value, row))
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
            // Return all fields as JSON
            serde_json::to_value(record).unwrap_or(Value::Null)
        }
        Some(field_list) => {
            // Build a JSON object with only selected fields
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

fn records_from_batches(batches: Vec<RecordBatch>) -> Result<Vec<StoredArticleRecord>, String> {
    let mut records = Vec::new();

    for batch in batches {
        let ids = int64_column(&batch, "id")?;
        let urls = string_column(&batch, "url")?;
        let article_uids = string_column(&batch, "article_uid")?;
        let created_ats = optional_int64_column(&batch, "created_at")?;
        let titles = optional_string_column(&batch, "title")?;
        let thumbnails = optional_string_column(&batch, "thumbnail")?;
        let contents = optional_string_column(&batch, "content")?;
        let directories = optional_string_column(&batch, "directory")?;
        let main_colors = optional_string_column(&batch, "main_color")?;
        let profiles = optional_string_column(&batch, "profile")?;
        let tasks_json = optional_string_column(&batch, "tasks_json")?;
        let embedding_source_texts = optional_string_column(&batch, "embedding_source_text")?;
        let updated_ats = int64_column(&batch, "updated_at")?;

        for row in 0..batch.num_rows() {
            let directory = read_optional_string_from_column(directories, row);
            let main_color = read_optional_string_from_column(main_colors, row);

            records.push(StoredArticleRecord {
                id: ids.value(row),
                url: read_optional_string(urls, row),
                article_uid: article_uids.value(row).to_string(),
                created_at: read_optional_int64_from_column(created_ats, row)
                    .unwrap_or_else(|| updated_ats.value(row)),
                title: read_optional_string_from_column(titles, row),
                thumbnail: read_optional_string_from_column(thumbnails, row),
                content: read_optional_string_from_column(contents, row),
                media_directory: directory.clone(),
                directory,
                main_color: main_color.clone(),
                profile: read_optional_string_from_column(profiles, row),
                primary_color: main_color,
                tasks_json: read_optional_string_from_column(tasks_json, row),
                updated_at: updated_ats.value(row),
                embedding_source_text: read_optional_string_from_column(embedding_source_texts, row),
            });
        }
    }

    Ok(records)
}

async fn query_articles(table: &Table, filter: Option<String>) -> Result<Vec<StoredArticleRecord>, String> {
    let query = match filter {
        Some(filter) => table.query().only_if(filter),
        None => table.query(),
    };

    let batches = query
        .execute()
        .await
        .map_err(|error| error.to_string())?
        .try_collect::<Vec<_>>()
        .await
        .map_err(|error| error.to_string())?;

    let mut records = records_from_batches(batches)?;
    sort_articles_by_created_at_desc(&mut records);
    Ok(records)
}

async fn query_articles_by_profile_id(
    table: &Table,
    profile_id: &str,
) -> Result<Vec<StoredArticleRecord>, String> {
    let normalized_profile_id = profile_id.trim();

    if normalized_profile_id.is_empty() || normalized_profile_id == UNKNOWN_PROFILE_ID {
        let all_records = query_articles(table, None).await?;
        return Ok(all_records
            .into_iter()
            .filter(|record| {
                normalize_profile_bucket(record.profile.as_deref()).0 == UNKNOWN_PROFILE_ID
            })
            .collect::<Vec<_>>());
    }

    let filter = format!("profile = {}", sql_string(normalized_profile_id));
    query_articles(table, Some(filter)).await
}

async fn query_articles_by_profile_and_date(
    table: &Table,
    profile_id: Option<&str>,
    created_at_from: Option<i64>,
    limit: Option<usize>,
) -> Result<Vec<StoredArticleRecord>, String> {
    let normalized_profile_id = profile_id
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut filters = Vec::new();

    if let Some(value) = created_at_from {
        filters.push(format!("created_at >= {value}"));
    }

    match normalized_profile_id {
        Some(value) if value == UNKNOWN_PROFILE_ID => {
            let query = match filters.is_empty() {
                true => table.query(),
                false => table.query().only_if(filters.join(" AND ")),
            };

            let batches = query
                .execute()
                .await
                .map_err(|error| error.to_string())?
                .try_collect::<Vec<_>>()
                .await
                .map_err(|error| error.to_string())?;

            let mut records = records_from_batches(batches)?;
            sort_articles_by_created_at_desc(&mut records);

            return Ok(records
                .into_iter()
                .filter(|record| {
                    normalize_profile_bucket(record.profile.as_deref()).0 == UNKNOWN_PROFILE_ID
                })
                .take(limit.unwrap_or(usize::MAX))
                .collect::<Vec<_>>());
        }
        Some(value) => filters.push(format!("profile = {}", sql_string(value))),
        None => {}
    }

    let query = match filters.is_empty() {
        true => table.query(),
        false => table.query().only_if(filters.join(" AND ")),
    };

    let batches = query
        .execute()
        .await
        .map_err(|error| error.to_string())?
        .try_collect::<Vec<_>>()
        .await
        .map_err(|error| error.to_string())?;

    let mut records = records_from_batches(batches)?;
    sort_articles_by_created_at_desc(&mut records);

    if let Some(limit) = limit {
        records.truncate(limit);
    }

    Ok(records)
}

async fn query_profiles(
    table: &Table,
    filter: Option<String>,
) -> Result<Vec<StoredArticleProfileRecord>, String> {
    let query = match filter {
        Some(filter) => table.query().only_if(filter),
        None => table.query(),
    };

    let batches = query
        .execute()
        .await
        .map_err(|error| error.to_string())?
        .try_collect::<Vec<_>>()
        .await
        .map_err(|error| error.to_string())?;

    let mut profiles = Vec::new();

    for batch in batches {
        let ids = string_column(&batch, "id")?;
        let names = string_column(&batch, "name")?;
        let counts = int64_column(&batch, "count")?;
        let profile_pictures = optional_string_column(&batch, "profile_picture")?;

        for row in 0..batch.num_rows() {
            profiles.push(StoredArticleProfileRecord {
                id: ids.value(row).to_string(),
                name: names.value(row).to_string(),
                count: counts.value(row),
                profile_picture: read_optional_string_from_column(profile_pictures, row),
            });
        }
    }

    Ok(profiles)
}

async fn upsert_profile_rows(
    table: &Table,
    profiles: &[StoredArticleProfileRecord],
) -> Result<(), String> {
    if profiles.is_empty() {
        return Ok(());
    }

    let mut profile_merge = table.merge_insert(&["id"]);
    profile_merge.when_matched_update_all(None);
    profile_merge.when_not_matched_insert_all();
    profile_merge
        .execute(Box::new(RecordBatchIterator::new(
            vec![Ok(article_profiles_batch(profiles)?)],
            article_profiles_schema(),
        )))
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

async fn rebuild_profiles_from_articles(
	articles_table: &Table,
	profile_table: &Table,
	profile_picture_input: Option<(String, String)>,
) -> Result<(), String> {
	let existing_profiles = query_profiles(profile_table, None).await?;
	let existing_pictures: HashMap<String, Option<String>> = existing_profiles
		.into_iter()
		.map(|p| (p.id, p.profile_picture))
		.collect();

	let all_articles = query_articles(articles_table, None).await?;
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
			});
		}
	}

	upsert_profile_rows(profile_table, &aggregated).await
}

#[tauri::command]
pub async fn list_stored_articles(
    app: AppHandle,
    fields: Option<Vec<String>>,
) -> Result<Vec<Value>, String> {
    let db = connection(&app).await?;
    let table = open_articles_table(&db).await?;
    let records = query_articles(&table, None).await?;
    Ok(records
        .iter()
        .map(|record| filter_record_to_json(record, &fields))
        .collect())
}

#[tauri::command]
pub async fn list_stored_article_profiles(
    app: AppHandle,
) -> Result<Vec<StoredArticleProfileRecord>, String> {
    let db = connection(&app).await?;
    let profile_table = open_article_profiles_table(&db).await?;
    let mut profiles = query_profiles(&profile_table, None).await?;

    if profiles.is_empty() {
        let article_table = open_articles_table(&db).await?;
        let records = query_articles(&article_table, None).await?;
        let aggregated = aggregate_profiles(records);
        upsert_profile_rows(&profile_table, &aggregated).await?;
        profiles = aggregated;
    }

    profiles.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.name.cmp(&right.name))
    });

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
    let db = connection(&app).await?;
    let table = open_articles_table(&db).await?;
    let records = query_articles_by_profile_and_date(
        &table,
        Some(profile_id.as_str()),
        created_at_from,
        limit,
    )
    .await?;

    Ok(records
        .iter()
        .map(|record| filter_record_to_json(record, &fields))
        .collect())
}

#[tauri::command]
pub async fn list_profiles_with_articles_after(
    app: AppHandle,
    created_at_from: i64,
) -> Result<Vec<ProfileWithMostRecentArticle>, String> {
    let db = connection(&app).await?;
    let table = open_articles_table(&db).await?;

    let filter = format!("created_at >= {created_at_from}");
    let records = query_articles(&table, Some(filter)).await?;

    let mut profile_map: std::collections::HashMap<String, (String, i64)> =
        std::collections::HashMap::new();

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

    let profile_table = open_article_profiles_table(&db).await?;
    let profile_pictures: std::collections::HashMap<String, Option<String>> =
        query_profiles(&profile_table, None)
            .await?
            .into_iter()
            .map(|profile| (profile.id, profile.profile_picture))
            .collect();

    let mut profiles: Vec<ProfileWithMostRecentArticle> = profile_map
        .into_iter()
        .map(|(id, (name, most_recent_created_at))| ProfileWithMostRecentArticle {
            id: id.clone(),
            name,
            most_recent_created_at,
            profile_picture: profile_pictures.get(&id).cloned().flatten(),
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
    let db = connection(&app).await?;
    let table = open_articles_table(&db).await?;
    let filter = format!("url = {}", sql_string(&url));
    let mut records = query_articles(&table, Some(filter)).await?;
    Ok(records.pop())
}


async fn insert_article_row(
    table: &Table,
    input: &UpsertStoredArticleInput,
    created_at: i64,
) -> Result<(), String> {
    table
        .add(article_batch(input, created_at)?)
        .execute()
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}

async fn update_article_row(table: &Table, input: &UpsertStoredArticleInput) -> Result<(), String> {
    let updated_at = chrono_like_now();
    table
        .update()
        .only_if(format!("url = {}", sql_string(&input.url)))
        .column("title", sql_optional_string(input.title.as_deref()))
        .column("thumbnail", sql_optional_string(input.thumbnail.as_deref()))
        .column("content", sql_optional_string(input.content.as_deref()))
        .column("directory", sql_optional_string(input.directory.as_deref()))
        .column("main_color", sql_optional_string(input.main_color.as_deref()))
        .column("profile", sql_optional_string(input.profile.as_deref()))
        .column("tasks_json", sql_string(&input.tasks_json))
        .column(
            "embedding_source_text",
            sql_optional_string(input.embedding_source_text.as_deref()),
        )
        .column("updated_at", updated_at.to_string())
        .execute()
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
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

    let db = connection(&app).await?;
    let articles_table = open_articles_table(&db).await?;
    let previous_article = get_stored_article_by_url(app.clone(), input.url.clone()).await?;
    if previous_article.is_some() {
        update_article_row(&articles_table, &input).await?;
    } else {
		insert_article_row(&articles_table, &input, chrono_like_now()).await?;
	}

    let profile_table = open_article_profiles_table(&db).await?;
    let next_profile_bucket = normalize_profile_bucket(input.profile.as_deref());
    let profile_picture_input = input.profile_picture.clone().map(|picture| (next_profile_bucket.0, picture));
    rebuild_profiles_from_articles(&articles_table, &profile_table, profile_picture_input).await?;

    let article_search_table = open_article_search_table(&db).await?;
    let article_uid = article_uid_from_url(&input.url);
    let delete_filter = format!("article_uid = {}", sql_string(&article_uid));

    if input.search_rows.is_empty() {
        article_search_table
            .delete(&delete_filter)
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let mut search_merge = article_search_table.merge_insert(&["row_id"]);
    search_merge.when_matched_update_all(None);
    search_merge.when_not_matched_insert_all();
    search_merge.when_not_matched_by_source_delete(Some(delete_filter));
    search_merge
        .execute(Box::new(RecordBatchIterator::new(
            vec![Ok(article_search_batch(&input)?)],
            article_search_schema(),
        )))
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_stored_article_by_url(
    app: AppHandle,
    url: String,
) -> Result<bool, String> {
    let db = connection(&app).await?;
    let articles_table = open_articles_table(&db).await?;
    let article = get_stored_article_by_url(app.clone(), url.clone()).await?;

    let Some(article) = article else {
        return Ok(false);
    };

    let article_filter = format!("url = {}", sql_string(&url));
    articles_table
        .delete(&article_filter)
        .await
        .map_err(|error| error.to_string())?;

    let search_table = open_article_search_table(&db).await?;
    let search_filter = format!("article_uid = {}", sql_string(&article.article_uid));
    search_table
        .delete(&search_filter)
        .await
        .map_err(|error| error.to_string())?;

    let profile_table = open_article_profiles_table(&db).await?;
    rebuild_profiles_from_articles(&articles_table, &profile_table, None).await?;

    Ok(true)
}

#[tauri::command]
pub async fn delete_stored_article_profile(
    app: AppHandle,
    profile_id: String,
) -> Result<DeleteStoredArticleProfileResult, String> {
    let db = connection(&app).await?;
    let articles_table = open_articles_table(&db).await?;
    let articles = query_articles_by_profile_id(&articles_table, &profile_id).await?;

    if articles.is_empty() {
        return Ok(DeleteStoredArticleProfileResult {
            success: true,
            deleted_count: 0,
        });
    }

    let mut deleted_count = 0;

    for article in articles {
        let Some(url) = article.url else {
            continue;
        };

        if delete_stored_article_by_url(app.clone(), url).await? {
            deleted_count += 1;
        }
    }

    Ok(DeleteStoredArticleProfileResult {
        success: true,
        deleted_count,
    })
}