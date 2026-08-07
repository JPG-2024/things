<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';

	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import LoadMoreSentinel from '@/components/LoadMoreSentinel.svelte';
	import Icon from '@/components/Icon.svelte';
	import LuminousText from '@/components/LuminousText.svelte';
	import { handlePasteUrl } from '@/lib/utils/pasteUrl';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { profileRunner } from '@/runners/youtube/profileVideosRunner';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import { articleCacheStore } from '@/stores/articleCacheStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { deleteProfileById } from '@/stores/webStore';
	import { generateTTSfromArticleURL } from '@/lib/utils/tts';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import Categories from '@/components/Categories.svelte';
	import ArticleList from '@/components/ArticleList.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Toolbar from '@/components/Toolbar.svelte';
	import ToolbarDivider from '@/components/ToolbarDivider.svelte';
	import AskComponent from '@/components/AskComponent.svelte';
	import type { Task } from '@/types/taskRunner.types';
	import { goto } from '$app/navigation';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { onMount } from 'svelte';

	const profileArticleTabs = [
		{ id: 'articles', label: 'Articles' },
		{ id: 'profiles', label: 'Profiles' }
	];

	const standaloneAskTask: Task = {
		id: 'home-ask',
		dependencies: [],
		type: 'script'
	};

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

	let skipEffectFetch = $state(true);
	let askInputValue = $state('');

	onMount(async () => {
		if (viewState.activeProfileArticleTab === 'profiles') {
			await articleCacheStore.fetchProfilesWithArticles();
		} else {
			await articleCacheStore.fetchArticlesWithoutProfile({
				onlyWithoutProfile: viewState.showOnlyRawArticles
			});
		}
	});

	$effect(() => {
		if (!viewState.clipboardPollingEnabled) {
			viewState.lastHandledClipboardUrl = '';
		}
	});

	$effect(() => {
		const categories = viewState.selectedCategories;
		const tab = viewState.activeProfileArticleTab;
		const onlyRaw = viewState.showOnlyRawArticles;

		if (skipEffectFetch) {
			skipEffectFetch = false;
			return;
		}

		if (tab === 'profiles') {
			articleCacheStore.fetchProfilesWithArticles({ force: true, categoryIds: categories });
		} else {
			articleCacheStore.fetchArticlesWithoutProfile({
				force: true,
				categoryIds: categories,
				onlyWithoutProfile: onlyRaw
			});
		}
	});

	async function handleDeleteProfile(profileId: string) {
		const result = await deleteProfileById(profileId);
		if (result.success) {
			articleCacheStore.invalidateProfiles();
			await articleCacheStore.fetchProfilesWithArticles({ force: true });
		}
	}

	async function handleTitleClick() {
		try {
			const clipboardText = await invoke<string>('read_clipboard_text');
			const trimmed = (clipboardText ?? '').trim();
			if (!trimmed) return;

			if (viewState.autoSpeechEnabled && viewState.clipboardTtsEnabled) {
				const inputTrimmed = askInputValue.trim();
				if (!inputTrimmed) return;
				void ensureAudioContext();
				await ttsState.generateFromClipboard(inputTrimmed);
				return;
			}

			await handlePasteUrl(trimmed);
		} catch (error) {
			console.warn('[clipboard-paste] error', error);
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

<Toolbar justify="end" class="page-topbar">
	<!-- 	<button
		type="button"
		class="settings-trigger"
		onclick={() => (viewState.collapseProfiles = !viewState.collapseProfiles)}
		aria-label="Open settings"
	>
		<Icon name="ChevronRight" />
	</button> -->
	<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
		<ToggleIcon
			name="Speech"
			bind:checked={viewState.autoSpeechEnabled}
			size={20}
			tooltipProps={{ content: 'auto start voice' }}
		/>
	</button>
	<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
		<ToggleIcon
			name="Languages"
			bind:checked={viewState.forceLanguageEnabled}
			size={20}
			tooltipProps={{ content: 'translate to current language' }}
		/>
	</button>
	<button type="button" class="settings-trigger" aria-label="Toggle clipboard listener">
		<ToggleIcon
			name="ClipboardPaste"
			bind:checked={viewState.clipboardPollingEnabled}
			size={20}
			tooltipProps={{ content: 'listen clipboard' }}
		/>
	</button>
	<button type="button" class="settings-trigger" aria-label="Toggle clipboard TTS">
		<ToggleIcon
			name="MessageSquareText"
			bind:checked={viewState.clipboardTtsEnabled}
			size={20}
			tooltipProps={{ content: 'read copied text' }}
		/>
	</button>
	<button type="button" class="settings-trigger" aria-label="Toggle show all articles">
		<ToggleIcon name="Library" bind:checked={viewState.showOnlyRawArticles} size={20} />
	</button>
	<ToolbarDivider />
	<button type="button" class="settings-trigger" aria-label="Toggle download tracks">
		<ToggleIcon
			name="Download"
			bind:checked={viewState.downloadTracksEnabled}
			size={20}
			tooltipProps={{ content: 'download tracks from queue' }}
		/>
	</button>
	<button
		type="button"
		class="settings-trigger"
		onclick={() => drawersState.open('downloads')}
		aria-label="Open downloads"
	>
		<Icon name="ListMusic" color="var(--primary-color)" size={20} />
	</button>
	<ToolbarDivider />
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
</Toolbar>

<div class="dashboard-container">
	<div class="title-row">
		<LuminousText
			mode="random"
			size="2.2rem"
			onclick={handleTitleClick}
			aria-label="Paste clipboard URL"
		>
			Things
		</LuminousText>
	</div>

	<div class="inputs-container">
		<Tabs tabs={profileArticleTabs} bind:activeTab={viewState.activeProfileArticleTab} />
		<div class="categories-container">
			<Categories />
		</div>
		<AskComponent
			task={standaloneAskTask}
			componentProps={{ placeholder: 'Ask the model...' }}
			bind:inputValue={askInputValue}
		/>
	</div>

	{#if viewState.activeProfileArticleTab === 'profiles'}
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
		<ArticleList
			articles={articleCacheStore.articlesWithoutProfile}
			onArticleClick={(a) => handleNavigateToArticle(a.url, null)}
			onArticleHoverEnter={(a) => {
				viewState.hoveredArticleUrl = a.url ?? null;
				viewState.hoveredPictureSrc = a.thumbnailSrc ?? null;
			}}
			onArticleHoverLeave={() => {
				viewState.hoveredArticleUrl = null;
			}}
		/>
		{#if articleCacheStore.loadingArticles}
			<div class="empty-profiles-container">
				<div class="loading-indicator"></div>
			</div>
		{:else if articleCacheStore.articlesWithoutProfile.length === 0}
			<div class="empty-profiles-container">
				<div class="empty-profiles-pill">No articles</div>
			</div>
		{/if}
		{#if articleCacheStore.hasMoreArticles}
			<LoadMoreSentinel
				onLoadMore={() => articleCacheStore.loadMoreArticles()}
				disabled={articleCacheStore.loadingArticles}
			/>
		{/if}
	{/if}
</div>

<style>
	.page-topbar {
		top: 0;
		right: 0;
		left: 0;
		z-index: 10;
		min-height: 35px;
		padding: 0.3rem 1rem;
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
		gap: 1rem;
		align-items: center;
		box-sizing: border-box;
		padding: 10px 10px;
		width: 100%;
		min-height: 80px;
	}

	.categories-container {
		margin: 10px 0;
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
