const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';

export interface ReasoningParts {
	reasoning: string;
	content: string;
}

export interface ReasoningTagSplitter {
	feed: (delta: string) => ReasoningParts;
	flush: () => ReasoningParts;
}

/**
 * Stream-safe splitter for thought tags that arrive inline inside
 * `message.content` (llama-server without reasoning extraction). It emits the
 * text outside the tags as `content` and whatever sits between them as
 * `reasoning`, deferring a trailing partial tag so a chunk ending in a partial tag
 * is not misrouted until the next chunk disambiguates it.
 */
export function createReasoningTagSplitter(): ReasoningTagSplitter {
	let buffer = '';
	let inReasoning = false;

	const feed = (delta: string): ReasoningParts => {
		buffer += delta;
		return drain();
	};

	const flush = (): ReasoningParts => {
		const parts = inReasoning
			? { reasoning: buffer, content: '' }
			: { reasoning: '', content: buffer };
		buffer = '';
		return parts;
	};

	function drain(): ReasoningParts {
		let reasoning = '';
		let content = '';

		while (buffer.length > 0) {
			const tag = inReasoning ? CLOSE_TAG : OPEN_TAG;
			const index = buffer.indexOf(tag);
			if (index === -1) {
				const keep = partialSuffixLength(buffer, tag);
				const out = buffer.slice(0, buffer.length - keep);
				buffer = buffer.slice(buffer.length - keep);
				if (inReasoning) reasoning += out;
				else content += out;
				if (keep > 0) break;
			} else if (inReasoning) {
				reasoning += buffer.slice(0, index);
				buffer = buffer.slice(index + CLOSE_TAG.length);
				inReasoning = false;
			} else {
				content += buffer.slice(0, index);
				buffer = buffer.slice(index + OPEN_TAG.length);
				inReasoning = true;
			}
		}

		return { reasoning, content };
	}

	return { feed, flush };
}

/**
 * Splits thought tags out of a complete text in one shot.
 * @param text - Full, non-streamed text that may contain thought tags.
 * @returns Reasoning and content parts of the text.
 */
export function splitThoughtTags(text: string): ReasoningParts {
	const splitter = createReasoningTagSplitter();
	const fed = splitter.feed(text);
	const flushed = splitter.flush();
	return {
		reasoning: fed.reasoning + flushed.reasoning,
		content: fed.content + flushed.content
	};
}

function partialSuffixLength(text: string, tag: string): number {
	const max = Math.min(tag.length - 1, text.length);
	for (let len = max; len > 0; len--) {
		if (tag.startsWith(text.slice(text.length - len))) return len;
	}
	return 0;
}
