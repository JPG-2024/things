import { describe, expect, test } from 'bun:test';
import { stripLeadingMetaPhrase } from './sectionText';

describe('stripLeadingMetaPhrase', () => {
	test('drops the English section preamble and keeps the sentence', () => {
		expect(
			stripLeadingMetaPhrase('This section describes how Node.js has improved its speed.')
		).toBe('Node.js has improved its speed.');
	});

	test('drops the Spanish section preamble', () => {
		expect(
			stripLeadingMetaPhrase('Esta sección describe cómo la velocidad de Node.js ha mejorado.')
		).toBe('La velocidad de Node.js ha mejorado.');
	});

	test('handles the "en esta sección se describe" variant', () => {
		expect(stripLeadingMetaPhrase('En esta sección se describe cómo funciona el caché.')).toBe(
			'Funciona el caché.'
		);
	});

	test('handles plural preambles from the combined summary', () => {
		expect(stripLeadingMetaPhrase('Estas secciones describen cómo evolucionó el proyecto.')).toBe(
			'Evolucionó el proyecto.'
		);
	});

	test('handles "the text explains"', () => {
		expect(stripLeadingMetaPhrase('The text explains why the build is slow.')).toBe(
			'The build is slow.'
		);
	});

	test('leaves text without a meta preamble untouched', () => {
		expect(stripLeadingMetaPhrase('  Node.js has improved its speed.  ')).toBe(
			'Node.js has improved its speed.'
		);
	});

	test('does not strip a sentence that merely starts with a section noun', () => {
		expect(stripLeadingMetaPhrase('La sección transversal mide dos metros.')).toBe(
			'La sección transversal mide dos metros.'
		);
	});

	test('returns an empty string for blank input', () => {
		expect(stripLeadingMetaPhrase('   ')).toBe('');
	});
});
