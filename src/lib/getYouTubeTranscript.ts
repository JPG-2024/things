import { invoke } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte';
import { STRUCTURED_SUMMARY_JSON_PROMPT_ES } from '@/constants';
import { getYouTubeThumbnailUrl } from './utils/youtube';
import { getImageSrc } from './utils/dirs';
import { parseLLMJson } from '@/lib/utils/llm/index';
import { generateResponse } from './inference';



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

    console.log('YouTube Transcript fetched:', _transcript)

  
    viewState.summary = null;

    // Truncate transcript to avoid context window overflow
    const truncatedTranscript = _transcript;

    console.log('Generating summary with prompt:', viewState.prompt);

    const prompt = viewState.prompt || "Follow rules.";
    const system_prompt = viewState.prompt ? "Answer brief in spanish" : STRUCTURED_SUMMARY_JSON_PROMPT_ES;

    const summaryPrompt = `context: ${_transcript} \n\n ${prompt}`;
    
    const response = await generateResponse({
      prompt: summaryPrompt,
      systemPrompt: system_prompt,
      temperature: 0.2,
    });

    console.log(response)

    const parsedResponse = parseLLMJson(response);

    const summary = {
      summary: Object.values(parsedResponse)[0] as string,
      keypoints: Object.values(parsedResponse)[1] as string[],
      conclusion: Object.values(parsedResponse)[2] as string,
      title: Object.values(parsedResponse)[4] as string
    }

    viewState.summary = summary;

    return {content: _transcript, summary: JSON.stringify(viewState.summary)} 

  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }
  
}