<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';

	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import Icon from '@/components/Icon.svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { extractValidUrl, handlePasteUrl } from '@/lib/utils/pasteUrl';
	import { getProfileUrl, handleYoutubeQuestion } from '@/lib/utils/youtube';
	import { profileRunner } from '@/runners/youtube/profileVideosRunner';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { deleteProfileById } from '@/stores/webStore';
	import { toVTName } from '@/lib/utils/url';
	import { generateTTSfromArticleURL } from '@/lib/utils/tts';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import Categories from '@/components/Categories.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { onMount } from 'svelte';

	let glowIntensity = $state(1);
	let activeTab = $state<'profiles' | 'articles'>('profiles');

	function triggerQuickBlink(): ReturnType<typeof setTimeout>[] {
		const count = 2 + Math.floor(Math.random() * 6);
		const timeouts: ReturnType<typeof setTimeout>[] = [];
		let offset = 0;

		for (let i = 0; i < count; i++) {
			const dipDuration = 30 + Math.floor(Math.random() * 21);
			const onDuration = 20 + Math.floor(Math.random() * 41);

			timeouts.push(
				setTimeout(() => {
					glowIntensity = 0.15;
				}, offset),
				setTimeout(() => {
					glowIntensity = 1;
				}, offset + dipDuration)
			);

			offset += dipDuration + onDuration;
		}

		return timeouts;
	}

	$effect(() => {
		let blinkTimeouts: ReturnType<typeof setTimeout>[] = [];

		const interval = setInterval(() => {
			if (Math.random() > 0.5) {
				blinkTimeouts = triggerQuickBlink();
			}
		}, 8000);

		return () => {
			clearInterval(interval);
			blinkTimeouts.forEach(clearTimeout);
		};
	});

	function rgbToHex(rgb: string): string {
		const match = rgb.match(/\d+/g);
		if (!match || match.length < 3) return '#fae4c0';
		const r = parseInt(match[0]);
		const g = parseInt(match[1]);
		const b = parseInt(match[2]);
		return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
	}

	function handleColorChange(e: Event) {
		const hex = (e.target as HTMLInputElement).value;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		viewState.primaryColor = `rgb(${r}, ${g}, ${b})`;
	}

	let initialLoad = $state(true);
	onMount(async () => {
		await articleCacheStore.fetchProfilesWithArticles();
		initialLoad = false;
	});

	$effect(() => {
		const _ = viewState.selectedCategories;
		if (!initialLoad) {
			articleCacheStore.invalidate();
			if (activeTab === 'profiles') {
				articleCacheStore.fetchProfilesWithArticles({ force: true });
			} else {
				articleCacheStore.fetchArticlesWithoutProfile({ force: true });
			}
		}
	});

	$effect(() => {
		const tab = activeTab;
		if (tab === 'articles' && articleCacheStore.articlesWithoutProfile.length === 0) {
			articleCacheStore.fetchArticlesWithoutProfile({ force: true });
		}
	});

	async function handleDeleteProfile(profileId: string) {
		const result = await deleteProfileById(profileId);
		if (result.success) {
			articleCacheStore.invalidateProfiles();
			await articleCacheStore.fetchProfilesWithArticles({ force: true });
		}
	}

	function handleEnter(value: string) {
		const trimmed = value.trim();
		if (!trimmed) return;

		const validUrl = extractValidUrl(trimmed);
		if (validUrl) {
			void handlePasteUrl(trimmed);
		} else {
			handleYoutubeQuestion(trimmed);
		}
	}

	async function handleTitleClick() {
		try {
			const clipboardText = await invoke<string>('read_clipboard_text');
			const trimmed = (clipboardText ?? '').trim();
			if (!trimmed) return;
			await handlePasteUrl(trimmed);
		} catch {
			viewState.clipboardPollingEnabled = false;
		}
	}

	async function handleNavigateToArticle(url: string | null, profileId: string | null) {
		if (!url) return;
		if (profileId) viewState.currentProfileId = profileId;
		if (url.startsWith('raw-')) {
			goto(`/raw/${url}`);
			await urlRouter(url);
		} else {
			urlRouter(url);
			goto(`/youtube/${encodeURIComponent(url)}`);
		}
	}

	const sHotkey = createHotkey(
		'S',
		async () => {
			if (!viewState.hoveredArticleUrl) return;
			void ensureAudioContext();
			await generateTTSfromArticleURL(viewState.hoveredArticleUrl);
		},
		() => ({
			enabled: viewState.hoveredArticleUrl !== null,
			ignoreInputs: true
		})
	);

	const pHotkey = createHotkey(
		'P',
		async () => {
			if (!viewState.hoveredProfileName) return;
			const profile = articleCacheStore.profilesWithArticles.find(
				(p) => p.profileName === viewState.hoveredProfileName
			);
			if (!profile) return;
			const profileUrl = getProfileUrl(viewState.hoveredProfileName);
			await profileRunner(profileUrl, {
				runnerConfig: { routine: 'fromUrl' },
				options: { videosAmount: 1, scrollTimes: 1 }
			});
			articleCacheStore.invalidateProfiles();
			await articleCacheStore.fetchProfilesWithArticles({ force: true });
		},
		() => ({
			enabled: viewState.hoveredProfileName !== null,
			ignoreInputs: true
		})
	);

	const dHotkey = createHotkey(
		'D',
		async () => {
			if (!viewState.hoveredProfileId) return;
			await handleDeleteProfile(viewState.hoveredProfileId);
		},
		() => ({
			enabled: viewState.hoveredProfileId !== null,
			ignoreInputs: true
		})
	);
</script>

<div class="page-topbar">
	<!-- 	<button
		type="button"
		class="settings-trigger"
		onclick={() => (viewState.collapseProfiles = !viewState.collapseProfiles)}
		aria-label="Open settings"
	>
		<Icon name="ChevronRight" />
	</button> -->
	<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
		<ToggleIcon name="Speech" bind:checked={viewState.autoSpeechEnabled} size={20} />
	</button>
	<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
		<ToggleIcon name="ClipboardPaste" bind:checked={viewState.clipboardPollingEnabled} size={20} />
	</button>
	<button type="button" class="settings-trigger" aria-label="Toggle clipboard TTS">
		<ToggleIcon name="MessageSquareText" bind:checked={viewState.clipboardTtsEnabled} size={20} />
	</button>
	<button
		type="button"
		class="settings-trigger"
		onclick={() => drawersState.open('tts-settings')}
		aria-label="Open settings"
	>
		<Icon name="AudioWaveform" color="var(--primary-color)" size={20} />
	</button>

	<button
		type="button"
		class="settings-trigger"
		onclick={() => drawersState.open('settings')}
		aria-label="Open settings"
	>
		<Icon name="Cog" color="var(--primary-color)" size={20} />
	</button>

	<label class="color-dot-trigger" aria-label="Change primary color">
		<span class="color-dot" style:background-color={viewState.primaryColor}></span>
		<input
			type="color"
			class="color-picker-input"
			value={rgbToHex(viewState.primaryColor)}
			oninput={handleColorChange}
		/>
	</label>
</div>

<div class="dashboard-container">
	<div class="title-row">
		<button
			type="button"
			class="dashboard-title"
			style:--glow-opacity={glowIntensity}
			onclick={handleTitleClick}
			aria-label="Paste clipboard URL"
		>
			Things
		</button>
	</div>

	<div class="inputs-container">
		<div class="categories-container">
			<Categories />
		</div>
		<Input onEnter={handleEnter} placeholder="Paste URL or type a prompt..." />
	</div>

	<div class="tabs">
		<button
			type="button"
			class="tab-button"
			class:active={activeTab === 'profiles'}
			onclick={() => (activeTab = 'profiles')}
		>
			Profiles
		</button>
		<button
			type="button"
			class="tab-button"
			class:active={activeTab === 'articles'}
			onclick={() => (activeTab = 'articles')}
		>
			Articles
		</button>
	</div>

	{#if activeTab === 'profiles'}
		<div class="flex-squares">
			{#each articleCacheStore.profilesWithArticles as profile (profile.profileId)}
				<ProfileWidget
					profileWithArticles={profile}
					showTitle={false}
					collapsed={viewState.collapseProfiles}
				/>
			{:else}
				{#if articleCacheStore.loadingProfiles}
					<div class="empty-profiles-container">
						<div class="loading-indicator"></div>
					</div>
				{:else}
					<div class="empty-profiles-container">
						<div class="empty-profiles-pill">404</div>
					</div>
				{/if}
			{/each}
			{#if articleCacheStore.hasMoreProfiles}
				<LoadMoreSentinel
					onLoadMore={() => articleCacheStore.loadMoreProfiles()}
					disabled={articleCacheStore.loadingProfiles}
				/>
			{/if}
		</div>
	{:else}
		<div class="articles-grid">
			{#each articleCacheStore.articlesWithoutProfile as article (article.url)}
				<button
					type="button"
					class="article-card"
					onclick={() => handleNavigateToArticle(article.url, null)}
					onmouseenter={() => {
						viewState.hoveredArticleUrl = article.url ?? null;
						viewState.hoveredPictureSrc = article.thumbnailSrc ?? null;
					}}
					onmouseleave={() => {
						viewState.hoveredArticleUrl = null;
					}}
					aria-label="View article"
				>
					<div class="article-thumbnail-container">
						{#if !article.viewed}
							<span class="unread-dot"></span>
						{/if}
						<Tooltip content={article.title ?? ''}>
							{#if article.thumbnailSrc}
								<img
									src={article.thumbnailSrc}
									alt="Article"
									class="article-thumbnail"
									style={`view-transition-name: vt-main-image-${toVTName(article.url ?? '')}`}
								/>
							{:else}
								<div class="article-thumbnail-fallback" title={article.title ?? ''}>
									{article.title?.slice(0, 60).concat('...') ?? ''}
								</div>
							{/if}
						</Tooltip>
					</div>
					{#if article.title}
						<span class="article-title">{article.title}</span>
					{/if}
				</button>
			{:else}
				{#if articleCacheStore.loadingArticles}
					<div class="empty-profiles-container">
						<div class="loading-indicator"></div>
					</div>
				{:else}
					<div class="empty-profiles-container">
						<div class="empty-profiles-pill">No articles</div>
					</div>
				{/if}
			{/each}
			{#if articleCacheStore.hasMoreArticles}
				<LoadMoreSentinel
					onLoadMore={() => articleCacheStore.loadMoreArticles()}
					disabled={articleCacheStore.loadingArticles}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page-topbar {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 10;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		min-height: 52px;
		padding: 1.5rem;
		margin: 1px;
	}

	.settings-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.45rem;
	}

	.dashboard-container {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
		align-items: center;
		box-sizing: border-box;
		padding: 50px 10px;
		width: 100%;
		min-height: 80px;
	}

	.categories-container {
		margin: 10px 0;
	}

	.dashboard-title {
		all: unset;
		cursor: pointer;
		color: var(--primary-color);
		font-size: 2.2rem;
		padding: 0.1rem 1rem;
		position: relative;
		display: inline-block;

		text-shadow:
			0 0 5px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 10px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 20px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 40px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 80px color-mix(in srgb, white calc(100% * var(--glow-opacity, 1)), transparent);
	}

	.flex-squares {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		width: 100%;
		padding-bottom: 20%;
	}

	.empty-profiles-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.empty-profiles-pill {
		opacity: 0.6;
		transition: opacity 0.15s;
		border: 1px dashed var(--primary-color);
		border-radius: 12px;
		padding: 7px 20px;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}

	.empty-profiles-pill:hover {
		opacity: 1;
	}

	.inputs-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
		width: 100%;
		max-width: 800px;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		justify-content: center;
		padding: 10px;
	}

	.color-dot-trigger {
		all: unset;
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.45rem;
	}

	.color-dot {
		display: block;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		border: 1px solid color-mix(in srgb, var(--primary-color) 60%, transparent);
		box-shadow: 0 0 6px color-mix(in srgb, var(--primary-color) 35%, transparent);
		transition:
			box-shadow 0.15s,
			transform 0.15s;
	}

	.color-dot-trigger:hover .color-dot {
		box-shadow: 0 0 10px color-mix(in srgb, var(--primary-color) 60%, transparent);
		transform: scale(1.05);
	}

	.color-picker-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		border: none;
		padding: 0;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.tab-button {
		all: unset;
		cursor: pointer;
		padding: 0.5rem 1.5rem;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.9rem;
		transition: all 0.2s;
		border: 1px solid transparent;
	}

	.tab-button:hover {
		color: rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.05);
	}

	.tab-button.active {
		color: var(--primary-color);
		border-color: var(--primary-color);
		background: rgba(255, 255, 255, 0.03);
	}

	.articles-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1.5rem;
		width: 100%;
		max-width: 1200px;
		padding-bottom: 20%;
	}

	.article-card {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		transition: transform 0.15s;
	}

	.article-card:hover {
		transform: scale(1.03);
	}

	.article-thumbnail-container {
		position: relative;
		display: inline-flex;
	}

	.article-thumbnail {
		display: block;
		border-radius: 12px;
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
	}

	.article-thumbnail-fallback {
		display: -webkit-box;
		justify-content: center;
		align-items: center;
		border-radius: 12px;
		width: 100%;
		aspect-ratio: 16 / 10;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.75rem;
		line-height: 1.2;
		text-align: left;
		overflow: hidden;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		line-clamp: 4;
	}

	.article-title {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
</style>
