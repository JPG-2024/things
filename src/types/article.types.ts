
interface Article {
  id: number;
  url: string;
  title: string;
  description: string;
  mainImage: string;
  markdownContent: string;
  metadataContent: Record<string, any> | string;
  domainUrl: string;
  ytVideoId: string | null;
  ytThumbnailUrl: string | null;
  summary: string;
  content: string | null;
  category: string | null;
  createdAt?: string;
  mainColor?: string | null;
  ytTranscript?: string | null;
}