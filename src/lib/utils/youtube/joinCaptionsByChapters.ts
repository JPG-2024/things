export type TimedCaption = {
	caption: string;
	start_time: number;
	end_time: number;
};

export type Chapter = {
	title: string;
	time: string; // m:ss or h:mm:ss
};

export type ChapterCaption = {
	title: string;
	startTime: number;
	endTime: number;
	content: string;
	captions: TimedCaption[];
};

function parseChapterTimeToSeconds(value: string): number {
	const parts = value
		.split(':')
		.map(Number)
		.filter((n) => !Number.isNaN(n));
	if (parts.length === 2) {
		const [m, s] = parts;
		return m * 60 + s;
	}
	if (parts.length === 3) {
		const [h, m, s] = parts;
		return h * 3600 + m * 60 + s;
	}
	return 0;
}

export function joinCaptionsByChapters(
	captions: TimedCaption[],
	chapters: Chapter[]
): ChapterCaption[] {
	if (!captions.length || !chapters.length) return [];

	const sortedChapters = [...chapters].sort(
		(a, b) => parseChapterTimeToSeconds(a.time) - parseChapterTimeToSeconds(b.time)
	);

	const maxCaptionEnd = captions.reduce((max, c) => Math.max(max, c.end_time), 0);

	return sortedChapters.map((chapter, index) => {
		const startTime = parseChapterTimeToSeconds(chapter.time);
		const endTime =
			index < sortedChapters.length - 1
				? parseChapterTimeToSeconds(sortedChapters[index + 1].time)
				: maxCaptionEnd;

		const chapterCaptions = captions.filter(
			(c) => c.end_time > startTime && c.start_time < endTime
		);

		return {
			title: chapter.title,
			startTime,
			endTime,
			content: chapterCaptions
				.map((c) => c.caption)
				.join(' ')
				.trim(),
			captions: chapterCaptions
		};
	});
}
