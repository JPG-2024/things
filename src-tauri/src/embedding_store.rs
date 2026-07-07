use std::fs;
use std::sync::Arc;

use arrow::array::{FixedSizeListArray, Float32Array, Float64Array, Int64Array, RecordBatch, StringArray};
use arrow::datatypes::{DataType, Field, Float32Type, Schema};
use futures::StreamExt;
use lancedb::connect;
use lancedb::index::Index;
use lancedb::query::{ExecutableQuery, QueryBase};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CHUNKS_TABLE: &str = "article_chunks";
const EMBEDDINGS_DIR: &str = "embeddings";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkInput {
	pub article_url: String,
	pub chunk_text: String,
	pub embedding: Vec<f32>,
	pub created_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchChunkResult {
	pub id: String,
	pub article_url: String,
	pub chunk_text: String,
	pub distance: f64,
}

fn now_millis() -> i64 {
	std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_millis() as i64)
		.unwrap_or_default()
}

fn embeddings_path(app: &AppHandle) -> Result<String, String> {
	let app_data_dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
	fs::create_dir_all(&app_data_dir).map_err(|e: std::io::Error| e.to_string())?;
	Ok(app_data_dir.join(EMBEDDINGS_DIR).to_string_lossy().to_string())
}

fn chunk_schema(dim: i32) -> Arc<Schema> {
	Arc::new(Schema::new(vec![
		Field::new("id", DataType::Utf8, false),
		Field::new("article_url", DataType::Utf8, false),
		Field::new("chunk_text", DataType::Utf8, false),
		Field::new(
			"embedding",
			DataType::FixedSizeList(
				Arc::new(Field::new("item", DataType::Float32, true)),
				dim,
			),
			false,
		),
		Field::new("created_at", DataType::Int64, false),
	]))
}

fn build_batch(chunks: &[ChunkInput], schema: &Arc<Schema>, dim: i32) -> Result<RecordBatch, String> {
	let count = chunks.len();
	let mut ids: Vec<String> = Vec::with_capacity(count);
	let mut urls: Vec<String> = Vec::with_capacity(count);
	let mut texts: Vec<String> = Vec::with_capacity(count);
	let mut embeddings: Vec<Option<Vec<Option<f32>>>> = Vec::with_capacity(count);
	let mut created_ats: Vec<i64> = Vec::with_capacity(count);

	let now = now_millis();

	for chunk in chunks {
		ids.push(uuid::Uuid::new_v4().to_string());
		urls.push(chunk.article_url.clone());
		texts.push(chunk.chunk_text.clone());
		embeddings.push(Some(chunk.embedding.iter().map(|&v| Some(v)).collect()));
		created_ats.push(chunk.created_at.unwrap_or(now));
	}

	let id_array = Arc::new(StringArray::from(ids));
	let url_array = Arc::new(StringArray::from(urls));
	let text_array = Arc::new(StringArray::from(texts));
	let embedding_array = Arc::new(FixedSizeListArray::from_iter_primitive::<Float32Type, _, _>(
		embeddings,
		dim,
	));
	let created_at_array = Arc::new(Int64Array::from(created_ats));

	RecordBatch::try_new(
		schema.clone(),
		vec![id_array, url_array, text_array, embedding_array, created_at_array],
	)
	.map_err(|e: arrow::error::ArrowError| e.to_string())
}

fn escape_sql_ident(value: &str) -> String {
	value.replace('\'', "''")
}

#[tauri::command]
pub async fn index_chunks(app: AppHandle, chunks: Vec<ChunkInput>) -> Result<usize, String> {
	if chunks.is_empty() {
		return Ok(0);
	}

	let dim = chunks[0].embedding.len() as i32;
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;

	match db.open_table(CHUNKS_TABLE).execute().await {
		Ok(table) => {
			let schema = chunk_schema(dim);
			let batch = build_batch(&chunks, &schema, dim)?;
			table
				.add(vec![batch])
				.execute()
				.await
				.map_err(|e: lancedb::Error| e.to_string())?;
		}
		Err(_) => {
			let schema = chunk_schema(dim);
			let batch = build_batch(&chunks, &schema, dim)?;
			db.create_table(CHUNKS_TABLE, vec![batch])
				.execute()
				.await
				.map_err(|e: lancedb::Error| e.to_string())?;
		}
	}

	let table = db
		.open_table(CHUNKS_TABLE)
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;
	let _ = table
		.create_index(&["embedding"], Index::Auto)
		.execute()
		.await;

	Ok(chunks.len())
}

#[tauri::command]
pub async fn search_similar_chunks(
	app: AppHandle,
	embedding: Vec<f32>,
	limit: Option<usize>,
	article_url: Option<String>,
) -> Result<Vec<SearchChunkResult>, String> {
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;
	let table = db
		.open_table(CHUNKS_TABLE)
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	let mut query = table.query();

	if let Some(ref url) = article_url {
		query = query.only_if(format!("article_url = '{}'", escape_sql_ident(url)));
	}

	let mut stream = query
		.nearest_to(embedding)
		.map_err(|e: lancedb::Error| e.to_string())?
		.limit(limit.unwrap_or(10))
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	let mut batches: Vec<RecordBatch> = Vec::new();
	while let Some(batch_result) = stream.next().await {
		batches.push(batch_result.map_err(|e: lancedb::Error| e.to_string())?);
	}

	let mut results = Vec::new();
	for batch in &batches {
		let batch: &RecordBatch = batch;
		let ids: &StringArray = batch
			.column(0)
			.as_any()
			.downcast_ref::<StringArray>()
			.ok_or("column 0 is not StringArray")?;
		let urls: &StringArray = batch
			.column(1)
			.as_any()
			.downcast_ref::<StringArray>()
			.ok_or("column 1 is not StringArray")?;
		let texts: &StringArray = batch
			.column(2)
			.as_any()
			.downcast_ref::<StringArray>()
			.ok_or("column 2 is not StringArray")?;

		let dist_col = batch
			.column_by_name("_distance")
			.ok_or("_distance column not found")?;
		let dist_values: Vec<f64> = if let Some(arr) = dist_col.as_any().downcast_ref::<Float32Array>() {
			(0..arr.len()).map(|i| arr.value(i) as f64).collect::<Vec<f64>>()
		} else if let Some(arr) = dist_col.as_any().downcast_ref::<Float64Array>() {
			(0..arr.len()).map(|i| arr.value(i)).collect::<Vec<f64>>()
		} else {
			return Err("_distance column has unexpected type".to_string());
		};

		for i in 0..batch.num_rows() {
			results.push(SearchChunkResult {
				id: ids.value(i).to_string(),
				article_url: urls.value(i).to_string(),
				chunk_text: texts.value(i).to_string(),
				distance: dist_values[i],
			});
		}
	}

	Ok(results)
}

#[tauri::command]
pub async fn delete_chunks_by_article(app: AppHandle, article_url: String) -> Result<bool, String> {
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;
	let table = db
		.open_table(CHUNKS_TABLE)
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	let predicate = format!("article_url = '{}'", escape_sql_ident(&article_url));
	table
		.delete(&predicate)
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	Ok(true)
}

#[tauri::command]
pub async fn delete_chunk(app: AppHandle, id: String) -> Result<bool, String> {
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;
	let table = db
		.open_table(CHUNKS_TABLE)
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	let predicate = format!("id = '{}'", escape_sql_ident(&id));
	table
		.delete(&predicate)
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	Ok(true)
}
