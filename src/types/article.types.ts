interface Article {
	category: string | null;
	content: string | null;
	createdAt?: string;
	description: string;
	domainUrl: string;
	embeddings?: boolean;
	id: number;
	mainColor?: string | null;
	mainImage: string;
	mainImageSrc?: string;
	markdownContent: string;
	mediaDirectory?: string;
	metadataContent: Record<string, any> | string;
	summary: string;
	title: string;
	url: string;
	ytThumbnailUrl: string | null;
	ytTranscript?: string | null;
	ytVideoId: string | null;
}
