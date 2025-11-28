import { invoke } from '@tauri-apps/api/core'
import { summary, mediaDirectory } from '@/stores/viewStore'
import { BLOG_SUMMARY_SYSTEM_PROMPT } from '@/constants'
import { runLocalLlamaPrompt } from '@/lib/utils/localInference';
import { mainImage } from '@/stores/viewStore';


export async function extractBlog(url: string): Promise<{content: string, summary: string}> {
  try {
    let _summary: string | null = null
    // invoke('download_images', { url })
    const response = await invoke<{metadata: Record<string, string>, markdown: string}>('extract_blog', { url, selectors: ['main', 'article'] })

    const compactedMarkdown = compactMarkdown(response.markdown)

    const _mediaDir = await invoke<string>('url_to_folder_name', {url})
    mediaDirectory.set(_mediaDir)
    const _mainImage = await invoke<string>('download_and_save_image', {url: response.metadata["og:image"], folderName: _mediaDir})
    mainImage.set(_mainImage)


    _summary = await runLocalLlamaPrompt(
      `Resume el siguiente artículo de blog en español:\n\n${compactedMarkdown}`,
      {
        systemPrompt: BLOG_SUMMARY_SYSTEM_PROMPT(''),
        onChunk: (chunk: string) => {
          summary.update(current => current + chunk)
        }
      }
    )
  
    return {content: compactedMarkdown, summary: _summary || ''}
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