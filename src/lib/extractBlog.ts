import { invoke } from '@tauri-apps/api/core'

export async function extractBlog(url: string) {
  
  try {
    // invoke('download_images', { url })
    const response = await invoke<{metadata: Record<string, string>, markdown: string}>('extract_blog', { url, selectors: ['article', 'main'] })


    const compactedMarkdown = compactMarkdown(response.markdown)

    console.log('✅ Blog extraído:', response)
    const prompt = `Haz un resumen en español corto del contenido, siguiendo por los 5 puntos clave y una conclusion:\n\n${compactedMarkdown}`
     // await invoke('inference', {prompt: prompt, model: 'Qwen/Qwen3-VL-8B-Instruct:novita'})
    await invoke('inference', {prompt: prompt})
    
    return response
  } catch (err) {
    console.error('Error extracting blog:', err)
    return ''
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