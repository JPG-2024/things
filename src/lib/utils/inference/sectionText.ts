const SECTION_NOUN =
	'(?:secci[oó]n|secciones|apartado|apartados|texto|textos|art[ií]culo|art[ií]culos|contenido|fragmento|fragmentos|p[aá]rrafo|p[aá]rrafos|documento|documentos|section|sections|text|texts|article|articles|content|paragraph|paragraphs|passage|passages|document|documents)';
const ARTICLE = '(?:este|esta|estos|estas|el|la|los|las|this|the|these)';
const META_PREDICATE =
	'(?:describe|describen|explica|explican|presenta|presentan|aborda|abordan|cubre|cubren|analiza|analizan|discute|discuten|menciona|mencionan|habla\\s+(?:de|sobre|acerca\\s+de)|hablan\\s+(?:de|sobre|acerca\\s+de)|trata\\s+(?:de|sobre|acerca\\s+de)|tratan\\s+(?:de|sobre|acerca\\s+de)|se\\s+centra\\s+en|se\\s+centran\\s+en|es\\s+sobre|son\\s+sobre|describes|talks\\s+about|discusses|explains|covers|presents|focuses\\s+on|mentions|is\\s+about|are\\s+about)';
const CONNECTOR =
	'(?:c[oó]mo|por\\s+qu[eé]|por\\s+que|que|el\\s+modo\\s+en\\s+que|la\\s+forma\\s+en\\s+que|how|why|the\\s+way)';

const LEADING_META_PATTERN = new RegExp(
	`^\\s*(?:en\\s+)?${ARTICLE}\\s+(?:presente\\s+|siguiente\\s+|following\\s+)?${SECTION_NOUN}\\s*,?\\s+(?:se\\s+)?(?:nos\\s+)?${META_PREDICATE}\\s+(?:${CONNECTOR}\\s+)?`,
	'iu'
);

function capitalizeFirstLetter(text: string): string {
	const index = text.search(/\p{L}/u);
	if (index === -1) return text;
	return text.slice(0, index) + text[index].toLocaleUpperCase() + text.slice(index + 1);
}

/**
 * Remove a leading "this section describes..." style preamble from a summary.
 *
 * The multi-field prompt asks the model to start with the subject, but small
 * models often fall back to meta phrasing ("Esta sección describe cómo...",
 * "This section talks about..."). This strips only that opening clause, keeping
 * the sentence that follows; it does not attempt to reorder the remaining text.
 * @param text - Summary text returned by the model.
 * @returns The summary without its leading meta clause, or the trimmed input
 * when there is nothing safe to strip.
 */
export function stripLeadingMetaPhrase(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return '';

	const match = LEADING_META_PATTERN.exec(trimmed);
	if (!match) return trimmed;

	const rest = trimmed.slice(match[0].length).replace(/^[\s,;:.—–-]+/u, '');
	if (!rest) return trimmed;

	return capitalizeFirstLetter(rest);
}
