use std::fs;
use std::sync::Arc;

use arrow_array::{Array, Int32Array, Int64Array, RecordBatch, RecordBatchIterator, StringArray};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use futures_util::TryStreamExt;
use lancedb::index::scalar::FtsIndexBuilder;
use lancedb::index::Index;
use lancedb::query::{ExecutableQuery, QueryBase};
use lancedb::{connect, Connection, Table};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const ARTICLES_TABLE: &str = "articles";
const ARTICLE_SEARCH_TABLE: &str = "article_search";
const DB_DIRECTORY: &str = "lancedb";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredArticleRecord {
    pub id: i64,
    pub url: Option<String>,
    pub article_uid: String,
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

async fn open_articles_table(db: &Connection) -> Result<Table, String> {
    open_or_create_table(db, ARTICLES_TABLE, articles_schema()).await
}

async fn open_article_search_table(db: &Connection) -> Result<Table, String> {
    let table = open_or_create_table(db, ARTICLE_SEARCH_TABLE, article_search_schema()).await?;
    //ensure_search_indices(&table).await?;
    Ok(table)
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

fn article_batch(input: &UpsertStoredArticleInput) -> Result<RecordBatch, String> {
    let article_uid = article_uid_from_url(&input.url);
    let id = article_numeric_id(&article_uid);
    let updated_at = chrono_like_now();
    let schema = articles_schema();

    let columns: Vec<Arc<dyn Array>> = vec![
        Arc::new(Int64Array::from(vec![id])),
        Arc::new(StringArray::from(vec![input.url.as_str()])),
        Arc::new(StringArray::from(vec![article_uid.as_str()])),
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

fn records_from_batches(batches: Vec<RecordBatch>) -> Result<Vec<StoredArticleRecord>, String> {
    let mut records = Vec::new();

    for batch in batches {
        let ids = int64_column(&batch, "id")?;
        let urls = string_column(&batch, "url")?;
        let article_uids = string_column(&batch, "article_uid")?;
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

    records_from_batches(batches)
}

#[tauri::command]
pub async fn list_stored_articles(app: AppHandle) -> Result<Vec<StoredArticleRecord>, String> {
    let db = connection(&app).await?;
    let table = open_articles_table(&db).await?;
    query_articles(&table, None).await
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

async fn merge_article_row(
    table: &Table,
    input: &UpsertStoredArticleInput,
) -> Result<(), String> {
    let schema = articles_schema();
    let mut article_merge = table.merge_insert(&["url"]);
    article_merge.when_matched_update_all(None);
    article_merge.when_not_matched_insert_all();
    article_merge
        .execute(Box::new(RecordBatchIterator::new(
            vec![Ok(article_batch(input)?)],
            schema,
        )))
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
    merge_article_row(&articles_table, &input).await?;

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

    Ok(true)
}