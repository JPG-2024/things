use std::sync::{Arc, Mutex};
use std::time::Duration;

use screencapturekit::async_api::{AsyncSCShareableContent, AsyncSCStream};
use screencapturekit::cm::{AudioBuffer, CMSampleBuffer, CMSampleBufferExt};
use screencapturekit::prelude::{SCContentFilter, SCStreamConfiguration, SCStreamOutputType};
use tauri::ipc::Response;
use tauri::State;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::audio_capture::AudioRecorderState;

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u16 = 2;
const STOP_TIMEOUT: Duration = Duration::from_secs(5);

pub struct MacosRecordingHandle {
	task: JoinHandle<()>,
	pcm: Arc<Mutex<Vec<u8>>>,
	error: Arc<Mutex<Option<String>>>,
	stop_tx: Option<oneshot::Sender<()>>
}

fn read_f32(data: &[u8], index: usize) -> f32 {
	let offset = index * 4;
	if offset + 4 <= data.len() {
		f32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
	} else {
		0.0
	}
}

fn append_audio(pcm: &Arc<Mutex<Vec<u8>>>, sample: &CMSampleBuffer) {
	let Some(list) = sample.audio_buffer_list() else {
		return;
	};

	let buffers: Vec<&AudioBuffer> = list.iter().collect();
	if buffers.is_empty() {
		return;
	}

	let total_channels: u32 = buffers.iter().map(|buffer| buffer.number_channels()).sum();
	if total_channels == 0 {
		return;
	}

	let planar = buffers.len() > 1 && buffers[0].number_channels() == 1;
	let frames = if planar {
		buffers
			.iter()
			.map(|buffer| buffer.data().len() / 4)
			.min()
			.unwrap_or(0)
	} else {
		buffers[0].data().len() / 4
	};
	if frames == 0 {
		return;
	}

	let mut out = Vec::with_capacity(frames * CHANNELS as usize * 2);
	for frame in 0..frames {
		for channel in 0..CHANNELS as usize {
			let value = if planar {
				read_f32(buffers[channel].data(), frame)
			} else {
				read_f32(buffers[0].data(), frame * total_channels as usize + channel)
			};
			let sample = (value.clamp(-1.0, 1.0) * 32767.0) as i16;
			out.extend_from_slice(&sample.to_le_bytes());
		}
	}

	if let Ok(mut guard) = pcm.lock() {
		guard.extend_from_slice(&out);
	}
}

fn wav_bytes(pcm: &[u8]) -> Vec<u8> {
	let data_len = pcm.len() as u32;
	let mut out = Vec::with_capacity(44 + pcm.len());
	out.extend_from_slice(b"RIFF");
	out.extend_from_slice(&(36 + data_len).to_le_bytes());
	out.extend_from_slice(b"WAVE");
	out.extend_from_slice(b"fmt ");
	out.extend_from_slice(&16u32.to_le_bytes());
	out.extend_from_slice(&1u16.to_le_bytes());
	out.extend_from_slice(&CHANNELS.to_le_bytes());
	out.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
	out.extend_from_slice(&(SAMPLE_RATE * CHANNELS as u32 * 2).to_le_bytes());
	out.extend_from_slice(&(CHANNELS * 2).to_le_bytes());
	out.extend_from_slice(&16u16.to_le_bytes());
	out.extend_from_slice(b"data");
	out.extend_from_slice(&data_len.to_le_bytes());
	out.extend_from_slice(pcm);
	out
}

pub async fn start_macos_recording(state: State<'_, AudioRecorderState>) -> Result<(), String> {
	{
		let guard = state.0.lock().map_err(|_| "Recorder state poisoned".to_string())?;
		if guard.is_some() {
			return Err("A recording is already in progress".to_string());
		}
	}

	let content = AsyncSCShareableContent::get().await.map_err(|error| {
		format!(
			"Failed to access screen content. Grant Screen Recording permission to Things in System Settings → Privacy & Security → Screen & System Audio Recording: {}",
			error
		)
	})?;

	let display = content
		.displays()
		.into_iter()
		.next()
		.ok_or_else(|| "No display available to record audio from".to_string())?;

	let filter = SCContentFilter::create()
		.with_display(&display)
		.with_excluding_windows(&[])
		.build();

	let config = SCStreamConfiguration::new()
		.with_captures_audio(true)
		.with_sample_rate(SAMPLE_RATE as i32)
		.with_channel_count(CHANNELS as i32)
		.with_excludes_current_process_audio(false);

	let stream = AsyncSCStream::new(&filter, &config, 64, SCStreamOutputType::Audio);
	stream
		.start_capture()
		.await
		.map_err(|error| format!("Failed to start audio capture: {}", error))?;

	let pcm = Arc::new(Mutex::new(Vec::<u8>::new()));
	let error_cell = Arc::new(Mutex::new(None::<String>));
	let (stop_tx, stop_rx) = oneshot::channel();

	let task_pcm = Arc::clone(&pcm);
	let task_error = Arc::clone(&error_cell);
	let task = tokio::spawn(async move {
		let mut stop_rx = stop_rx;
		loop {
			tokio::select! {
				_ = &mut stop_rx => {
					let _ = stream.stop_capture().await;
					while let Some((sample, kind)) = stream.try_next_typed() {
						if kind == SCStreamOutputType::Audio {
							append_audio(&task_pcm, &sample);
						}
					}
					break;
				}
				next = stream.next_typed() => {
					match next {
						Some((sample, kind)) => {
							if kind == SCStreamOutputType::Audio {
								append_audio(&task_pcm, &sample);
							}
						}
						None => {
							if let Some(error) = stream.take_error() {
								if let Ok(mut cell) = task_error.lock() {
									*cell = Some(format!("Audio capture stopped unexpectedly: {}", error));
								}
							}
							break;
						}
					}
				}
			}
		}
	});

	{
		let mut guard = state.0.lock().map_err(|_| "Recorder state poisoned".to_string())?;
		*guard = Some(crate::audio_capture::ActiveRecording::Macos(MacosRecordingHandle {
			task,
			pcm,
			error: error_cell,
			stop_tx: Some(stop_tx)
		}));
	}

	tokio::time::sleep(Duration::from_millis(400)).await;

	let mut guard = state.0.lock().map_err(|_| "Recorder state poisoned".to_string())?;
	let failed = match guard.as_mut() {
		Some(crate::audio_capture::ActiveRecording::Macos(handle)) => {
			handle.error.lock().map(|cell| cell.is_some()).unwrap_or(false)
		}
		_ => false
	};
	if failed {
		let detail = match guard.as_mut() {
			Some(crate::audio_capture::ActiveRecording::Macos(handle)) => {
				handle.error.lock().map(|cell| cell.clone()).unwrap_or(None)
			}
			_ => None
		};
		if let Some(crate::audio_capture::ActiveRecording::Macos(mut handle)) = guard.take() {
			if let Some(tx) = handle.stop_tx.take() {
				let _ = tx.send(());
			}
			handle.task.abort();
		}
		return Err(detail.unwrap_or_else(|| "Audio capture stopped unexpectedly".to_string()));
	}

	Ok(())
}

pub async fn stop_macos_recording(state: State<'_, AudioRecorderState>) -> Result<Response, String> {
	let mut handle = {
		let mut guard = state.0.lock().map_err(|_| "Recorder state poisoned".to_string())?;
		match guard.take() {
			Some(crate::audio_capture::ActiveRecording::Macos(handle)) => handle,
			_ => return Err("No recording in progress".to_string())
		}
	};

	if let Some(tx) = handle.stop_tx.take() {
		let _ = tx.send(());
	}

	let timed_out = tokio::time::timeout(STOP_TIMEOUT, &mut handle.task).await.is_err();
	if timed_out {
		handle.task.abort();
	}

	if let Some(error) = handle.error.lock().map(|guard| guard.clone()).unwrap_or(None) {
		return Err(error);
	}

	if timed_out {
		return Err("Audio capture did not stop in time and the recording may be incomplete"
			.to_string());
	}

	let pcm = handle
		.pcm
		.lock()
		.map_err(|_| "Recorder state poisoned".to_string())?
		.clone();

	if pcm.is_empty() {
		return Err("No audio was captured".to_string());
	}

	Ok(Response::new(wav_bytes(&pcm)))
}

#[cfg(test)]
mod tests {
	use super::wav_bytes;

	#[test]
	fn test_wav_bytes_header() {
		let pcm = vec![0u8; 96];
		let wav = wav_bytes(&pcm);
		assert_eq!(wav.len(), 44 + 96);
		assert_eq!(&wav[0..4], b"RIFF");
		assert_eq!(&wav[8..12], b"WAVE");
		assert_eq!(&wav[12..16], b"fmt ");
		assert_eq!(u16::from_le_bytes([wav[20], wav[21]]), 1);
		assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 2);
		assert_eq!(u32::from_le_bytes([wav[24], wav[25], wav[26], wav[27]]), 48_000);
		assert_eq!(&wav[36..40], b"data");
		assert_eq!(u32::from_le_bytes([wav[40], wav[41], wav[42], wav[43]]), 96);
	}
}