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


const STRUCTURED_SUMMARY_PROMPT = `You are a structured-output assistant.

                        Output rules:
                        - Always in spanish.
                        - Always respond with a single valid JSON object.
                        - Do not include explanations, markdown, or extra text.
                        - Do not add fields not defined in the schema.
                        - If information is missing, use an empty string or empty array as appropriate.

                        Schema:
                        {
                          "summary": "string",
                          "fiveKeypoints": [
                            "string",
                            "string",
                            "string",
                            "string",
                            "string"
                          ],
                          "conclusion": "string"
                        }

                        Constraints:
                        - "fiveKeypoints" must contain exactly 5 items.
                        - Keep language concise and factual.
                        - Ensure JSON is strictly valid.`



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

  
    viewState.summary = '';

    // Truncate transcript to avoid context window overflow
    const truncatedTranscript = _transcript;

    console.log('Generating summary with prompt:', viewState.prompt);

    const prompt = viewState.prompt || "Follow rules.";
    const system_prompt = viewState.prompt ? "Answer in spanish" : STRUCTURED_SUMMARY_PROMPT;


    const summaryPrompt = `context: ${_transcript} \n\n ${prompt}`;
    
    const response = await invoke<string>('generate_response', {
      prompt: summaryPrompt,
      stream: true,
      options: {
        system_prompt: system_prompt,
        model: 'gpt-4o-mini',
      }
    });


    console.log('Summary generated:', JSON.parse(response));

    viewState.summary = JSON.parse(response);

    return {content: _transcript, summary: viewState.summary || ''} 

  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }
  
}