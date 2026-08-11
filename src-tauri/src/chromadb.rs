use chromadb::client::ChromaClient;
use chromadb::collection::{CollectionEntries, QueryOptions, QueryResult};
use serde_json::{json, Value};
use tauri::command;

#[command]
pub async fn store_embeddings(
    texts: Vec<String>,
    metadata: Value,
    article_id: String,
    model: Option<String>,
    collection_name: String,
) -> Result<String, String> {
    let model = model.unwrap_or_else(|| "bge-m3".to_string());

    // 1. Generate Embeddings
    let embeddings = crate::llama_cpp::llama_cpp_embeddings(
        model,
        texts.clone(),
    )
    .await?;

    // 2. Initialize Chroma Client
    // Defaults to http://localhost:8000
    let client = ChromaClient::new(Default::default())
        .await
        .map_err(|e| format!("Failed to create Chroma client: {}", e))?;

    // 3. Get or Create Collection
    let collection = client
        .get_or_create_collection(&collection_name, None)
        .await
        .map_err(|e| format!("Failed to get/create collection: {}", e))?;

    // 4. Prepare Data for Upsert
    let mut ids = Vec::new();
    let mut metadatas = Vec::new();
    let mut documents = Vec::new();
    
    // Ensure metadata is an object
    let base_metadata = metadata.as_object().ok_or("Metadata must be a JSON object")?;

    for (i, text) in texts.iter().enumerate() {
        // ID: article_id-index
        ids.push(format!("{}-{}", article_id, i));

        // Metadata: clone base and add index
        let mut meta = base_metadata.clone();
        meta.insert("chunk_index".to_string(), json!(i));
        // We don't strictly need to store text in metadata if it's in documents, 
        // but sometimes it's useful. For now, let's stick to the requested metadata.
        metadatas.push(meta);

        documents.push(text.as_str());
    }

    // 5. Upsert
    let entries = CollectionEntries {
        ids: ids.iter().map(|s| s.as_str()).collect(),
        embeddings: Some(embeddings),
        metadatas: Some(metadatas),
        documents: Some(documents),
    };

    collection
        .upsert(entries, None)
        .await
        .map_err(|e| format!("Failed to upsert to Chroma: {}", e))?;

    Ok("Successfully stored embeddings".to_string())
}

#[command]
pub async fn similarity_search(
    query_text: String,
    collection_name: String,
    n_results: Option<i32>,
    where_metadata: Option<Value>,
    include_documents: Option<bool>,
    include_embeddings: Option<bool>,
    model: Option<String>,
    ollama_url: Option<String>,
) -> Result<Value, String> {
    let model = model.unwrap_or_else(|| "bge-m3".to_string());

    // 1. Generate embedding for query text
    let embeddings = crate::ollama_rs::generate_embeddings_batch(
        vec![query_text],
        model,
        ollama_url,
    )
    .await?;

    let query_embedding = embeddings.into_iter().next()
        .ok_or("Failed to generate query embedding")?;

    // 2. Initialize Chroma Client
    let client = ChromaClient::new(Default::default())
        .await
        .map_err(|e| format!("Failed to create Chroma client: {}", e))?;

    // 3. Get or Create Collection
    let collection = client
        .get_or_create_collection(&collection_name, None)
        .await
        .map_err(|e| format!("Failed to get/create collection: {}", e))?;

    // 4. Prepare include vector
    let mut include = vec![];
    if include_documents.unwrap_or(true) {
        include.push("documents".into());
    }
    if include_embeddings.unwrap_or(false) {
        include.push("embeddings".into());
    }
    include.push("metadatas".into());
    include.push("distances".into());

    // 5. Build query options
    let query = QueryOptions {
        query_texts: None,
        query_embeddings: Some(vec![query_embedding]),
        where_metadata,
        where_document: None,
        n_results: n_results.map(|n| n as usize),
        include: if include.is_empty() { None } else { Some(include) },
    };

    // 6. Execute query
    let result: QueryResult = collection
        .query(query, None)
        .await
        .map_err(|e| format!("Failed to query collection: {}", e))?;

    // Convert result to JSON
    let response = json!({
        "ids": result.ids,
        "documents": result.documents,
        "metadatas": result.metadatas,
        "distances": result.distances,
        "embeddings": result.embeddings,
    });

    Ok(response)
}
