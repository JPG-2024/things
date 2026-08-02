# Fix Word Cutting in splitForEmbeddings

## Problem

Chunks have cut words at their start/end. When `findSentenceBoundary` doesn't find a sentence boundary (no `.!?` followed by whitespace), it returns `end` unchanged. If `end` lands mid-word, the chunk ends mid-word, and the next chunk (starting at `end - overlap`) also starts mid-word.

## Root Cause

`findSentenceBoundary` only looks for sentence-ending punctuation (`.!?。！？` + whitespace). When none is found in the tolerance zone, it returns the raw `end` position, which can be anywhere — including in the middle of a word.

**Example:**

- Text: `"The mitochondrion is bounded by two membranes."`
- position=0, windowSize=25, overlap=2
- end=25 → lands at `"mitochondrion is bou"` (mid-word: "bou" from "bounded")
- No sentence boundary found → returns 25
- Chunk: `"The mitochondrion is bou"` (cut word)
- Next position: 23 → starts mid-word too

## Solution

Add a word boundary fallback in `findSentenceBoundary`:

1. First, try to find sentence-ending punctuation (existing behavior)
2. If not found, look for whitespace near `end` (word boundary)
3. Search backwards from `end` first (to stay within window), then forwards
4. If no whitespace found at all (very long word/token), return `end` as last resort

## Files to Modify

- `src/lib/utils/splitText.ts` — enhance `findSentenceBoundary` with word boundary fallback

## Implementation

```ts
function findSentenceBoundary(
	text: string,
	start: number,
	end: number,
	windowSize: number
): number {
	const tolerance = Math.max(50, Math.floor(windowSize * 0.1));
	const minEnd = Math.max(start + 1, end - tolerance);
	const maxEnd = Math.min(text.length, end + tolerance);

	const searchRegion = text.slice(minEnd, maxEnd);

	// 1. Try sentence boundary first
	const sentenceMatch = searchRegion.match(/[.!?。！？]\s/);
	if (sentenceMatch && sentenceMatch.index !== undefined) {
		return minEnd + sentenceMatch.index + 1;
	}

	// 2. Fallback: find word boundary (whitespace)
	// Search backwards from end first, then forwards
	const relativeEnd = end - minEnd;

	// Search backwards
	for (let i = relativeEnd; i >= 0; i--) {
		if (/\s/.test(searchRegion[i])) {
			return minEnd + i + 1;
		}
	}

	// Search forwards
	for (let i = relativeEnd + 1; i < searchRegion.length; i++) {
		if (/\s/.test(searchRegion[i])) {
			return minEnd + i + 1;
		}
	}

	// 3. No whitespace found (very long word), return end
	return end;
}
```

## Verification

- Run `bunx svelte-check --tsconfig ./tsconfig.json src/lib/utils/splitText.ts`
- Run `bun run lint`
- Manual test: verify chunks don't start/end mid-word
