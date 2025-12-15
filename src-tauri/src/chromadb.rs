use chromadb::client::ChromaClient;
use chromadb::collection::CollectionEntries;
use serde_json::{json, Value};
use tauri::command;

#[command]
pub async fn store_embeddings(
    texts: Vec<String>,
    metadata: Value,
    article_id: String,
    model: Option<String>,
    ollama_url: Option<String>,
    collection_name: String,
) -> Result<String, String> {
    let model = model.unwrap_or_else(|| "nomic-embed-text".to_string());

    // 1. Generate Embeddings
    let embeddings = crate::ollama_rs::generate_embeddings_batch(
        texts.clone(),
        model,
        ollama_url,
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
