import { invoke } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte';
import { YOUTUBE_SUMMARY_PROMPT } from '@/constants';
import { getYouTubeThumbnailUrl } from './utils/youtube';
import { getImageSrc } from './utils/dirs';


import type { ChatRequest } from '@/lib/utils/ollama/chat';
import { createBatchChat } from '@/lib/utils/ollama/chat';
import { createStreamingChat } from '@/lib/utils/ollama/chat';


export async function getChatBlocks(requests: ChatRequest[]): Promise<any[]> {
  // Map each request to a createBatchChat call
  const responses = await Promise.all(requests.map(req => createBatchChat(req)));
  return responses;
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

    
/*  
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
    */
        viewState.summary = '';


        // const results = await invoke('search_youtube', { query: 'bitcoin' });

        

        

        const summaryPrompt = `context: ${_transcript} \n\n Give me a concise summary in spanish of the 5 key points in bulletpoints of this context. Avoid title description.`;
        

        const requestLiquid: ChatRequest = {
          model: 'LiquidAI/LFM2-2.6B-Exp',
          messages: [
            { role: 'system', content: YOUTUBE_SUMMARY_PROMPT },
            { role: 'user', content: summaryPrompt }
          ],
          options: {
            temperature: 0.3,
            min_p: 0.15,
            repeat_penalty: 1.05,
            max_tokens: 800
          }
        };


        const request: ChatRequest = {
          model: 'gemma-3n-4b-it',
          messages: [
            { role: 'system', content: YOUTUBE_SUMMARY_PROMPT },
            { role: 'user', content: summaryPrompt }
          ],
          options: {
            temperature: 0.7,
            max_tokens: 800
          }
        };

        const request2: ChatRequest = {
          model: 'LiquidAI/LFM2-2.6B-Exp',
          messages: [
            { role: 'system', content: "your mission is to extract 5 keywords separated by \",\" from the context. avoid adding extra information" },
            { role: 'user', content: `context: ${_transcript} \n\n extract 5 keywords` }
          ],
          options: {
            temperature: 0.1,
            min_p: 0.15,
            repeat_penalty: 1.05,
            max_tokens: 200
          }
        };

        const introRequest: ChatRequest = {
          model: 'LiquidAI/LFM2-2.6B-Exp',
          messages: [
            { role: 'system', content: "follow instructions. dont add title or any extra information." },
            { role: 'user', content: `context: ${_transcript} \n\n generate a title in spanish` }
          ],
          options: {
            temperature: 0.3,
            min_p: 0.15,
            repeat_penalty: 1.05,
            max_tokens: 100
          }
        };




          const stream = createStreamingChat(requestLiquid);
          
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            viewState.summary += content;
            
 
            if (chunk.done) {
              console.log('\n\nStream complete!');
              console.log('Tokens:', chunk.eval_count);
            }
          }

        getChatBlocks([request2, introRequest]).then(responses => {
          const block1 = responses[0].choices[0]?.message?.content || '';
          viewState.block1 = block1;
          viewState.block2 = responses[1].choices[0]?.message?.content || '';
        })


/*         for await (const chunk of chatStream(request)) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            viewState.summary = (viewState.summary || '') + delta;
          }
        } */
    return {content: _transcript, summary: viewState.summary || ''} 
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }
  
}