## Why it feels complex

Three independent sources of complexity stack on top of each other:

1. **Two LLM calls per window** instead of one. `extractTopicsAndKeywords` and `extractWindowSummary` run in parallel but are separate turns, so the data shape has to carry both halves through the pipeline.
2. **Embedding-based clustering** between chunking and the final output. After windows produce topics, the whole set gets embedded, grouped by cosine similarity, and deduplicated — a whole extra stage that the single-call variant does not have.
3. **A second LLM pass on the clusters** (`consolidateClusterLabels`) just to rewrite the labels. Summaries are never touched by this call, so it exists solely to make the topic names nicer.

Each stage also has its own fallback (unusable LLM output → keep cluster label, embeddings fail → `clusterByLabel`, consolidation fails → keep clustered labels). The cascade of fallbacks is what makes the file feel heavy.

## The flow

```
Input: document split into windows (half-chunks)

┌─────────────────────────────────────────────────────┐
│ processChunk (per window, parallel halves)          │
│                                                     │
│   extractTopicsAndKeywords ─┐                       │
│                             ├─ Promise.all ─► chunk │
│   extractWindowSummary ─────┘                       │
│                                                     │
│   Output: { title, summary, topics, keywords,       │
│             sections: [{topic, summary}] }          │
└────────────────────────┬────────────────────────────┘
                         │ results[]
                         ▼
┌─────────────────────────────────────────────────────┐
│ combineChunks (once per document)                   │
│                                                     │
│ 1. Normalize + dedupe topic labels across windows   │
│ 2. Embed all topic strings (LLaMA embeddings)       │
│ 3. clusterByEmbedding (fallback: clusterByLabel)    │
│ 4. consolidateClusterLabels ─ one LLM call ─►       │
│    rewrites labels only, keeps merged summaries     │
│ 5. buildWindowBlocks ─ deterministic, no LLM ─►     │
│    "## title\n\nsummary" per window, joined by \n\n │
│                                                     │
│ Output: { summary, keywords, topics, sections }     │
└─────────────────────────────────────────────────────┘
```

## Who does what

| Step | LLM? | Source |
|---|---|---|
| Per-window topics + keywords | Yes | `extractTopicsAndKeywords` |
| Per-window title + summary | Yes | `extractWindowSummary` |
| Cross-window topic clustering | No | embeddings + `clusterByEmbedding` |
| Cross-window label rewrite | Yes | `consolidateClusterLabels` |
| Final summary assembly | No | `buildWindowBlocks` (deterministic) |

## What you could simplify

- If the per-window summary is already good, the split into two calls is mostly justified by grammar quality; merging them back into one would cut the per-window cost in half.
- `consolidateClusterLabels` touches labels only. If nice label names are not critical, the embeddings + consolidation block can be replaced with `clusterByLabel` (pure string dedup) and the consolidation call removed.
- `buildWindowBlocks` is already minimal; no LLM cost there.
