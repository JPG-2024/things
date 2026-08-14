interface ArrayToGbnfOptions {
	ruleName?: string;
	minItems?: number;
	maxItems?: number | null;
}

function escapeGbnfString(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function arrayToGbnf(
	categories: string[],
	{ ruleName = 'root', minItems = 0, maxItems = null }: ArrayToGbnfOptions = {}
): string {
	const items = categories.map((s) => `"${escapeGbnfString(String(s))}"`).join(' | ');

	let body: string;
	if (maxItems === 1) {
		body = 'item';
	} else if (maxItems !== null && maxItems === minItems) {
		const parts = Array.from({ length: minItems }, (_, i) =>
			i === 0 ? 'ws item' : 'ws "," ws item'
		);
		body = parts.join(' ');
	} else if (maxItems !== null) {
		body = 'ws item' + Array.from({ length: maxItems - 1 }, () => '(ws "," ws item)?').join('');
	} else if (minItems === 0) {
		body = '(item (ws "," ws item)*)?';
	} else {
		body = 'item (ws "," ws item)*';
	}

	return `${ruleName} ::= "["${body} ws "]"\nitem ::= ${items}\nws ::= [ \\t\\n\\r]*`;
}

export function stringArrayGbnf(count: number, ruleName = 'root'): string {
	const items = Array.from({ length: count }, (_, i) =>
		i === 0 ? 'ws string' : 'ws "," ws string'
	).join(' ');

	return `${ruleName} ::= "["${items} ws "]"\nstring ::= "\\"" char* "\\""\nchar ::= [^"\\\\\\x7F\\x00-\\x1F] | [\\\\] (["\\\\bfnrt] | "u" [0-9a-fA-F]{4})\nws ::= [ \\t\\n\\r]*`;
}

export function objectWithEnumAndStringGbnf(
	enumKey: string,
	enumValues: string[],
	stringKey: string,
	ruleName = 'root'
): string {
	const escapedEnumKey = escapeGbnfString(enumKey);
	const escapedStringKey = escapeGbnfString(stringKey);
	const enumAlts = enumValues.map((v) => `"\\"${escapeGbnfString(v)}\\""`).join(' | ');

	return [
		`${ruleName} ::= "{" ws "\\"${escapedEnumKey}\\"" ws ":" ws enum-value ws "," ws "\\"${escapedStringKey}\\"" ws ":" ws string-value ws "}"`,
		`enum-value ::= ${enumAlts}`,
		`string-value ::= "\\"" string-chars "\\""\nstring-chars ::= [^"\\\\\\x7F\\x00-\\x1F] | "\\\\" escape`,
		`escape ::= ["\\\\bfnrt] | "u" [0-9a-fA-F]{4}`,
		`ws ::= [ \\t\\n\\r]*`
	].join('\n');
}
