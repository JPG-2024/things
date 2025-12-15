import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core'

/**
 * Parameters matching the Rust `generate_completion_stream` command.
 * Keys use the same names as the Rust function (snake_case) so they
 * deserialize correctly when invoking the Tauri command.
 */
export interface GenerateCompletionStreamParams {
  model: string;
  prompt: string;
  system?: string | null;
  context?: number[] | null;
  ollama_url?: string | null;
  batch_size?: number | null;
}

/** Example:
 * await generateStream({ model: 'ministral-3:3b', prompt: 'Hello', system: 'You are a creative AI', batch_size: 5 })
 */

export async function generateStream(params: GenerateCompletionStreamParams, callback?: (chunk: string) => void): Promise<number[]> {
  let fullResponse = '';
  let unlisten: () => void;

  // Listen for streaming events
  unlisten = await listen('ollama-rs-stream', (event: any) => {
    const payload = event.payload;

    if (payload.status === 'loading') {
      console.log('Loading model:', payload.model);
    } else if (payload.status === 'streaming') {
      fullResponse += payload.tokens;

      if (callback) {
        callback(payload.tokens);
      }

      if (payload.done) {
        debugger
        console.log('Streaming complete!');
        console.log('Full response:', fullResponse);
        unlisten(); // Stop listening
      }
    }
  });

  try {
    // Forward parameters to the Rust command. Use snake_case keys to match Rust
    // signature: model, prompt, system, context, ollama_url, batch_size
    const context = await invoke<number[]>('generate_completion_stream', {
      model: params.model,
      prompt: params.prompt,
      system: params.system,
      context: params.context,
      ollama_url: params.ollama_url,
      batch_size: params.batch_size,
    });

    console.log('Returned context:', context);
    return context;
  } catch (error) {
    console.error('Error:', error);
    unlisten();
    throw error;
  }
}