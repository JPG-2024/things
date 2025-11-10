export function getYouTubeThumbnailUrl(
    videoId: string,
    quality: 'default' | 'medium' | 'high' | 'standard' | 'maxres' = 'default'
  ) {
    const qualityMap = {
      default: 'default.jpg',
      medium: 'mqdefault.jpg',
      high: 'hqdefault.jpg',
      standard: 'sddefault.jpg',
      maxres: 'maxresdefault.jpg',
    }
    return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}`
  }