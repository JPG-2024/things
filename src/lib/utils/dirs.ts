
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core'
import { viewState } from '@/stores/viewStore.svelte';

export const getImageDir = async (): Promise<string> => {
  const appData = await appDataDir();
  const mediaDir = await join(appData, 'media');
  
  return mediaDir;
}


export const getImageSrc = async (mediaDirectory: string, imgName: string): Promise<string> => {
  const mediaDir = await getImageDir();
  const filePath = await join(mediaDir, mediaDirectory!!, imgName);
  return convertFileSrc(filePath);
}