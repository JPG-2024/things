import { describe, expect, test } from 'bun:test';
import { reconstructChunks, splitByMarkdownHeaders } from './splitText';

const join = (...lines: string[]) => lines.join('\n');

describe('splitByMarkdownHeaders', () => {
	test('splits on h1/h2 and keeps the heading in its own chunk', () => {
		const md = join('# Intro', '', 'Body intro.', '', '## Details', '', 'Body details.');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(2);
		expect(chunks[0].heading).toBe('Intro');
		expect(chunks[0].text).toBe('# Intro\n\nBody intro.');
		expect(chunks[1].heading).toBe('Details');
		expect(chunks[1].text).toBe('## Details\n\nBody details.');
	});

	test('keeps a preamble as its own heading-less chunk', () => {
		const md = join('Preamble.', '', '# Intro', '', 'Body.');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(2);
		expect(chunks[0].heading).toBeUndefined();
		expect(chunks[0].text).toBe('Preamble.');
		expect(chunks[1].heading).toBe('Intro');
	});

	test('returns a single heading-less chunk when there are no headers', () => {
		const md = 'Just a paragraph.\n\nAnd another one.';

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].heading).toBeUndefined();
		expect(chunks[0].text).toBe(md);
	});

	test('does not split on h3 or deeper', () => {
		const md = join('## Parent', '', 'Body.', '', '### Child', '', 'More body.');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toContain('### Child');
	});

	test('returns nothing for blank input', () => {
		expect(splitByMarkdownHeaders('')).toEqual([]);
		expect(splitByMarkdownHeaders('   \n  ')).toEqual([]);
	});

	test('flattens a markdown-link heading to its label', () => {
		const md = join(
			'## [Validate with static renders](#validate-with-static-renders)',
			'',
			'Body.'
		);

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].heading).toBe('Validate with static renders');
		// The body keeps the original link markup for the markdown renderer.
		expect(chunks[0].text).toContain(
			'[Validate with static renders](#validate-with-static-renders)'
		);
	});

	test('flattens external links and images inside a heading', () => {
		const md = join('## [Docs](https://example.com) and ![Logo](logo.png)', '', 'Body.');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks[0].heading).toBe('Docs and Logo');
	});

	test('leaves plain headings untouched', () => {
		const md = join('## Validate with static renders', '', 'Body.');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks[0].heading).toBe('Validate with static renders');
	});
});

describe('splitByMarkdownHeaders and fenced code blocks', () => {
	test('does not treat hash lines inside a backtick fence as headers', () => {
		const md = join(
			'## Code',
			'',
			'```bash',
			'# a shell comment',
			'## not a heading',
			'echo hi',
			'```',
			'',
			'After the fence.'
		);

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].heading).toBe('Code');
		expect(chunks[0].text).toContain('# a shell comment');
		expect(chunks[0].text).toContain('echo hi');
	});

	test('does not treat hash lines inside a tilde fence as headers', () => {
		const md = join('## Code', '', '~~~python', '# a python comment', 'print(1)', '~~~');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toContain('# a python comment');
	});

	test('an unterminated fence swallows the rest of the document', () => {
		const md = join('## Code', '', '```', '# inside', '## still inside');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(1);
		expect(chunks[0].heading).toBe('Code');
	});

	test('a longer closing fence is required to close a shorter opening fence', () => {
		const md = join('## Code', '', '````', '````', '```', '## not a heading');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks).toHaveLength(1);
	});

	test('splits normally again after a fence closes', () => {
		const md = join('## One', '', '```', '# hidden', '```', '', '## Two', '', 'Body two.');

		const chunks = splitByMarkdownHeaders(md);

		expect(chunks.map((c) => c.heading)).toEqual(['One', 'Two']);
	});
});

describe('chunk offsets', () => {
	const samples = [
		join(
			'# Intro',
			'',
			'Body.',
			'',
			'## Sub',
			'',
			'More.',
			'',
			'```',
			'# fake',
			'```',
			'',
			'## End'
		),
		join('Preamble.', '', '# A', '', 'Body A.', '', '### nested', '', '### nested two'),
		'no headers at all'
	];

	test('round-trip through reconstructChunks', () => {
		for (const md of samples) {
			const chunks = splitByMarkdownHeaders(md);
			expect(reconstructChunks(md, chunks).map((s) => s.trim())).toEqual(chunks.map((c) => c.text));
		}
	});

	test('account for leading and trailing whitespace', () => {
		const md = '\n\n   ' + samples[0] + '   \n\n';

		const chunks = splitByMarkdownHeaders(md);

		expect(reconstructChunks(md, chunks).map((s) => s.trim())).toEqual(chunks.map((c) => c.text));
	});

	test('are contiguous and in ascending order', () => {
		const chunks = splitByMarkdownHeaders(samples[0]);

		for (let i = 0; i < chunks.length; i++) {
			expect(chunks[i].startOffset).toBeLessThan(chunks[i].endOffset);
			if (i > 0) {
				expect(chunks[i].startOffset).toBeGreaterThanOrEqual(chunks[i - 1].endOffset);
			}
		}
	});
});
