<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';

	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import Icon from '@/components/Icon.svelte';
	import SettingsModal from '@/components/modals/SettingsModal.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { navigate } from '@/lib/utils/url';
	import { getProfileUrl } from '@/lib/utils/youtube';
	import { youtubeProfileRunner } from '@/runners/youtube/profileVideosRunner';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import {
		getProfilesWithArticlesAfter,
		UNKNOWN_PROFILE_ID,
		UNKNOWN_PROFILE_LABEL,
		getArticleWithTasksByUrl,
		deleteProfileById
	} from '@/stores/tasksStore';
	import { prefetchHomeData } from '@/lib/prefetchHomeData';

	const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

	let processingUrl = $state(false);

	const profilesQuery = createQuery({
		queryKey: ['profiles'],
		queryFn: () => getProfilesWithArticlesAfter(Date.now() - 5 * 24 * 60 * 60 * 1000)
	});

	const profileCategories = $derived(
		$profilesQuery.data?.length
			? $profilesQuery.data
			: [{ id: UNKNOWN_PROFILE_ID, name: UNKNOWN_PROFILE_LABEL, count: 0 }]
	);

	async function handleDeleteProfile(profileId: string) {
		const result = await deleteProfileById(profileId);
		if (result.success) {
			queryClient.invalidateQueries({ queryKey: ['profiles'] });
		}
	}

	function extractValidUrl(value: string): string | null {
		const trimmedValue = value.trim();

		if (!trimmedValue || !HTTP_URL_REGEX.test(trimmedValue)) {
			return null;
		}

		try {
			const parsedUrl = new URL(trimmedValue);
			if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
				return null;
			}

			return parsedUrl.toString();
		} catch {
			return null;
		}
	}

	async function handlePasteUrl(url: string) {
		const validUrl = extractValidUrl(url);
		if (!validUrl || processingUrl) return;

		processingUrl = true;

		try {
			viewState.lastHandledClipboardUrl = validUrl;
			navigate(`/youtube/${encodeURIComponent(validUrl)}`);
			await urlRouter(validUrl);
			queryClient.invalidateQueries({ queryKey: ['profiles'] });
			queryClient.invalidateQueries({ queryKey: ['articles'] });
			await prefetchHomeData(queryClient);
		} finally {
			processingUrl = false;
		}
	}

	function handleEnter(value: string) {
		const trimmed = value.trim();
		if (!trimmed) return;

		const validUrl = extractValidUrl(trimmed);
		if (validUrl) {
			void handlePasteUrl(trimmed);
		} else {
			navigate(`/chat?prompt=${encodeURIComponent(trimmed)}`);
		}
	}

	const queryClient = useQueryClient();

	const sHotkey = createHotkey(
		'S',
		async () => {
			if (!viewState.hoveredArticleUrl) return;
			const article = await getArticleWithTasksByUrl(viewState.hoveredArticleUrl);
			const titleSummaryTask = article?.persistedTasks?.find((t) => t.id === 'title-summary');
			if (!titleSummaryTask?.data) {
				throw new Error('No title-summary data found for this article');
			}
			ttsState.setTextContents([titleSummaryTask.data as string]);
			await ttsState.generateTTS();
		},
		() => ({
			enabled: viewState.hoveredArticleUrl !== null,
			ignoreInputs: true
		})
	);

	$inspect(profileCategories);

	const pHotkey = createHotkey(
		'P',
		async () => {
			if (!viewState.hoveredProfileName) return;
			const profile = profileCategories.find((p) => p.name === viewState.hoveredProfileName);
			if (!profile) return;
			const profileUrl = getProfileUrl(viewState.hoveredProfileName);
			await youtubeProfileRunner(profileUrl);
			queryClient.invalidateQueries({ queryKey: ['articles', profile.id] });
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
	<button
		type="button"
		class="settings-trigger"
		onclick={() => (viewState.modalSettingVisible = true)}
		aria-label="Open settings"
	>
		<Icon name="Settings" />
	</button>
</div>

<div class="dashboard-container">
	<div class="title-row">
		<span class="dashboard-title">Things</span>
	</div>

	<div class="inputs-container">
		<Input onEnter={handleEnter} placeholder="Paste URL or type a prompt..." />
		<!--     <Input onChange={(prompt) => (viewState.prompt = prompt)} />
    <Input onChange={(query) => (viewState.prompt = query)} /> -->
		<!-- <InstantResponse model="gpt-3.5-turbo" maxTokens={512} /> -->
		<!-- <button onclick={() => handleYoutubeQuestion(viewState.prompt!)}>search</button> -->
	</div>

	<div class="flex-squares">
		{#each profileCategories as profile (profile.id)}
			<ProfileWidget {profile} showTitle={false} />
		{/each}
	</div>
</div>

<SettingsModal
	show={viewState.modalSettingVisible}
	onClose={() => (viewState.modalSettingVisible = false)}
/>

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
		padding: 0 1rem;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		background: rgba(54, 54, 54, 0.2);
	}

	.settings-trigger {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.45rem;
		background: rgba(255, 255, 255, 0.06);
	}

	.dashboard-container {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
		align-items: center;
		box-sizing: border-box;
		padding: 76px 20px 20px;
		width: 100%;
	}

	.dashboard-title {
		color: var(--primary-color);
		font-size: 2.2rem;
		padding: 0.1rem 1rem;
	}

	.flex-squares {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		width: 100%;
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

	/* The widget-specific styles were moved to `src/components/CategoryWidget.svelte` */
</style>
