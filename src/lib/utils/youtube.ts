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
		/*       const posibleQuerys = await invoke<string>('generate_response', {
        prompt: `question: ${query} \n\n from previous question, generate optimized YouTube search queries by following these steps:
                  1. Detect the user's intent (tutorial, review, comparison, entertainment, music, explanation).
                  2. Extract the core topic and relevant entities.
                  3. Rewrite the query in concise, YouTube-style English search terms.
                  4. Generate 3–5 alternative search queries.
                  5. Prefer technical English terms if the topic is technical.
                  6. Avoid full sentences; use keyword-focused phrases.
                  7. Respect the original language of the question. if is in spanish make the queries in spanish.

                  Return the result as a JSON array of strings only.`,
        stream: false,
        options: {
          system_prompt: `You are an assistant specialized in transforming user queries into optimized YouTube search queries.`,
        },
      })

      console.log('Possible YouTube queries:', posibleQuerys) */

		const [search, question] = query.split('|').map((str: string) => str.trim());

		console.log('YouTube search term:', search);
		console.log('YouTube question:', question);

		const answers: string[] = [];
		const results: YoutubeResult[] = await invoke('search_youtube', {
			query: search
		});

		const firstResults = results.slice(0, 3);

		for (const result of firstResults) {
			const _transcript = await invoke<string>('get_youtube_transcript', {
				id: result.url.split('v=')[1],
				languages: ['en', 'es']
			});

			const answer = await invoke<string>('generate_response', {
				prompt: `Using the following video transcript: \n\n${_transcript}, provide a concise answer to the question: ${question} Answer:`,
				stream: false,
				options: {
					system_prompt: `You are an assistant specialized in answering questions based on YouTube video transcripts. avoid title description and final questions.`
				}
			});
			answers.push(answer);
		}

		const finalAnswer = await invoke<string>('generate_response', {
			prompt: `Based on the following answers from different YouTube videos: \n\n${answers.join(
				'\n\n'
			)} \n\n Provide a comprehensive and concise answer to the question: ${question} Answer:`,
			stream: false,
			options: {
				system_prompt: `You are an assistant specialized in synthesizing answers from multiple YouTube video transcripts.`
			}
		});

		console.log('YouTube search results:', results);
		console.log('YouTube answers:', answers);
		console.log('Final synthesized answer:', finalAnswer);
	} catch (error) {
		console.error('Failed to search YouTube:', error);
	}
	// navigate(`/search/${encodeURIComponent(query)}`)
}
