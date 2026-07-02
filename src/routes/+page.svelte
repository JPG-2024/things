<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { invoke } from '@tauri-apps/api/core';

	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import Icon from '@/components/Icon.svelte';
	import { extractValidUrl, handlePasteUrl } from '@/lib/utils/pasteUrl';
	import { getProfileUrl, handleYoutubeQuestion } from '@/lib/utils/youtube';
	import { profileRunner } from '@/runners/youtube/profileVideosRunner';
	import { viewState, drawersState } from '@/stores/viewStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { getProfilesByCategories, deleteProfileById } from '@/stores/webStore';
	import { generateTTSfromArticleURL } from '@/lib/utils/tts';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import Categories from '@/components/Categories.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import Input from '@/components/inputs/Input.component.svelte';

	let glowIntensity = $state(1);

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

		console.log(profileCategories);

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

	const queryClient = useQueryClient();

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

	const profilesQuery = createQuery({
		queryKey: ['profiles'],
		queryFn: () => getProfilesByCategories(viewState.selectedCategories),
		placeholderData: (prev) => prev
	});

	console.log(profilesQuery);

	let initialCategoryLoad = $state(true);
	$effect(() => {
		viewState.selectedCategories.length;
		if (!initialCategoryLoad) {
			$profilesQuery.refetch();
		}
		initialCategoryLoad = false;
	});

	const profileCategories = $derived($profilesQuery.data ?? []);

	async function handleDeleteProfile(profileId: string) {
		const result = await deleteProfileById(profileId);
		if (result.success) {
			queryClient.invalidateQueries({ queryKey: ['profiles'] });
		}
	}

	function handleEnter(value: string) {
		const trimmed = value.trim();
		if (!trimmed) return;

		const validUrl = extractValidUrl(trimmed);
		if (validUrl) {
			void handlePasteUrl(trimmed, { queryClient });
		} else {
			handleYoutubeQuestion(trimmed);
			//navigate(`/chat?prompt=${encodeURIComponent(trimmed)}`);
		}
	}

	async function handleTitleClick() {
		try {
			const clipboardText = await invoke<string>('read_clipboard_text');
			const trimmed = (clipboardText ?? '').trim();
			if (!trimmed) return;
			await handlePasteUrl(trimmed, { queryClient });
		} catch {
			viewState.clipboardPollingEnabled = false;
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
			const profile = profileCategories.find((p) => p.name === viewState.hoveredProfileName);
			if (!profile) return;
			const profileUrl = getProfileUrl(viewState.hoveredProfileName);
			await profileRunner(profileUrl, {
				runnerConfig: { routine: 'fromUrl' },
				options: { videosAmount: 1, scrollTimes: 1 }
			});
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

		<!--     <Input onChange={(prompt) => (viewState.prompt = prompt)} />
    <Input onChange={(query) => (viewState.prompt = query)} /> -->
		<!-- <InstantResponse model="gpt-3.5-turbo" maxTokens={512} /> -->
		<!-- <button onclick={() => handleYoutubeQuestion(viewState.prompt!)}>search</button> -->
	</div>

	<div class="flex-squares">
		{#each profileCategories as profile (profile.id)}
			<ProfileWidget {profile} showTitle={false} collapsed={viewState.collapseProfiles} />
		{:else}
			<div class="empty-profiles-container">
				<div class="empty-profiles-pill">404</div>
			</div>
		{/each}
	</div>
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

	/* The widget-specific styles were moved to `src/components/CategoryWidget.svelte` */
</style>
