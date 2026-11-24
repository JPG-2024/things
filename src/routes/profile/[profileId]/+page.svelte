<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import DeleteButton from '@/components/DeleteButton.svelte';
	import LinkIcon from '@/components/LinkIcon.svelte';
	import ProfileFavoriteButton from '@/components/ProfileFavoriteButton.svelte';
	import ProfileTopbar from '@/components/ProfileTopbar.svelte';
	import ArticleList from '@/components/ArticleList.svelte';
	import { slideRight } from '@/lib/utils/itemTransitions';
	import {
		assignCategoriesToProfile,
		deleteProfileById,
		getProfile,
		getProfileCategories,
		invalidateProfilesCache,
		isDomainProfile,
		setProfileSummary,
		type ArticleProfile,
		type ArticleRecord
	} from '@/stores/webStore';
	import CategoryEditor from '@/components/CategoryEditor.svelte';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Toolbar from '@/components/Toolbar.svelte';
	import { viewState, articleFilters } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { scrapStore } from '@/stores/scrapStore.svelte';
	import { articleManager } from '@/runners/articleManager.svelte';
	import { generateProfileSummary } from '@/lib/utils/inference/profileSummary';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { navigateBack, createBackHotkey } from '@/stores/navigationHistory.svelte';

	let profileId = $derived(page.params.profileId);
	let profile = $state<ArticleProfile | null>(null);

	// YouTube rows keep their channel URL; domain rows store `url: null`, so the
	// site is built from the domain id.
	const profileLinkUrl = $derived.by(() => {
		if (!profile) return null;
		if (profile.url) return profile.url;
		return isDomainProfile(profile) ? `https://${profile.id}` : null;
	});

	let loading = $state(true);
	let isDeleting = $state(false);
	let profileCategoryIds = $state<string[]>([]);

	/** Text of the profile row: the stored summary, or the freshly generated one. */
	let summaryText = $state('');
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);

	/**
	 * Regenerates the profile summary from the current article list and
	 * persists it on the profile row. Called after every fetch-more-videos
	 * run, which doubles as the retry path of a failed generation.
	 */
	async function regenerateSummary() {
		if (summaryLoading || !profileId) return;
		summaryLoading = true;
		summaryError = null;
		try {
			// Drain subscribers run BEFORE `refreshAfterRuns` repaints the list
			// caches, so the queue may have drained while this cache still holds
			// the pre-batch rows: force a re-query with the mode the page uses.
			await articleCacheStore.fetchProfileArticles(profileId, {
				force: true,
				mode: viewState.showOnlyImportedArticles ? 'metadata' : undefined,
				favorite: viewState.onlyFavorites
			});
			const text = await generateProfileSummary(articleCacheStore.profileArticles(profileId));
			summaryText = text;
			profile = profile ? { ...profile, summary: text } : profile;
			// A failed save is reported by the store; the visible text stands.
			void setProfileSummary(profileId, text);
		} catch (error) {
			summaryError = error instanceof Error ? error.message : 'Failed to generate summary';
		} finally {
			summaryLoading = false;
		}
	}

	// ArrowLeft returns to the route this profile was opened from.
	createBackHotkey();

	onMount(async () => {
		loading = true;
		try {
			profile = await getProfile(profileId);
			summaryText = profile?.summary ?? '';
			if (profile) {
				profileCategoryIds = await getProfileCategories(profileId);
			}
		} catch (error) {
			console.error('Failed to load profile categories', error);
		} finally {
			loading = false;
		}
	});

	/**
	 * Optimistic pills first, then persist. On failure the stored links are
	 * re-read so the row never keeps pills the database rejected.
	 */
	async function handleCategoriesChange(nextIds: string[]) {
		profileCategoryIds = nextIds;
		try {
			await assignCategoriesToProfile({ profileId, categoryIds: nextIds });
			invalidateProfilesCache();
			articleCacheStore.invalidateProfiles();
		} catch (error) {
			console.error('Failed to assign categories to profile', profileId, error);
			try {
				profileCategoryIds = await getProfileCategories(profileId);
			} catch {
				// Keep the optimistic pills; the assignment already failed above.
			}
		}
	}

	$effect(() => {
		// `page` is a global store: while navigating away, params can flip to
		// undefined before this page unmounts, which would launch a fetch with
		// a broken profileId. Feeds the per-profile cache so the ArticlesTab's
		// shared list is untouched and its return navigation stays instant.
		if (!profileId) return;
		void articleCacheStore.fetchProfileArticles(profileId, {
			mode: viewState.showOnlyImportedArticles ? 'metadata' : undefined,
			// Read here (not inside the store) so the effect re-runs on toggle.
			favorite: viewState.onlyFavorites
		});
	});

	function handleBack() {
		void navigateBack();
	}

	async function handleDeleteProfile() {
		if (isDeleting) return;
		isDeleting = true;
		try {
			const result = await deleteProfileById(profileId);
			if (result.success) {
				articleFilters.removeById(profileId);
				articleCacheStore.invalidateProfiles();
				void navigateBack();
			}
		} finally {
			isDeleting = false;
		}
	}

	async function handleNavigateToArticle(article: ArticleRecord) {
		if (!article.url) return;
		viewState.currentProfileId = profileId;
		if (article.url.startsWith('raw-')) {
			goto(`/raw/${article.url}`);
			await urlRouter(article.url);
		} else {
			urlRouter(article.url);
			goto(`/youtube/${encodeURIComponent(article.url)}`);
		}
	}

	/** 'missing' = scroll profundo; 'recent' = solo el primer batch (sin scroll). */
	let activeFetch = $state<'recent' | 'missing' | null>(null);

	async function fetchVideos(kind: 'recent' | 'missing') {
		if (scrapStore.isFetchingMissingVideos || !profileId) return;
		activeFetch = kind;
		try {
			await scrapStore.fetchMissingProfileVideos(profileId, { scroll: kind === 'missing' });

			// Videos that were captured are still draining: their titles only
			// reach the list cache when the batch ends, so the summary must
			// wait for it. The synchronous check + registration can't race a
			// drain (no await in between), and runs that already finished are
			// covered by the forced refetch inside regenerateSummary.
			if (articleManager.processing) {
				await new Promise<void>((resolve) => {
					const unsubscribe = articleManager.afterDrain(() => {
						unsubscribe();
						resolve();
					});
				});
			}

			await regenerateSummary();
		} catch (error) {
			console.error('Failed to fetch missing profile videos', error);
		} finally {
			activeFetch = null;
		}
	}

	async function handleFetchMissingVideos() {
		await fetchVideos('missing');
	}

	async function handleFetchRecentVideos() {
		await fetchVideos('recent');
	}
</script>

<div class="profile-page">
	{#if loading}
		<div class="loading-container">
			<div class="loading-indicator"></div>
		</div>
	{:else if profile}
		<div class="profile-page__header">
			<ProfileTopbar
				name={profile?.name}
				thumbSrc={profile?.profilePictureSrc}
				fallbackIcon="User"
				onBack={handleBack}
			/>
			{#if summaryText || summaryLoading || summaryError}
				<div class="summary-row">
					{#if summaryLoading}
						<div class="summary-loading">
							<div class="loading-indicator small"></div>
							<span>Generating summary...</span>
						</div>
					{:else if summaryError}
						<div class="summary-error">{summaryError}</div>
						<button type="button" class="summary-action" onclick={regenerateSummary}>Retry</button>
					{:else}
						<MarkdownRenderer content={summaryText} fontSize={0.8} translatable />
					{/if}
				</div>
			{/if}
			<div class="category-row">
				<CategoryEditor value={profileCategoryIds} onChange={handleCategoriesChange} />
				<ProfileFavoriteButton {profileId} />
				<div class="profile-toolbar">
					<Toolbar justify="end" iconSize={20}>
						{#if profileLinkUrl}
							<LinkIcon url={profileLinkUrl} />
						{/if}
						<Icon
							name={activeFetch === 'recent' ? 'Loader2' : 'Zap'}
							class={activeFetch === 'recent' ? 'spin' : ''}
							onClick={handleFetchRecentVideos}
							disabled={scrapStore.isFetchingMissingVideos || loading}
							ariaLabel="Fetch recent videos"
							tooltipProps={{ content: 'Fetch recent videos (no scroll)' }}
						/>
						<Icon
							name={activeFetch === 'missing' ? 'Loader2' : 'RefreshCw'}
							class={activeFetch === 'missing' ? 'spin' : ''}
							onClick={handleFetchMissingVideos}
							disabled={scrapStore.isFetchingMissingVideos || loading}
							ariaLabel="Fetch missing videos"
							tooltipProps={{
								content: `Fetch missing videos – scroll ${scrapStore.scrollLimit}, capture max ${scrapStore.maxVideos}`
							}}
						/>
						<DeleteButton
							label="delete profile"
							disabled={isDeleting}
							onConfirm={handleDeleteProfile}
						/>
					</Toolbar>
				</div>
			</div>
		</div>

		<div class="articles-container">
			<ArticleList
				items={articleCacheStore.profileArticles(profileId)}
				loading={articleCacheStore.loadingProfileArticles(profileId)}
				hasMore={articleCacheStore.hasMoreProfileArticles(profileId)}
				onLoadMore={() => articleCacheStore.loadMoreProfileArticles(profileId)}
				onArticleClick={handleNavigateToArticle}
				itemTransition={slideRight}
			/>
		</div>
	{:else}
		<div class="empty-state">
			<div class="empty-state-pill">Profile not found</div>
		</div>
	{/if}
</div>

<style>
	.profile-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		min-height: 100vh;
		padding-top: 1rem;
		padding-left: 1.5rem;
		padding-right: 2rem;
		padding-bottom: 7rem;
	}

	.profile-page__header {
		padding-inline: 1rem;
		width: 100%;
	}

	:global(.spin) {
		animation: spin 0.8s linear infinite;
	}

	.summary-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}

	.summary-loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--bg-color);
		font-family: var(--font-secondary);
		font-style: italic;
	}

	.loading-indicator.small {
		width: 16px;
		height: 16px;
		border-width: 2px;
	}

	.summary-error {
		color: #ff6666;
		font-size: 0.85rem;
		word-break: break-word;
	}

	.summary-action {
		all: unset;
		align-self: flex-start;
		cursor: pointer;
		padding: 0.35rem 0.9rem;
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.1);
		color: var(--primary-color);
		font-size: 0.85rem;
		font-weight: bold;
		transition: background 0.15s;
	}

	.summary-action:hover {
		background: rgba(255, 255, 255, 0.18);
	}

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 200px;
	}

	.loading-indicator {
		width: 30px;
		height: 30px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--primary-color);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.articles-container {
		width: 100%;
		padding-top: 1.5rem;
	}

	.category-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.profile-toolbar {
		flex: 0 0 auto;
	}

	.profile-toolbar :global(.toolbar) {
		width: auto;
		padding: 0;
	}

	.profile-toolbar :global(button.icon-button) {
		padding: 6px 8px;
	}

	/* LinkIcon's own button has no padding and underlines on hover; keep it
	 * visually aligned with the other icons in this toolbar. */
	.profile-toolbar :global(.link) {
		padding: 6px 8px;
	}

	.profile-toolbar :global(.link:hover) {
		text-decoration: none;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 3rem 0;
	}

	.empty-state-pill {
		opacity: 0.6;
		border: 1px dashed var(--primary-color);
		border-radius: var(--radius-lg);
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}
</style>
