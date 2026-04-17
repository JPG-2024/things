use text_splitter::{ChunkConfig, CodeSplitter, MarkdownSplitter, TextSplitter};
use tree_sitter_typescript::LANGUAGE_TYPESCRIPT;

/// Configuration for text splitting mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SplitMode {
    /// Split markdown while respecting structure (headings, blocks, code fences)
    Markdown,
    /// Split on sentence boundaries (good for podcast transcripts)
    Podcast,
    /// Split TypeScript code while respecting syntax tree depth
    CodeTs,
}

/// Split text into chunks based on the given mode
///
/// # Arguments
/// * `mode` - The splitting strategy to use
/// * `text` - The text to split
/// * `capacity_chars` - Maximum characters per chunk
/// * `overlap_chars` - Optional character overlap between chunks (must be < capacity)
///
/// # Returns
/// A vector of text chunks as strings
///
/// # Errors
/// Returns an error string if overlap >= capacity or if tree-sitter fails
pub fn split_text(
    mode: SplitMode,
    text: &str,
    capacity_chars: usize,
    overlap_chars: Option<usize>,
) -> Result<Vec<String>, String> {
    if capacity_chars == 0 {
        return Err("Capacity must be greater than 0".to_string());
    }

    let overlap = overlap_chars.unwrap_or(0);
    if overlap >= capacity_chars {
        return Err("Overlap must be less than capacity".to_string());
    }

    match mode {
        SplitMode::Markdown => split_markdown(text, capacity_chars, overlap),
        SplitMode::Podcast => split_podcast(text, capacity_chars, overlap),
        SplitMode::CodeTs => split_code_typescript(text, capacity_chars, overlap),
    }
}

/// Split markdown while preserving structure (headings, blocks, code fences)
fn split_markdown(text: &str, _capacity: usize, overlap: usize) -> Result<Vec<String>, String> {
    // For markdown we keep a reasonable default range rather than a fixed capacity.
    // The `_capacity` argument is unused intentionally but kept in the API for
    // compatibility with other splitters.
    let config = ChunkConfig::new(500..1500)
        .with_overlap(overlap)
        .map_err(|e| format!("Invalid chunk config: {}", e))?;

    let splitter = MarkdownSplitter::new(config);
    let chunks: Vec<String> = splitter
        .chunks(text)
        .map(|s| s.to_string())
        .collect();

    println!("{}", chunks.join("\n________________________________________________\n"));

    Ok(chunks)
}

/// Split text on sentence boundaries (good for podcast transcripts)
/// Uses Unicode sentence boundaries, which typically align well with "." punctuation
fn split_podcast(text: &str, capacity: usize, overlap: usize) -> Result<Vec<String>, String> {
    let config = ChunkConfig::new(capacity)
        .with_overlap(overlap)
        .map_err(|e| format!("Invalid chunk config: {}", e))?;

    let splitter = TextSplitter::new(config);
    let chunks: Vec<String> = splitter
        .chunks(text)
        .map(|s| s.to_string())
        .collect();

    Ok(chunks)
}

/// Split TypeScript code while respecting syntax tree depth
fn split_code_typescript(text: &str, capacity: usize, overlap: usize) -> Result<Vec<String>, String> {
    let config = ChunkConfig::new(capacity)
        .with_overlap(overlap)
        .map_err(|e| format!("Invalid chunk config: {}", e))?;

    let splitter = CodeSplitter::new(LANGUAGE_TYPESCRIPT, config)
        .map_err(|e| format!("Failed to create TypeScript splitter: {}", e))?;

    let chunks: Vec<String> = splitter
        .chunks(text)
        .map(|s| s.to_string())
        .collect();

    Ok(chunks)
}

/// Tauri command wrapper for splitting text
#[tauri::command]
pub fn split_text_command(
    mode: String,
    text: String,
    capacity_chars: usize,
    overlap_chars: Option<usize>,
) -> Result<Vec<String>, String> {
    let split_mode = match mode.as_str() {
        "markdown" => SplitMode::Markdown,
        "podcast" => SplitMode::Podcast,
        "code_ts" => SplitMode::CodeTs,
        _ => return Err(format!("Unknown split mode: {}", mode)),
    };

    split_text(split_mode, &text, capacity_chars, overlap_chars)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_markdown() {
        let text = r#"# Heading 1

This is a paragraph with some text.

## Heading 2

Another paragraph here. And more text.
"#;
        let result = split_text(SplitMode::Markdown, text, 50, None);
        assert!(result.is_ok());
        let chunks = result.unwrap();
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_split_podcast() {
        let text = "First sentence here. Second sentence follows. Third sentence ends.";
        let result = split_text(SplitMode::Podcast, text, 30, None);
        assert!(result.is_ok());
        let chunks = result.unwrap();
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_split_code_ts() {
        let code = r#"
function greet(name: string): string {
    return `Hello, ${name}!`;
}

const add = (a: number, b: number): number => a + b;
"#;
        let result = split_text(SplitMode::CodeTs, code, 60, None);
        assert!(result.is_ok());
        let chunks = result.unwrap();
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_split_with_overlap() {
        let text = "Sentence one. Sentence two. Sentence three.";
        let result = split_text(SplitMode::Podcast, text, 25, Some(5));
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_overlap() {
        let text = "Test text.";
        let result = split_text(SplitMode::Podcast, text, 10, Some(15));
        assert!(result.is_err());
    }

    #[test]
    fn test_zero_capacity() {
        let text = "Test text.";
        let result = split_text(SplitMode::Podcast, text, 0, None);
        assert!(result.is_err());
    }
}
