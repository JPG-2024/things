#### Caller usage pattern (not in this file — for components that call it):

```js
    const { taskId, source } = await addVoice({ url: "https://..." });

    source.addEventListener("message", (e) => {
        const data = JSON.parse(e.data);
        switch (data.status) {
            case "downloading": /* progress */ break;
            case "transcribing": /* progress */ break;
            case "chunking": /* progress */ break;
            case "done":
                source.close();
                // data.chunks: Voice[]
                break;
            case "error":
                source.close();
                // data.message: string
                break;
        }
    });
```



New _transcribe helper (line 97): Runs whisper in a thread and fully materializes the segment generator before returning.
POST /transcribe-chunks rewritten (line 209):
- Now async returns a StreamingResponse with text/event-stream
- No more response_model=ChunksResponse — each stage yields an SSE event
- All blocking calls wrapped in await asyncio.to_thread(...)
- Events: downloading → transcribing → chunking (per chunk, with current/total) → done (with full payload) or error
- Cleanup in finally block
Frontend usage (for your separate JS app):
const res = await fetch("/transcribe-chunks", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({url: "...", segment: "00:00-02:00", name_prefix: "chunk", chunk_count: 5}) });
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // parse SSE events: text contains "event: <name>\ndata: <json>\n\n"
}