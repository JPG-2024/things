/**
 * Context-overflow phrasings vary across servers and versions: llama.cpp sends
 * `exceed_context_size_error` / "exceeds the available context size", while
 * others report `{"message":"Context size has been exceeded."}` with a generic
 * `server_error` type. Match any text that references the context and an
 * overflow instead of pinning exact server wording.
 */
export function isContextSizeErrorText(text: string): boolean {
	if (/exceed_context_size_error/iu.test(text)) return true;
	return /context/iu.test(text) && /exceed/iu.test(text);
}

/**
 * Detects context-size rejections from the completion servers so the
 * recursive runner can re-chunk with a smaller window instead of failing.
 * The local path embeds the JSON-encoded error payload in `error.message`;
 * the structured fallback reads the `payload` carried by
 * `LlamaChatCompletionError`.
 */
export function isContextSizeError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	if (isContextSizeErrorText(message)) {
		return true;
	}
	const payload = (error as { payload?: unknown } | undefined)?.payload;
	if (payload && typeof payload === 'object') {
		const p = payload as Record<string, unknown>;
		const inner = (p.error ?? p) as Record<string, unknown> | undefined;
		if (
			inner &&
			(inner.type === 'exceed_context_size_error' ||
				(typeof inner.message === 'string' && isContextSizeErrorText(inner.message)))
		) {
			return true;
		}
	}
	return false;
}
