import { invoke } from '@tauri-apps/api/core'

export async function extractBlog(url: string) {
  
  try {
    // invoke('download_images', { url })
    const response = await invoke<{metadata: Record<string, string>, markdown: string}>('extract_blog', { url, selectors: ['article', 'main'] })

    console.log('✅ Blog extraído:', response)
    const prompt = `Haz un resumen en español corto del contenido, siguiendo por los 5 puntos clave y una conclusion:\n\n${response.markdown}`
    await invoke('inference', {prompt: prompt})
    
    return response
  } catch (err) {
    console.error('Error extracting blog:', err)
    return ''
  }
}
