use std::fs;
use std::sync::Arc;

use arrow::array::{
	Array, FixedSizeListArray, Float32Array, Float64Array, Int32Array, Int64Array, RecordBatch,
	StringArray,
};
use arrow::datatypes::{DataType, Field, Float32Type, Schema};
use futures::StreamExt;
use lancedb::connect;
use lancedb::index::Index;
use lancedb::query::{ExecutableQuery, QueryBase};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const EMBEDDINGS_DIR: &str = "embeddings";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkInput {
	pub article_url: String,
	pub chunk_text: String,
	pub embedding: Vec<f32>,
	pub created_at: Option<i64>,
	pub category: Option<String>,
	pub profile_id: Option<String>,
	pub model_name: Option<String>,
	pub model_dimensions: Option<i32>,
	pub start_offset: Option<i32>,
	pub end_offset: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchChunkResult {
	pub id: String,
	pub article_url: String,
	pub chunk_text: String,
	pub distance: f64,
	pub category: Option<String>,
	pub profile_id: Option<String>,
	pub model_name: Option<String>,
	pub model_dimensions: Option<i32>,
	pub start_offset: Option<i32>,
	pub end_offset: Option<i32>,
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
		Field::new("category", DataType::Utf8, true),
		Field::new("profile_id", DataType::Utf8, true),
		Field::new("model_name", DataType::Utf8, true),
		Field::new("model_dimensions", DataType::Int32, true),
		Field::new("start_offset", DataType::Int32, true),
		Field::new("end_offset", DataType::Int32, true),
	]))
}

fn build_batch(chunks: &[ChunkInput], schema: &Arc<Schema>, dim: i32) -> Result<RecordBatch, String> {
	let count = chunks.len();
	let mut ids: Vec<String> = Vec::with_capacity(count);
	let mut urls: Vec<String> = Vec::with_capacity(count);
	let mut texts: Vec<String> = Vec::with_capacity(count);
	let mut embeddings: Vec<Option<Vec<Option<f32>>>> = Vec::with_capacity(count);
	let mut created_ats: Vec<i64> = Vec::with_capacity(count);
	let mut categories: Vec<Option<&str>> = Vec::with_capacity(count);
	let mut profile_ids: Vec<Option<&str>> = Vec::with_capacity(count);
	let mut model_names: Vec<Option<&str>> = Vec::with_capacity(count);
	let mut model_dimensions_values: Vec<Option<i32>> = Vec::with_capacity(count);
	let mut start_offsets: Vec<Option<i32>> = Vec::with_capacity(count);
	let mut end_offsets: Vec<Option<i32>> = Vec::with_capacity(count);

	let now = now_millis();

	for chunk in chunks {
		ids.push(uuid::Uuid::new_v4().to_string());
		urls.push(chunk.article_url.clone());
		texts.push(chunk.chunk_text.clone());
		embeddings.push(Some(chunk.embedding.iter().map(|&v| Some(v)).collect()));
		created_ats.push(chunk.created_at.unwrap_or(now));
		categories.push(chunk.category.as_deref());
		profile_ids.push(chunk.profile_id.as_deref());
		model_names.push(chunk.model_name.as_deref());
		model_dimensions_values.push(chunk.model_dimensions);
		start_offsets.push(chunk.start_offset);
		end_offsets.push(chunk.end_offset);
	}

	let id_array = Arc::new(StringArray::from(ids));
	let url_array = Arc::new(StringArray::from(urls));
	let text_array = Arc::new(StringArray::from(texts));
	let embedding_array = Arc::new(FixedSizeListArray::from_iter_primitive::<Float32Type, _, _>(
		embeddings,
		dim,
	));
	let created_at_array = Arc::new(Int64Array::from(created_ats));
	let category_array = Arc::new(StringArray::from(categories));
	let profile_id_array = Arc::new(StringArray::from(profile_ids));
	let model_name_array = Arc::new(StringArray::from(model_names));
	let model_dimensions_array = Arc::new(Int32Array::from(model_dimensions_values));
	let start_offset_array = Arc::new(Int32Array::from(start_offsets));
	let end_offset_array = Arc::new(Int32Array::from(end_offsets));

	RecordBatch::try_new(
		schema.clone(),
		vec![
			id_array,
			url_array,
			text_array,
			embedding_array,
			created_at_array,
			category_array,
			profile_id_array,
			model_name_array,
			model_dimensions_array,
			start_offset_array,
			end_offset_array,
		],
	)
	.map_err(|e: arrow::error::ArrowError| e.to_string())
}

fn escape_sql_ident(value: &str) -> String {
	value.replace('\'', "''")
}

#[tauri::command]
pub async fn index_chunks(app: AppHandle, table: String, chunks: Vec<ChunkInput>) -> Result<usize, String> {
	if chunks.is_empty() {
		return Ok(0);
	}

	let dim = chunks[0].embedding.len() as i32;
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;

	let schema = chunk_schema(dim);
	let batch = build_batch(&chunks, &schema, dim)?;

	match db.open_table(&table).execute().await {
		Ok(tbl) => {
			let article_url = &chunks[0].article_url;
			let predicate = format!("article_url = '{}'", escape_sql_ident(article_url));
			tbl.delete(&predicate).await.map_err(|e: lancedb::Error| e.to_string())?;
			tbl.add(vec![batch]).execute().await.map_err(|e: lancedb::Error| e.to_string())?;
		}
		Err(_) => {
			let tbl = db
				.create_table(&table, vec![batch])
				.execute()
				.await
				.map_err(|e: lancedb::Error| e.to_string())?;
			let _ = tbl
				.create_index(&["embedding"], Index::Auto)
				.execute()
				.await;
		}
	}

	Ok(chunks.len())
}

fn build_filter_pair(column: &str, value: &str) -> String {
	format!("{} = '{}'", column, value.replace('\'', "''"))
}

fn build_filter_pair_int(column: &str, value: i32) -> String {
	format!("{} = {}", column, value)
}

#[tauri::command]
pub async fn search_similar_chunks(
	app: AppHandle,
	table: String,
	embedding: Vec<f32>,
	limit: Option<usize>,
	article_url: Option<String>,
	category: Option<String>,
	profile_id: Option<String>,
	model_name: Option<String>,
	model_dimensions: Option<i32>,
) -> Result<Vec<SearchChunkResult>, String> {
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;
	let tbl = db
		.open_table(&table)
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	let mut filters: Vec<String> = Vec::new();

	if let Some(ref url) = article_url {
		filters.push(build_filter_pair("article_url", url));
	}
	if let Some(ref cat) = category {
		filters.push(build_filter_pair("category", cat));
	}
	if let Some(ref pid) = profile_id {
		filters.push(build_filter_pair("profile_id", pid));
	}
	if let Some(ref mn) = model_name {
		filters.push(build_filter_pair("model_name", mn));
	}
	if let Some(md) = model_dimensions {
		filters.push(build_filter_pair_int("model_dimensions", md));
	}

	let mut query = tbl.query();

	if !filters.is_empty() {
		query = query.only_if(filters.join(" AND "));
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

		let categories: &StringArray = batch
			.column(5)
			.as_any()
			.downcast_ref::<StringArray>()
			.ok_or("column 5 is not StringArray")?;
		let profile_ids: &StringArray = batch
			.column(6)
			.as_any()
			.downcast_ref::<StringArray>()
			.ok_or("column 6 is not StringArray")?;
		let model_names: &StringArray = batch
			.column(7)
			.as_any()
			.downcast_ref::<StringArray>()
			.ok_or("column 7 is not StringArray")?;
		let model_dimensions_col: &Int32Array = batch
			.column(8)
			.as_any()
			.downcast_ref::<Int32Array>()
			.ok_or("column 8 is not Int32Array")?;
		let start_offset_col: &Int32Array = batch
			.column(9)
			.as_any()
			.downcast_ref::<Int32Array>()
			.ok_or("column 9 is not Int32Array")?;
		let end_offset_col: &Int32Array = batch
			.column(10)
			.as_any()
			.downcast_ref::<Int32Array>()
			.ok_or("column 10 is not Int32Array")?;

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
				category: if categories.is_null(i) { None } else { Some(categories.value(i).to_string()) },
				profile_id: if profile_ids.is_null(i) { None } else { Some(profile_ids.value(i).to_string()) },
				model_name: if model_names.is_null(i) { None } else { Some(model_names.value(i).to_string()) },
				model_dimensions: if model_dimensions_col.is_null(i) { None } else { Some(model_dimensions_col.value(i)) },
				start_offset: if start_offset_col.is_null(i) { None } else { Some(start_offset_col.value(i)) },
				end_offset: if end_offset_col.is_null(i) { None } else { Some(end_offset_col.value(i)) },
			});
		}
	}

	Ok(results)
}

#[tauri::command]
pub async fn delete_chunks_by_article(app: AppHandle, table: String, article_url: String) -> Result<bool, String> {
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;
	let tbl = db
		.open_table(&table)
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	let predicate = format!("article_url = '{}'", escape_sql_ident(&article_url));
	tbl.delete(&predicate)
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	Ok(true)
}

#[tauri::command]
pub async fn delete_chunk(app: AppHandle, table: String, id: String) -> Result<bool, String> {
	let path = embeddings_path(&app)?;
	let db = connect(&path).execute().await.map_err(|e: lancedb::Error| e.to_string())?;
	let tbl = db
		.open_table(&table)
		.execute()
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	let predicate = format!("id = '{}'", escape_sql_ident(&id));
	tbl.delete(&predicate)
		.await
		.map_err(|e: lancedb::Error| e.to_string())?;

	Ok(true)
}
