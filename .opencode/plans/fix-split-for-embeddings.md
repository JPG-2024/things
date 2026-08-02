# Fix splitForEmbeddings Short Chunks Bug

## Problem

`splitForEmbeddings` generates unexpectedly short chunks like "knows the name of this nucleus. why ?" (~43 chars) instead of chunks close to the configured `windowSize`.

## Root Cause Analysis

### Bug 1: `findSentenceBoundary` uses percentage of absolute position

The search region for sentence boundaries uses `targetEnd * 0.9` and `targetEnd * 1.1`, which are percentages of the **absolute position** in the text, not relative to `windowSize`.

**Example:**

- At position 5400 with `windowSize=1000`, `targetEnd=6400`
- Search region: `[5760, 7000]` — 1240 chars wide (vs 1000 char window!)
- If first sentence boundary is at position 5761, chunk becomes `[5400, 5761)` = 361 chars
- When `targetEnd * 0.9 < start + 1`, search starts just 1 char after `start`, producing tiny chunks

### Bug 2: Position advance skips text after boundary shrink

After shrinking `end` to a sentence boundary, `position += step` still advances by the full step, skipping text between the shrunk `end` and the next `position`.

**Example:**

- Chunk `[0, 601)` created (end shrunk from 1000 to 601)
- `position += 900` → next chunk starts at 900
- Text `[601, 900]` is never included in any chunk

## Solution

### Fix 1: Use windowSize-relative tolerance

Change `findSentenceBoundary` to use a tolerance proportional to `windowSize`:

```ts
const tolerance = Math.max(50, Math.floor(windowSize * 0.1));
const minEnd = Math.max(start + 1, end - tolerance);
const maxEnd = Math.min(text.length, end + tolerance);
```

This ensures the search region is always ~20% of `windowSize` (±10%), keeping chunks close to the intended size.

### Fix 2: Advance position based on actual end

Replace `position += step` with:

```ts
const nextPosition = end - overlap;
position = nextPosition > position ? nextPosition : position + step;
```

This ensures:

- Next chunk starts at `end - overlap`, maintaining the intended overlap
- Position always advances (fallback to `position + step` if needed to avoid infinite loops)

## Files to Modify

- `src/lib/utils/splitText.ts` — fix `splitForEmbeddings` and `findSentenceBoundary`

## Verification

- Run `bun run check` to verify TypeScript types
- Run `bun run lint` to check code style
- Manual test: create a long text with sentence boundaries and verify chunk sizes are close to `windowSize`
