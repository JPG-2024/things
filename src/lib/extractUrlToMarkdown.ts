import { invoke } from '@tauri-apps/api/core'

export async function extractUrlToMarkdown(url: string) {
  let markdown = ''
  try {
    invoke('download_images', { url })
    markdown = await invoke('extract_markdown', { url, selectors: ['article', 'main'] })
    const prompt = `Extrae el contenido principal haz un resumen maximo de un parrafo, en español:\n\n${markdown}`
    await invoke('inference', {
      prompt: prompt,
    })
    return markdown
  } catch (err) {
    console.error('Error extracting markdown:', err)
    return ''
  }
}
