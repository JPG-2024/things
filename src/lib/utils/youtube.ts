import { invoke } from '@tauri-apps/api/core';

export interface YoutubeResult {
	channel: string;
	duration: string;
	title: string;
	url: string;
}

export function getYouTubeThumbnailUrl(
	videoId: string,
	quality: 'default' | 'medium' | 'high' | 'standard' | 'maxres' = 'maxres'
) {
	const qualityMap = {
		default: 'default.jpg',
		medium: 'mqdefault.jpg',
		high: 'hqdefault.jpg',
		standard: 'sddefault.jpg',
		maxres: 'maxresdefault.jpg'
	};
	return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}`;
}

export function getProfileUrl(profileName: string): string {
	return `https://www.youtube.com/${profileName}/videos`;
}

export async function handleYoutubeQuestion(query: string) {
	try {
		const [videoUrl, question] = query.split('|').map((str: string) => str.trim());

		if (!videoUrl || !question) {
			console.error('Invalid query format. Expected: videoUrl|question');
			return;
		}

		const videoId = videoUrl.split('v=')[1]?.split('&')[0];
		if (!videoId) {
			console.error('Could not extract video ID from URL');
			return;
		}

		console.log('YouTube video URL:', videoUrl);
		console.log('YouTube question:', question);

		const transcript = await invoke<string>('get_youtube_transcript_timed_text', {
			id: videoId,
			language: null
		});

		const answer = await invoke<string>('generate_response', {
			prompt: `Using the following video transcript: \n\n${transcript}, provide a concise answer to the question: ${question} Answer:`,
			stream: false,
			options: {
				system_prompt: `You are an assistant specialized in answering questions based on YouTube video transcripts. avoid title description and final questions.`
			}
		});

		console.log('YouTube answer:', answer);
	} catch (error) {
		console.error('Failed to process YouTube question:', error);
	}
}
