/**
 * Shared title/heading sanitizer.
 *
 * The model is an unreliable formatter: titles and labels arrive wrapped in
 * quotes, emphasis, fences, headings or list markers, sometimes with a subtitle
 * after a dash or colon, and with arbitrary length. One deterministic pass here
 * keeps every heading the UI renders — the dedicated title task
 * (`parseTitleText`), the per-window analysis block (`normalizeWindowTitle`) and
 * topic labels (`normalizeTopicLabel`) — clean, bounded and grammatical.
 */

/**
 * Trailing tokens that must not end a clipped heading, lowercased across the
 * app's supported languages (`LANG_NAMES`). Japanese is unaffected because it
 * has no word separators.
 */
const TRAILING_CONNECTOR_WORDS = new Set([
	// English
	'a',
	'an',
	'the',
	'and',
	'or',
	'of',
	'to',
	'in',
	'on',
	'at',
	'by',
	'for',
	'with',
	'as',
	'from',
	'into',
	'over',
	'under',
	'between',
	'about',
	// Spanish
	'el',
	'la',
	'los',
	'las',
	'un',
	'una',
	'unos',
	'unas',
	'y',
	'e',
	'o',
	'u',
	'de',
	'del',
	'en',
	'con',
	'para',
	'por',
	'sobre',
	'entre',
	'al',
	'que',
	// Portuguese
	'os',
	'as',
	'um',
	'uma',
	'uns',
	'umas',
	'do',
	'da',
	'dos',
	'das',
	'no',
	'na',
	'nos',
	'nas',
	'ao',
	'aos',
	'com',
	'em',
	'ou',
	// French
	'le',
	'les',
	'des',
	'du',
	'd',
	'et',
	'à',
	'au',
	'aux',
	'dans',
	'sur',
	'pour',
	'par',
	'avec',
	// Italian
	'il',
	'lo',
	'gli',
	'di',
	'dello',
	'della',
	'dei',
	'degli',
	'delle',
	'su',
	'tra',
	'fra',
	'ad',
	'da',
	// German
	'der',
	'die',
	'das',
	'den',
	'dem',
	'ein',
	'eine',
	'einer',
	'eines',
	'und',
	'oder',
	'von',
	'vom',
	'zu',
	'zum',
	'zur',
	'im',
	'am',
	'an',
	'auf',
	'für',
	'mit',
	'bei',
	'aus',
	'über',
	'unter',
	'zwischen',
	'des'
]);

/**
 * Decoration a model wraps around a title, unwrapped innermost-first so
 * `**"Title"**` or `_“Title”_` collapse to `Title`.
 */
const PAIRED_WRAPPERS: Array<[RegExp, string]> = [
	[/^\*\*([\s\S]*)\*\*$/, '$1'],
	[/^__([\s\S]*)__$/, '$1'],
	[/^\*([\s\S]*)\*$/, '$1'],
	[/^_([\s\S]*)_$/, '$1'],
	[/^"([\s\S]*)"$/, '$1'],
	[/^'([\s\S]*)'$/, '$1'],
	[/^«([\s\S]*)»$/, '$1'],
	[/^“([\s\S]*)”$/, '$1'],
	[/^‘([\s\S]*)’$/, '$1']
];

export type SanitizeTitleOptions = {
	/** Maximum words to keep. */
	maxWords: number;
	/** Maximum characters to keep; the CJK-length backstop (no word spaces). */
	maxChars: number;
	/**
	 * Split off a subtitle after these separators before clamping. Omit for a
	 * title that is already a single clause.
	 */
	separators?: RegExp;
	/**
	 * Drop trailing articles/prepositions/conjunctions when the title had to be
	 * clipped, so it reads as a complete phrase. Off by default.
	 */
	stripConnectors?: boolean;
};

/**
 * Sanitize a model-produced title or heading.
 *
 * Strips fences, leading markdown markers and paired wrappers, collapses
 * whitespace, drops the trailing punctuation the stylesheet already adds,
 * optionally keeps only the first clause, then clamps to the word and character
 * budget at a word boundary. A clip can additionally drop a trailing connector.
 * @param raw - Raw title candidate.
 * @param options - Budget and shaping options.
 * @returns The sanitized title, or empty string when nothing usable remains.
 */
export function sanitizeTitle(raw: string, options: SanitizeTitleOptions): string {
	let title = raw
		.trim()
		// Code fences, whole-line or wrapping: ```Title
		.replace(/^`+([\s\S]*?)`+\s*$/, '$1')
		// Headings and list markers; digits must be delimited so numbered
		// titles ("5 Key Ideas", "2024 Election") survive intact.
		.replace(/^(?:#{1,6}\s*|[-*+•]\s+|\d+[.)]\s+)+/, '');

	// Paired wrappers, innermost first: **"Title"** ends up as Title.
	for (let pass = 0; pass < 3; pass++) {
		const before = title;
		for (const [pattern, replacement] of PAIRED_WRAPPERS) {
			title = title.replace(pattern, replacement);
		}
		if (title === before) break;
	}

	title = title
		.replace(/\s+/g, ' ')
		// The stylesheet adds the final period via `.tasks-title::after`.
		.replace(/[.;:!?,]+$/, '')
		.trim();

	if (options.separators) {
		title = title.split(options.separators)[0].trim();
	}

	const words = title.split(' ');
	let clipped = false;
	if (words.length > options.maxWords) {
		title = words.slice(0, options.maxWords).join(' ');
		clipped = true;
	}
	if (title.length > options.maxChars) {
		const budgeted = title.slice(0, options.maxChars);
		const lastSpace = budgeted.lastIndexOf(' ');
		// Prefer a word boundary for spaced languages; CJK keeps the raw cut.
		title = (lastSpace > 0 ? budgeted.slice(0, lastSpace) : budgeted).trim();
		clipped = true;
	}

	if (clipped && options.stripConnectors) {
		title = stripTrailingConnectors(title);
	}

	return title;
}

/**
 * Drops trailing connector words so a clipped heading never ends on an
 * article/preposition/conjunction ("... el desarrollo de" → "... el
 * desarrollo"). Always keeps at least one word.
 * @param title - Clipped title.
 * @returns The title without trailing connectors.
 */
function stripTrailingConnectors(title: string): string {
	const words = title.split(' ');
	while (words.length > 1 && TRAILING_CONNECTOR_WORDS.has(words[words.length - 1].toLowerCase())) {
		words.pop();
	}
	return words.join(' ');
}
