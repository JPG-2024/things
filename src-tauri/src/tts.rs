use crate::tts_helpers::{
    load_text_to_speech, load_voice_style, write_wav_file, sanitize_filename, TextToSpeech,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::OnceCell;
use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use std::sync::mpsc::{channel, Sender};
use lazy_static::lazy_static;

// Global TTS engine state - kept loaded for app lifetime to avoid ONNX mutex cleanup issues
static TTS_ENGINE: OnceCell<Mutex<TextToSpeech>> = OnceCell::const_new();

// Commands for audio playback control
enum AudioCommand {
    Play(String),
    Stop,
}

// Global channel to send commands to audio thread
lazy_static! {
    static ref AUDIO_SENDER: Arc<Mutex<Option<Sender<AudioCommand>>>> = Arc::new(Mutex::new(None));
}

// Initialize the audio playback thread (call once)
fn init_audio_thread() {
    let mut sender_lock = AUDIO_SENDER.lock().unwrap();
    
    // Only initialize once
    if sender_lock.is_some() {
        return;
    }
    
    let (tx, rx) = channel::<AudioCommand>();
    *sender_lock = Some(tx);
    drop(sender_lock);
    
    // Spawn dedicated audio thread
    std::thread::spawn(move || {
        let (_stream, stream_handle) = match OutputStream::try_default() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to initialize audio output: {}", e);
                return;
            }
        };
        
        let mut current_sink: Option<Sink> = None;
        
        for cmd in rx {
            match cmd {
                AudioCommand::Play(file_path) => {
                    // Stop current playback if any
                    if let Some(sink) = current_sink.take() {
                        sink.stop();
                    }
                    
                    // Create new sink and play
                    match Sink::try_new(&stream_handle) {
                        Ok(sink) => {
                            match File::open(&file_path) {
                                Ok(file) => {
                                    match Decoder::new(BufReader::new(file)) {
                                        Ok(source) => {
                                            sink.append(source);
                                            println!("🔊 Playing: {}", file_path);
                                            current_sink = Some(sink);
                                        }
                                        Err(e) => eprintln!("Failed to decode audio: {}", e),
                                    }
                                }
                                Err(e) => eprintln!("Failed to open audio file: {}", e),
                            }
                        }
                        Err(e) => eprintln!("Failed to create audio sink: {}", e),
                    }
                }
                AudioCommand::Stop => {
                    if let Some(sink) = current_sink.take() {
                        sink.stop();
                        println!("⏹️  Stopped playback");
                    }
                }
            }
        }
    });
}

/// Options for TTS synthesis
#[derive(Debug, Deserialize)]
pub struct TTSOptions {
    pub onnx_dir: Option<String>,
    pub total_step: Option<usize>,
    pub speed: Option<f32>,
}

/// Result of TTS synthesis
#[derive(Debug, Serialize)]
pub struct TTSResult {
    pub file_path: String,
    pub duration: f32,
}

/// Initialize or get the TTS engine (auto-initialization on first call)
async fn get_or_init_tts(
    app: &AppHandle,
    onnx_dir: Option<String>,
) -> Result<&'static Mutex<TextToSpeech>, String> {
    TTS_ENGINE
        .get_or_try_init(|| async {
            app.emit(
                "flow-status",
                json!({"key": "tts-init", "status": "loading models", "data": null}),
            )
            .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

            let dir = onnx_dir.unwrap_or_else(|| "assets/onnx".to_string());
            println!("🔊 Loading TTS models from: {}", dir);

            let tts = load_text_to_speech(&dir, false)
                .map_err(|e| format!("Failed to load TTS models: {}", e))?;

            app.emit(
                "flow-status",
                json!({"key": "tts-init", "status": "done", "data": null}),
            )
            .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

            println!("✅ TTS models loaded successfully");
            Ok(Mutex::new(tts))
        })
        .await
}

/// Synthesize speech from text
///
/// # Arguments
/// * `app` - Tauri app handle for emitting events
/// * `text` - Text to synthesize
/// * `lang` - Language code (en, ko, es, pt, fr)
/// * `voice_style_path` - Path to voice style JSON file
/// * `options` - Optional synthesis parameters
///
/// # Returns
/// TTSResult with file path in system temp directory and duration
#[tauri::command]
pub async fn synthesize_speech(
    app: AppHandle,
    text: String,
    lang: String,
    voice_style_path: String,
    options: Option<TTSOptions>,
) -> Result<TTSResult, String> {
    app.emit(
        "flow-status",
        json!({"key": "tts", "status": "initializing", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Get or initialize TTS engine
    let onnx_dir = options.as_ref().and_then(|o| o.onnx_dir.clone());
    let tts_mutex = get_or_init_tts(&app, onnx_dir).await?;

    // Extract options with defaults
    let total_step = options.as_ref().and_then(|o| o.total_step).unwrap_or(5);
    let speed = options.as_ref().and_then(|o| o.speed).unwrap_or(1.05);

    app.emit(
        "flow-status",
        json!({"key": "tts", "status": "loading voice style", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Load voice style (not cached - loaded fresh each time)
    let style = load_voice_style(&[voice_style_path.clone()], false)
        .map_err(|e| format!("Failed to load voice style: {}", e))?;

    app.emit(
        "flow-status",
        json!({"key": "tts", "status": "TTS", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    println!("🎤 Synthesizing...");

    // Synthesize speech
    let (wav, duration) = {
        let mut tts = tts_mutex
            .lock()
            .map_err(|e| format!("Failed to lock TTS engine: {}", e))?;

        tts.call(&text, &lang, &style, total_step, speed, 0.3)
            .map_err(|e| format!("Failed to synthesize speech: {}", e))?
    };

    app.emit(
        "flow-status",
        json!({"key": "tts", "status": "saving", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Generate filename and save to temp directory
    let temp_dir = std::env::temp_dir();
    let filename = format!("tts_{}_{}.wav", sanitize_filename(&text, 20), uuid::Uuid::new_v4());
    let output_path = temp_dir.join(filename);

    let sample_rate = {
        let tts = tts_mutex
            .lock()
            .map_err(|e| format!("Failed to lock TTS engine: {}", e))?;
        tts.sample_rate
    };

    write_wav_file(&output_path, &wav, sample_rate)
        .map_err(|e| format!("Failed to write WAV file: {}", e))?;

    println!("💾 Saved: {}", output_path.display());

    app.emit(
        "flow-status",
        json!({"key": "tts", "status": "done", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(TTSResult {
        file_path: output_path.to_string_lossy().to_string(),
        duration,
    })
}

/// Synthesize speech from multiple texts in batch mode
///
/// # Arguments
/// * `app` - Tauri app handle for emitting events
/// * `texts` - Array of texts to synthesize
/// * `langs` - Array of language codes (must match texts length)
/// * `voice_style_paths` - Array of voice style paths (must match texts length)
/// * `options` - Optional synthesis parameters
///
/// # Returns
/// Array of TTSResult with file paths in system temp directory and durations
#[tauri::command]
pub async fn synthesize_speech_batch(
    app: AppHandle,
    texts: Vec<String>,
    langs: Vec<String>,
    voice_style_paths: Vec<String>,
    options: Option<TTSOptions>,
) -> Result<Vec<TTSResult>, String> {
    // Validate input lengths
    if texts.len() != langs.len() {
        return Err(format!(
            "Number of texts ({}) must match number of languages ({})",
            texts.len(),
            langs.len()
        ));
    }
    if texts.len() != voice_style_paths.len() {
        return Err(format!(
            "Number of texts ({}) must match number of voice styles ({})",
            texts.len(),
            voice_style_paths.len()
        ));
    }

    app.emit(
        "flow-status",
        json!({"key": "tts-batch", "status": "initializing", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Get or initialize TTS engine
    let onnx_dir = options.as_ref().and_then(|o| o.onnx_dir.clone());
    let tts_mutex = get_or_init_tts(&app, onnx_dir).await?;

    // Extract options with defaults
    let total_step = options.as_ref().and_then(|o| o.total_step).unwrap_or(5);
    let speed = options.as_ref().and_then(|o| o.speed).unwrap_or(1.05);

    app.emit(
        "flow-status",
        json!({"key": "tts-batch", "status": "loading voice styles", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    // Load voice styles (not cached - loaded fresh each time)
    let style = load_voice_style(&voice_style_paths, false)
        .map_err(|e| format!("Failed to load voice styles: {}", e))?;

    app.emit(
        "flow-status",
        json!({"key": "tts-batch", "status": "synthesizing", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    println!("🎤 Batch synthesizing {} texts", texts.len());

    // Synthesize speech in batch
    let (wav, durations) = {
        let mut tts = tts_mutex
            .lock()
            .map_err(|e| format!("Failed to lock TTS engine: {}", e))?;

        tts.batch(&texts, &langs, &style, total_step, speed)
            .map_err(|e| format!("Failed to synthesize speech batch: {}", e))?
    };

    app.emit(
        "flow-status",
        json!({"key": "tts-batch", "status": "saving", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let sample_rate = {
        let tts = tts_mutex
            .lock()
            .map_err(|e| format!("Failed to lock TTS engine: {}", e))?;
        tts.sample_rate
    };

    // Save each output to temp directory
    let mut results = Vec::new();
    let temp_dir = std::env::temp_dir();
    let bsz = texts.len();

    for i in 0..bsz {
        let filename = format!(
            "tts_{}_{}.wav",
            sanitize_filename(&texts[i], 20),
            uuid::Uuid::new_v4()
        );
        let output_path = temp_dir.join(filename);

        // Extract the audio slice for this text
        let wav_len = wav.len() / bsz;
        let actual_len = (sample_rate as f32 * durations[i]) as usize;
        let wav_start = i * wav_len;
        let wav_end = wav_start + actual_len.min(wav_len);
        let wav_slice = &wav[wav_start..wav_end];

        write_wav_file(&output_path, wav_slice, sample_rate)
            .map_err(|e| format!("Failed to write WAV file {}: {}", i, e))?;

        println!("💾 Saved [{}]: {}", i + 1, output_path.display());

        results.push(TTSResult {
            file_path: output_path.to_string_lossy().to_string(),
            duration: durations[i],
        });
    }

    app.emit(
        "flow-status",
        json!({"key": "tts-batch", "status": "done", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(results)
}

/// Clean up a TTS-generated WAV file from temp directory
///
/// # Arguments
/// * `app` - Tauri app handle for emitting events
/// * `file_path` - Path to the WAV file to delete
///
/// # Returns
/// Result indicating success or error
#[tauri::command]
pub async fn cleanup_tts_file(app: AppHandle, file_path: String) -> Result<(), String> {
    app.emit(
        "flow-status",
        json!({"key": "tts-cleanup", "status": "deleting", "data": file_path}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    let path = PathBuf::from(&file_path);

    // Verify the file is in temp directory for safety
    let temp_dir = std::env::temp_dir();
    if !path.starts_with(&temp_dir) {
        return Err(format!(
            "File not in temp directory. Refusing to delete: {}",
            file_path
        ));
    }

    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete file {}: {}", file_path, e))?;

    println!("🗑️  Deleted: {}", file_path);

    app.emit(
        "flow-status",
        json!({"key": "tts-cleanup", "status": "done", "data": null}),
    )
    .map_err(|e| format!("Failed to emit flow-status event: {}", e))?;

    Ok(())
}

/// Play a TTS-generated audio file
///
/// # Arguments
/// * `file_path` - Path to the WAV file to play
///
/// # Returns
/// Result indicating success or error
#[tauri::command]
pub async fn play_tts_file(file_path: String) -> Result<(), String> {
    // Initialize audio thread if not already done
    init_audio_thread();
    
    let sender = AUDIO_SENDER
        .lock()
        .map_err(|e| format!("Failed to lock audio sender: {}", e))?;
    
    if let Some(tx) = sender.as_ref() {
        tx.send(AudioCommand::Play(file_path))
            .map_err(|e| format!("Failed to send play command: {}", e))?;
        Ok(())
    } else {
        Err("Audio system not initialized".to_string())
    }
}

/// Stop the currently playing TTS audio
///
/// # Returns
/// Result indicating success or error
#[tauri::command]
pub async fn stop_tts_playback() -> Result<(), String> {
    let sender = AUDIO_SENDER
        .lock()
        .map_err(|e| format!("Failed to lock audio sender: {}", e))?;
    
    if let Some(tx) = sender.as_ref() {
        tx.send(AudioCommand::Stop)
            .map_err(|e| format!("Failed to send stop command: {}", e))?;
        Ok(())
    } else {
        Err("Audio system not initialized".to_string())
    }
}
