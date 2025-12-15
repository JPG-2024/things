import { invoke } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte';
import { YOUTUBE_SUMMARY_PROMPT } from '@/constants';
import { getYouTubeThumbnailUrl } from './utils/youtube';
import { getImageSrc } from './utils/dirs';
import { extractKeywords } from './utils/extractKeywords';
import { generateStream, generateEmbeddingsBatch } from '@/lib/utils/ollama-rs';
import { splitText } from '@/lib/utils/splitter';
import { storeEmbeddings, similaritySearch } from '@/lib/utils/chromadb';



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

    const docs = await splitText({
      mode: 'podcast',
      text: _transcript,
    });

    console.log('Split transcript into', docs);

    const res = await storeEmbeddings({
      texts: docs,
      metadata: {
        source: 'youtube_transcript',
        video_id: "129",
      },
      articleId: "129",
    })

      const results = await similaritySearch({
        queryText: 'resumen, puntos clave, conclusiones',
        nResults: 3,
        whereMetadata: {
          video_id: "129",
        },
      });

      console.log('Similarity search results:', results);
      
/*     await generateStream({ 
      model: 'ministral-3:3b', 
      system: YOUTUBE_SUMMARY_PROMPT,
      prompt: `context: ${_transcript} \n\n dame un resumen breve. 5 puntos clave y una conclusión.`, 
    }, (chunk: string) => {
      viewState.summary = (viewState.summary || '') + chunk
    });
     */
    return {content: _transcript, summary: viewState.summary || ''} 
  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }
  
}