pub use yt_transcript_rs::YouTubeTranscriptApi;

/// Fetches a YouTube video transcript as a single string
/// 
/// # Arguments
/// * `video_id` - The YouTube video ID (e.g., "dQw4w9WgXcQ")
/// * `languages` - Slice of language codes to try in order (e.g., &["en", "es"])
/// 
/// # Returns
/// A Result containing the full transcript as a String, or an error
#[tauri::command]
pub async fn get_youtube_transcript(
    id: String,
    languages: Vec<String>,
) -> Result<String, String> {
    let api = YouTubeTranscriptApi::new(None, None, None)
        .map_err(|e| e.to_string())?;
    
    let language_strs: Vec<&str> = languages.iter().map(|s| s.as_str()).collect();
    
    let transcript = api
        .fetch_transcript(&id, language_strs.as_slice(), false)
        .await
        .map_err(|e| e.to_string())?;

    Ok(transcript.text())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_youtube_transcript() {
        // This test uses a real YouTube video that has transcripts
        let result = get_youtube_transcript(
            "dQw4w9WgXcQ".to_string(),
            vec!["en".to_string()],
        )
        .await;
        assert!(result.is_ok());
        let transcript = result.unwrap();
        assert!(!transcript.is_empty());
    }
}
