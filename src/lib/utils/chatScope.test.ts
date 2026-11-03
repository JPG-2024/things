import { describe, expect, test } from 'bun:test';
import { resolveChatScope } from './chatScope';

describe('resolveChatScope', () => {
	test('scopes the youtube route to the open article', () => {
		const scope = resolveChatScope('/youtube/[url]', {
			url: 'https://example.com/post'
		});
		expect(scope).toEqual({
			kind: 'article',
			articleUrl: 'https://example.com/post',
			label: 'this article'
		});
	});

	test('canonicalizes youtube short links like the store does', () => {
		const scope = resolveChatScope('/youtube/[url]', {
			url: 'https://youtu.be/dQw4w9WgXcQ?si=tracking'
		});
		expect(scope.articleUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	});

	test('scopes the raw route to its id', () => {
		expect(resolveChatScope('/raw/[id]', { id: 'raw-1700000000000' })).toEqual({
			kind: 'article',
			articleUrl: 'raw-1700000000000',
			label: 'this article'
		});
	});

	test('scopes the profile route to its profile id', () => {
		expect(resolveChatScope('/profile/[profileId]', { profileId: '@syntaxfm' })).toEqual({
			kind: 'profile',
			profileId: '@syntaxfm',
			label: 'this profile'
		});
	});

	test('scopes the category route to its category id', () => {
		expect(resolveChatScope('/category/[categoryId]', { categoryId: 'ai' })).toEqual({
			kind: 'category',
			category: 'ai',
			label: 'this category'
		});
	});

	test('falls back to the whole library off a scoped route', () => {
		expect(resolveChatScope('/', {})).toEqual({ kind: 'library', label: null });
		expect(resolveChatScope(null, {})).toEqual({ kind: 'library', label: null });
	});

	test('treats a missing param as the whole library', () => {
		expect(resolveChatScope('/profile/[profileId]', {})).toEqual({
			kind: 'library',
			label: null
		});
		expect(resolveChatScope('/youtube/[url]', { url: '   ' })).toEqual({
			kind: 'library',
			label: null
		});
	});
});
