import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event';
import { viewState } from '@/stores/viewStore.svelte';
import { YOUTUBE_SUMMARY_PROMPT, PRESUMMARY, TECH_SUMMARY_SYSTEM_PROMPT } from '@/constants';
import { getYouTubeThumbnailUrl } from './utils/youtube';
import { getImageSrc } from './utils/dirs';
import { generate, generateStream } from './utils/ollama/generate'
import { extractKeywords } from './utils/extractKeywords';


async function generateCompletion(prompt: string) {
  let fullResponse = '';
  let unlisten: () => void;

  // Listen for streaming events
  unlisten = await listen('ollama-rs-stream', (event: any) => {
    const payload = event.payload;
  
    if (payload.status === 'loading') {
      console.log('Loading model:', payload.model);
    } else if (payload.status === 'streaming') {
      fullResponse += payload.tokens;
      console.log('Chunk:', payload);
      viewState.summary = fullResponse; // Update summary in viewState
      
      if (payload.done) {
        console.log('Streaming complete!');
        console.log('Full response:', fullResponse);
        unlisten(); // Stop listening
      }
    }
  });

  try {
    const context = await invoke<number[]>('generate_completion_stream', {
      model: 'ministral-3:3b',
      prompt,
      system: 'You are a creative AI assistant',
      batchSize: 5
    });
    
    console.log('Returned context:', context);
  } catch (error) {
    console.error('Error:', error);
    unlisten();
  }
}


export async function getYouTubeTranscript(videoLink: string, languages: string[] = ['en', 'es']): Promise<{  content: string, summary: string}> {
  //extract video id from youtube link
  const urlObj = new URL(videoLink)
  const videoId = urlObj.searchParams.get('v')
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  let _transcript: string

  try {
    const _mediaDir = await invoke<string>('url_to_folder_name', {url: videoLink})
    viewState.mediaDirectory = _mediaDir
    const ytThumbnailUrl = getYouTubeThumbnailUrl(videoId)
    const _mainImage = await invoke<string>('download_and_save_image', {url: ytThumbnailUrl, folderName: _mediaDir})
    viewState.mainImage = _mainImage
    viewState.mainImageSrc = await getImageSrc(_mediaDir, _mainImage)

    _transcript = await invoke<string>('get_youtube_transcript', {
      id: videoId,
      languages,
    })
    viewState.content = _transcript



    //const keywords = await extractKeywords(_transcript)
    //console.log('Extracted Keywords:', keywords);

/*      const preSummary = await generate({
        model: 'ministral-3:3b',
        prompt: `sigue las reglas:\n\n${_transcript}`,
        system: PRESUMMARY,
        options: {
          temperature: 0.0,
          top_k: 1,
          top_p: 0.1,
          repeat_penalty: 1.1,
          repeat_last_n: 128,
          presence_penalty: 0.0,
          frequency_penalty: 0.0,
          mirostat: 0,
        }
    });

    console.log('PreSummary:', preSummary.response); */

    // first summary can be long, so we stream the final summary  
/*      for await (const chunk of generateStream({
        model: 'gemma2:2b',
        prompt: `context: ${_transcript} \n\n give me a concise summary in 10 words`,
        system: YOUTUBE_SUMMARY_PROMPT,
        options: {
          "temperature": 0.7,
          "top_k": 40,
          "top_p": 0.95,
          "repeat_penalty": 1.1,
          "repeat_last_n": 256,
          "presence_penalty": 0.0,
          "frequency_penalty": 0.0,
          "mirostat": 2,
          "mirostat_tau": 6.0,
          "mirostat_eta": 0.1
        }
      })) {
        viewState.summary = (viewState.summary || '') + chunk.response
      }   */

      
    await generateCompletion(`context: ${_transcript} \n\n give me a concise summary. 5 key points. a conclusion.`);
    
    return {content: _transcript, summary: viewState.summary || ''} 
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }
  
}