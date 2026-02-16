import { invoke } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte';
import { SIMPLE_SUMMARY_SYSTEM_PROMPT_EN, SIMPLE_SUMMARY_SYSTEM_PROMPT_ES, STRUCTURED_SUMMARY_JSON_PROMPT_ES, STRUCTURED_RESPONSE_SYSTEM_PROMPT_EN } from '@/constants';
import { getYouTubeThumbnailUrl } from './utils/youtube';
import { getImageSrc } from './utils/dirs';
import { synthesizeSpeech } from '$lib/utils/tts';
import { extractKeypoints } from './extractKeypoints';
import { chatCompletions } from '@/lib/utils/llama-completions'
import { getImageColor } from './utils/getImageColor';
import { primaryColor } from '@/stores/uiStore'
import { currentDuration } from '@/stores/ttsStore';






export async function youTubeRouter(videoLink: string, languages: string[] = ['en', 'es']): Promise<{  content: string, summary: string}> {
  //extract video id from youtube link
  const urlObj = new URL(videoLink)
  const videoId = urlObj.searchParams.get('v')
    if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  let _transcript: string

  try {
    viewState.summary = '';

    const _mediaDir = await invoke<string>('url_to_folder_name', {url: videoLink})
    viewState.mediaDirectory = _mediaDir
    const ytThumbnailUrl = getYouTubeThumbnailUrl(videoId)
    const _mainImage = await invoke<string>('download_and_save_image', {url: ytThumbnailUrl, folderName: _mediaDir})
    viewState.mainImage = _mainImage
    viewState.mainImageSrc = await getImageSrc(_mediaDir, _mainImage)

    let mainColor = '';
    try {
      mainColor = await getImageColor(viewState.mainImageSrc || '');
      if (mainColor) {
        primaryColor.set(mainColor);
      }
    } catch (colorError) {
      console.error('Error extracting main color:', colorError);
    }

    const preferredLanguage = languages.includes(viewState.language)
      ? viewState.language
      : (languages[0] || 'es');


    // TRANSCRIPT
    _transcript = await invoke<string>('get_youtube_transcript_timed_text', {
      id: videoId,
      language: preferredLanguage,
    })

    viewState.content = _transcript

    console.log('Full Transcript:', _transcript);

  
    // Truncate transcript to avoid context window overflow
    

    const system_prompt = viewState.language === 'es' ? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES : SIMPLE_SUMMARY_SYSTEM_PROMPT_EN;
    const summaryPrompt = viewState.language === 'es' 
      ? `context: ${_transcript} \n\n Resume el contexto de manera concisa y clara en un solo párrafo.`
      : `context: ${_transcript} \n\n Summarize the context concisely and clearly in a single paragraph.`;

    const response = await chatCompletions(
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: summaryPrompt }
        ],
        temperature: 0.3,
        top_p: 0.95,
        presence_penalty: 0.1,
        frequency_penalty: 0.2,
        stream: true,
        stream_options: {
          include_usage: true,
          
        }
      },
      "http://localhost:8080",
      {
        onToken: (chunk: string) => {
          viewState.summary = (viewState.summary || '') + chunk;
        }
      }
    )

    const keypoints = await extractKeypoints(_transcript);
    console.log('[Extracted Keypoints]:', keypoints);

    console.log('[Summary Response]:', response);

     const result = await synthesizeSpeech(
      viewState.summary,
      viewState.language,
      "/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/voice_styles/F1.json",
      { speed: 1.2, onnx_dir: "/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/onnx/", total_step: 6 }
    );

    currentDuration.set(result.duration)

    invoke('play_tts_file', { filePath: result.file_path }).catch(err => {
      console.error('Error playing TTS:', err);
    });
    
    const videoInfo = await invoke<
      Array<{ name: string; selector: string; textContent: string | null }>
    >('get_youtube_info', {
      url: videoLink,
      selectors: [
        { name: 'title', selector: '#title h1 yt-formatted-string' },
        { name: 'channel', selector: '#text-container yt-formatted-string' },
        { name: 'views', selector: 'span.view-count' },
        { name: 'uploadDate', selector: 'div#info-strings yt-formatted-string' },
      ],
    });

    console.log("VIDEO_INFO", videoInfo); 
      
    return {content: _transcript, summary: JSON.stringify(viewState.summary)} 

  } catch (invokeErr) {
    throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
  }
  
}

async function recursiveSummarize(
  text: string,
  language: string,
  maxTextLength: number = 12000
): Promise<string> {
  // Base case: if text is small enough, summarize directly
  if (text.length <= maxTextLength) {
    const systemPrompt = language === 'es' ? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES : SIMPLE_SUMMARY_SYSTEM_PROMPT_EN;
    const summaryPrompt = language === 'es' 
      ? `Resume de manera concisa: ${text}`
      : `Summarize concisely: ${text}`;

    const response = await chatCompletions(
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: summaryPrompt }
        ],
        temperature: 0.3,
        top_p: 0.95,
        presence_penalty: 0.1,
        frequency_penalty: 0.2,
        stream: false
      },
      "http://localhost:8080"
    );

    return String(response.choices[0]?.message?.content || '');
  }

  // Split text into two equal parts and summarize each
  const midpoint = Math.floor(text.length / 2);
  const left = text.slice(0, midpoint);
  const right = text.slice(midpoint);

  const [leftSummary, rightSummary] = await Promise.all([
    recursiveSummarize(left, language, maxTextLength),
    recursiveSummarize(right, language, maxTextLength)
  ]);

  // Combine summaries and recursively summarize again
  const combinedSummaries = `${leftSummary}\n\n${rightSummary}`;
  return recursiveSummarize(combinedSummaries, language, maxTextLength);
}