//! On-device Phonon TTS (`ptts`) behind Tauri commands.
//!
//! The external omnivoice HTTP service stays the default engine; this module
//! is the alternative selected by `ttsState.config.engine`. Synthesis returns
//! WAV bytes through [`tauri::ipc::Response`] — the frontend parses duration
//! from the WAV header, so the `{ blob, durationSeconds }` contract of
//! `generateSpeech` stays unchanged.
//!
//! The checkpoint is user-supplied (hand-downloaded; no `hub` feature, so the
//! library cannot download anything) and its directory is validated before
//! use. The loaded model is kept resident across chunks — reloading 75 MB per
//! chunk would destroy the frontend prefetch strategy — and dropped when the
//! engine switch turns off.

use std::path::Path;
use tauri::ipc::Response;

/// Weights a checkpoint may carry, in resolution order. Mirrors ptts'
/// `weight_candidates` for the quants that run without GPU features.
const WEIGHT_CANDIDATES: [&str; 3] = ["model.q8.gguf", "model.q4k.gguf", "model.safetensors"];

/// Required checkpoint files besides weights: the config ptts reads and the
/// Hugging Face JSON tokenizer (the `hf` feature compiles its reader).
const REQUIRED_FILES: [&str; 2] = ["config.json", "tokenizer.json"];

/// Validates that `dir` is a ptts checkpoint directory: a directory holding
/// `config.json`, `tokenizer.json` and at least one weights file. Pure
/// filesystem checks — no model load — so Settings can call it on blur.
pub fn validate_checkpoint_dir(dir: &Path) -> Result<(), String> {
	if !dir.is_dir() {
		return Err(format!("not a directory: {}", dir.display()));
	}
	for required in REQUIRED_FILES {
		if !dir.join(required).is_file() {
			return Err(format!("missing {required} in {}", dir.display()));
		}
	}
	if !WEIGHT_CANDIDATES.iter().any(|w| dir.join(w).is_file()) {
		return Err(format!(
			"no weights ({}) in {}",
			WEIGHT_CANDIDATES.join(", "),
			dir.display()
		));
	}
	Ok(())
}

#[cfg(feature = "phonon")]
mod imp {
	use super::{validate_checkpoint_dir, REQUIRED_FILES};

	use std::path::{Path, PathBuf};
	use std::sync::{Arc, Mutex, MutexGuard};

	use ptts::checkpoint::{Checkpoint, ResolveOptions};
	use ptts::preprocess::Normalize;
	use ptts::synth::{DeviceKind, Quant, SpeechOptions, Synth};

	/// A loaded model plus the inputs that built it, so a directory or
	/// language change triggers exactly one rebuild. `pub` only because
	/// [`PhononState::inner`] is; `imp` itself is a private module.
	pub struct LoadedPhonon {
		dir: PathBuf,
		lang_key: String,
		tts: Synth,
	}

	/// Resident model: `None` until the first Phonon synthesis or voice list.
	/// `Arc` so async commands can clone it into `spawn_blocking`.
	#[derive(Default)]
	pub struct PhononState {
		pub inner: Arc<Mutex<Option<LoadedPhonon>>>,
	}

	fn lock(
		state: &PhononState,
	) -> Result<MutexGuard<'_, Option<LoadedPhonon>>, String> {
		state
			.inner
			.lock()
			.map_err(|_| "Phonon state poisoned".to_string())
	}

	/// Language code → normalization policy. A code ptts does not know maps to
	/// `Normalize::OFF` (`Lang::None`): wrong-language digit spelling is worse
	/// than none, and the checkpoint only speaks its trained languages anyway.
	pub fn normalize_for(code: &str) -> Normalize {
		code.parse::<Normalize>().unwrap_or(Normalize::OFF)
	}

	/// Picks the weights file and the quant that reads it. Explicit names
	/// keep the two agreeing; ptts' candidate list for a bare quant would
	/// silently accept a mismatched format.
	fn weights_for(dir: &Path) -> (&'static str, Quant) {
		if dir.join("model.q8.gguf").is_file() {
			("model.q8.gguf", Quant::Q80)
		} else if dir.join("model.q4k.gguf").is_file() {
			("model.q4k.gguf", Quant::Q4k)
		} else {
			("model.safetensors", Quant::F32)
		}
	}

	/// Loads the checkpoint and builds the synthesis instance on the CPU.
	fn load(dir: &Path, lang_key: &str) -> Result<LoadedPhonon, String> {
		validate_checkpoint_dir(dir)?;
		debug_assert!(REQUIRED_FILES.iter().all(|f| dir.join(f).is_file()));
		let canonical = dir.canonicalize().map_err(|e| e.to_string())?;
		let (weights, quant) = weights_for(&canonical);

		let checkpoint = Checkpoint::resolve(
			&canonical,
			ResolveOptions {
				quant,
				weights: Some(weights),
			},
		)
		.map_err(|e| e.to_string())?;

		let normalize = lang_key
			.parse::<Normalize>()
			.unwrap_or(Normalize::OFF);
		let mut tts = checkpoint
			.builder(normalize)
			.device(DeviceKind::Cpu)
			.build()
			.map_err(|e| e.to_string())?;
		checkpoint.register_voices(&mut tts);

		Ok(LoadedPhonon {
			dir: canonical,
			lang_key: lang_key.to_string(),
			tts,
		})
	}

	/// Returns the resident model, rebuilding when the directory or the
	/// normalization language changed since it was loaded. `lang` is keyed by
	/// the policy it parses to (`"ES"`, `"es"` → `es`; unknown → `none`), so
	/// equivalent codes share one loaded model instead of thrashing it.
	fn ensure_loaded<'a>(
		slot: &'a mut Option<LoadedPhonon>,
		dir: &str,
		lang: &str,
	) -> Result<&'a LoadedPhonon, String> {
		let path = Path::new(dir);
		// Fail fast with the actionable message before touching the model;
		// `load` re-checks so the two can't drift.
		validate_checkpoint_dir(path)?;
		let canonical = path.canonicalize().map_err(|e| e.to_string())?;
		let lang_key = normalize_for(lang).as_str().to_string();

		let needs_rebuild = match slot.as_ref() {
			Some(loaded) => loaded.lang_key != lang_key || loaded.dir != canonical,
			None => true,
		};
		if needs_rebuild {
			*slot = Some(load(path, &lang_key)?);
		}
		Ok(slot
			.as_ref()
			.expect("just loaded or rebuilt the resident model"))
	}

	/// Synthesizes `text` and encodes mono 16-bit WAV bytes. Holds the model
	/// lock for the whole request — callers run it inside `spawn_blocking`,
	/// which keeps concurrent chunks serialized instead of racing the model.
	pub fn synthesize(
		state: &PhononState,
		dir: &str,
		lang: &str,
		text: &str,
		voice: Option<&str>,
		temperature: f32,
	) -> Result<Vec<u8>, String> {
		if text.trim().is_empty() {
			return Err("cannot synthesize empty text".to_string());
		}
		let mut guard = lock(state)?;
		let loaded = ensure_loaded(&mut guard, dir, lang)?;

		let mut options = SpeechOptions::default().temperature(temperature);
		if let Some(name) = voice.filter(|n| !n.trim().is_empty()) {
			options = options.voice(name);
		}

		let pcm = loaded
			.tts
			.say_with(text, &options)
			.map_err(|e| e.to_string())?;
		if pcm.is_empty() {
			return Err("Generated audio is empty (0 samples)".to_string());
		}

		let mut wav: Vec<u8> = Vec::new();
		ptts::wav::write_pcm_as_wav(&mut wav, &pcm, loaded.tts.sample_rate(), 1)
			.map_err(|e| format!("failed to encode WAV: {e}"))?;
		Ok(wav)
	}

	/// Registered voice names of the resident model (loads it if needed).
	pub fn list_voices(state: &PhononState, dir: &str, lang: &str) -> Result<Vec<String>, String> {
		let mut guard = lock(state)?;
		ensure_loaded(&mut guard, dir, lang).map(|loaded| loaded.tts.voices())
	}
}

#[cfg(feature = "phonon")]
pub use imp::PhononState;

#[cfg(not(feature = "phonon"))]
/// Exists so `lib.rs` can manage it unconditionally; without the `phonon`
/// feature nothing is ever loaded.
#[derive(Default)]
pub struct PhononState;

/* -------------------------------------------------------------------------- */
/* Commands: real under the feature, explicit errors without it.              */
/* -------------------------------------------------------------------------- */

/// Whether this build can synthesize with Phonon at all. The frontend probes
/// it once at boot and disables the engine switch when it returns `false`.
#[tauri::command]
pub fn tts_phonon_available() -> bool {
	cfg!(feature = "phonon")
}

/// Validates a checkpoint directory without loading it. Returns `"ok"` on
/// success, or `Err` naming the missing piece.
#[tauri::command]
pub fn tts_validate_checkpoint(dir: String) -> Result<String, String> {
	validate_checkpoint_dir(Path::new(&dir))?;
	Ok("ok".to_string())
}

/// Loads (or reuses) the resident model and returns its registered voices.
/// The first call pays the model load — deliberately shared with synthesis,
/// so opening the voice list warms the engine for the playlist.
#[cfg(feature = "phonon")]
#[tauri::command]
pub async fn tts_list_voices(
	dir: String,
	lang: String,
	state: tauri::State<'_, PhononState>,
) -> Result<Vec<String>, String> {
	let inner = state.inner.clone();
	tauri::async_runtime::spawn_blocking(move || imp::list_voices(
		&PhononState { inner },
		&dir,
		&lang,
	))
	.await
	.map_err(|e| e.to_string())?
}

#[cfg(not(feature = "phonon"))]
#[tauri::command]
pub async fn tts_list_voices(dir: String, lang: String) -> Result<Vec<String>, String> {
	let _ = (dir, lang);
	Err("this build was compiled without the `phonon` feature".to_string())
}

/// Synthesizes one frontend chunk: text + Phonon voice/temperature/language →
/// WAV bytes. Blocking inference runs off the async runtime; concurrent calls
/// serialize on the resident-model mutex (the playlist is single-flight
/// anyway).
#[cfg(feature = "phonon")]
#[tauri::command]
pub async fn tts_synthesize(
	dir: String,
	lang: String,
	text: String,
	voice: Option<String>,
	temperature: f32,
	state: tauri::State<'_, PhononState>,
) -> Result<Response, String> {
	let inner = state.inner.clone();
	tauri::async_runtime::spawn_blocking(move || {
		let wav = imp::synthesize(
			&PhononState { inner },
			&dir,
			&lang,
			&text,
			voice.as_deref(),
			temperature,
		)?;
		Ok(Response::new(wav))
	})
	.await
	.map_err(|e| e.to_string())?
}

#[cfg(not(feature = "phonon"))]
#[tauri::command]
pub async fn tts_synthesize(
	dir: String,
	lang: String,
	text: String,
	voice: Option<String>,
	temperature: f32,
) -> Result<Response, String> {
	let _ = (dir, lang, text, voice, temperature);
	Err("this build was compiled without the `phonon` feature".to_string())
}

/// Drops the resident model when the engine switch turns off. Fire-and-forget
/// from the frontend; the next Phonon request lazy-loads again.
#[cfg(feature = "phonon")]
#[tauri::command]
pub async fn tts_phonon_unload(state: tauri::State<'_, PhononState>) -> Result<(), String> {
	let inner = state.inner.clone();
	tauri::async_runtime::spawn_blocking(move || {
		let state = PhononState { inner };
		let mut guard = state
			.inner
			.lock()
			.map_err(|_| "Phonon state poisoned".to_string())?;
		*guard = None;
		Ok(())
	})
	.await
	.map_err(|e| e.to_string())?
}

#[cfg(not(feature = "phonon"))]
#[tauri::command]
pub async fn tts_phonon_unload() -> Result<(), String> {
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Builds a minimal checkpoint-shaped directory holding `files`.
	fn checkpoint_dir(files: &[&str]) -> std::path::PathBuf {
		let dir = std::env::temp_dir().join(format!(
			"phonon-ckpt-{}-{}",
			std::process::id(),
			files.join("_")
		));
		let _ = std::fs::remove_dir_all(&dir);
		std::fs::create_dir_all(&dir).unwrap();
		for file in files {
			std::fs::write(dir.join(file), b"").unwrap();
		}
		dir
	}

	#[test]
	fn validate_checkpoint_dir_accepts_a_complete_layout() {
		let dir = checkpoint_dir(&["config.json", "tokenizer.json", "model.q8.gguf"]);
		assert!(validate_checkpoint_dir(&dir).is_ok());
		let _ = std::fs::remove_dir_all(&dir);
	}

	#[test]
	fn validate_checkpoint_dir_rejects_a_missing_file() {
		// No tokenizer: ptts fails at build time with a less actionable
		// message, so validation has to catch it first.
		let dir = checkpoint_dir(&["config.json", "model.q8.gguf"]);
		let err = validate_checkpoint_dir(&dir).unwrap_err();
		assert!(err.contains("tokenizer.json"), "got: {err}");
		let _ = std::fs::remove_dir_all(&dir);

		let dir = checkpoint_dir(&["tokenizer.json", "model.q8.gguf"]);
		let err = validate_checkpoint_dir(&dir).unwrap_err();
		assert!(err.contains("config.json"), "got: {err}");
		let _ = std::fs::remove_dir_all(&dir);

		// Config + tokenizer but no weights at all.
		let dir = checkpoint_dir(&["config.json", "tokenizer.json"]);
		let err = validate_checkpoint_dir(&dir).unwrap_err();
		assert!(err.contains("no weights"), "got: {err}");
		let _ = std::fs::remove_dir_all(&dir);
	}

	#[test]
	fn validate_checkpoint_dir_rejects_a_non_directory() {
		let err = validate_checkpoint_dir(Path::new("/nonexistent/phonon-model")).unwrap_err();
		assert!(err.contains("not a directory"), "got: {err}");
	}

	/// The checkpoint used by the ignored smoke test, supplied by the caller so
	/// the repository never hardcodes a machine-specific path:
	/// `PHONON_TEST_CHECKPOINT=/path/to/checkpoint cargo test phonon_tts -- --ignored`.
	fn smoke_checkpoint() -> Option<std::path::PathBuf> {
		std::env::var_os("PHONON_TEST_CHECKPOINT").map(std::path::PathBuf::from)
	}

	#[cfg(feature = "phonon")]
	#[test]
	fn language_mapping_prefers_the_code_and_falls_back_to_off() {
		// App languages ptts normalizes: the exact code wins.
		for code in ["es", "en", "fr", "de", "pt", "it"] {
			assert_eq!(imp::normalize_for(code).as_str(), code);
		}
		// Unmapped code and explicit opt-out both disable normalization.
		assert_eq!(imp::normalize_for("xx").as_str(), "none");
		assert_eq!(imp::normalize_for("").as_str(), "none");
		assert_eq!(imp::normalize_for("none").as_str(), "none");
		// Case/whitespace from a UI round-trip must not break the parse.
		assert_eq!(imp::normalize_for(" ES ").as_str(), "es");
	}

	/// End-to-end smoke over a real checkpoint: load, list voices, synthesize
	/// a short Spanish sentence and check the WAV header. Ignored by default
	/// because it needs a hand-downloaded checkpoint and takes tens of
	/// seconds; run it with `--ignored` and `PHONON_TEST_CHECKPOINT` set.
	#[cfg(feature = "phonon")]
	#[ignore = "needs a real checkpoint: set PHONON_TEST_CHECKPOINT and run with --ignored"]
	#[test]
	fn synthesizes_a_real_chunk_from_a_checkpoint() {
		let Some(shipped) = smoke_checkpoint() else {
			return;
		};
		let shipped = shipped.to_string_lossy();
		let state = imp::PhononState::default();

		let voices = imp::list_voices(&state, &shipped, "es").expect("voices load");
		assert!(!voices.is_empty(), "checkpoint registers at least one voice");

		let wav = imp::synthesize(&state, &shipped, "es", "Hola, esta es una prueba.", None, 0.3)
			.expect("synthesis succeeds");
		// Canonical 44-byte WAV header, non-zero data chunk, valid byte rate.
		assert!(wav.len() > 44, "got {} bytes", wav.len());
		assert_eq!(&wav[0..4], b"RIFF");
		assert_eq!(&wav[8..12], b"WAVE");
		let byte_rate = u32::from_le_bytes(wav[28..32].try_into().unwrap());
		let data_len = u32::from_le_bytes(wav[40..44].try_into().unwrap());
		assert!(byte_rate > 0 && data_len > 0);

		// The resident model survives across requests when the normalization
		// policy is unchanged — " ES " parses to the same policy as "es", so
		// the key matches and no reload happens (the whole point of the cache).
		let wav2 = imp::synthesize(&state, &shipped, " ES ", "Segunda llamada.", None, 0.3)
			.expect("second synthesis reuses the resident model");
		assert!(wav2.len() > 44);

		// An unmapped language still synthesizes: it falls back to no
		// normalization instead of erroring (a rebuild, but a working one).
		let wav3 = imp::synthesize(&state, &shipped, "xx", "Tercera llamada.", None, 0.3)
			.expect("unmapped language falls back instead of failing");
		assert!(wav3.len() > 44);
	}
}
