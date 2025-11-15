import { invoke } from '@tauri-apps/api/core'
import { listenInferenceStream } from '@/lib/listeners/inferenceListener';

let unlistenInference: (() => void) | null = null;

interface inferenceParams {
    prompt: string;
}

export async function inference({prompt}: inferenceParams, callback: (result: string) => void) {
    // Set up the inference stream listener
    if (!unlistenInference) {
        unlistenInference = await listenInferenceStream((content) => {
            callback(content)
        });
    }
    
    // Call the inference command
    await invoke('inference', { prompt })

    // Clean up listener
    if (unlistenInference) {
        unlistenInference();
        unlistenInference = null;
    }
}