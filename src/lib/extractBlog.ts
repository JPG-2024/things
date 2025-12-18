import { invoke } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte'
import { BLOG_SUMMARY_SYSTEM_PROMPT, DOCS_SUMMARY_SYSTEM_PROMPT } from '@/constants'
import { getImageSrc } from './utils/dirs';
import { generate, generateStream } from './utils/ollama/generate'
import { llamaCppCompletionStream } from '@/lib/utils/llama-cpp-rs';


export async function extractBlog(url: string): Promise<{content: string, summary: string}> {
  try {
    // invoke('download_images', { url })
    const response = await invoke<{metadata: Record<string, string>, markdown: string}>('extract_blog', { url, selectors: ['main', 'article'] })

    const compactedMarkdown = compactMarkdown(response.markdown)

    if (response.metadata["og:image"]) {
      const _mediaDir = await invoke<string>('url_to_folder_name', {url})
      viewState.mediaDirectory = _mediaDir
      const _mainImage = await invoke<string>('download_and_save_image', {url: response.metadata["og:image"], folderName: _mediaDir})
      viewState.mainImage = _mainImage
      viewState.mainImageSrc = await getImageSrc(_mediaDir, _mainImage)
    }


    llamaCppCompletionStream({
      model: 'default',
      system: BLOG_SUMMARY_SYSTEM_PROMPT,
      prompt: `context: ${compactedMarkdown} \n\n dame un resumen breve. 5 puntos clave y una conclusión.`,
      temperature: 0.7,
      max_tokens: 512,
    }, (chunk: string) => {
      viewState.summary = (viewState.summary || '') + chunk
    });


  
    return {content: compactedMarkdown, summary: viewState.summary || ''}
  } catch (err) {
    console.error('Error extracting blog:', err)
    return {content: '', summary: ''}
  }
}


function compactMarkdown(md: string): string {
  // 1. Protege los bloques de código con un marcador temporal
  const codeBlocks: string[] = [];
  md = md.replace(/```[\s\S]*?```/g, match => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 2. Limpia espacios y saltos fuera de los bloques
  md = md
    // Colapsa espacios múltiples y tabs en uno solo
    .replace(/[ \t]+/g, ' ')
    // Reemplaza más de 2 saltos de línea seguidos por 2
    .replace(/\n{3,}/g, '\n\n')
    // Quita espacios al inicio y fin del texto
    .trim();

  // 3. Restaura los bloques de código originales
  md = md.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) => codeBlocks[i]);

  return md;
}