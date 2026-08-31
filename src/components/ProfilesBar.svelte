<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import { getProfiles, type ArticleProfile } from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import { toVTName } from '@/lib/utils/url';

	let profiles = $state<ArticleProfile[]>([]);
	let isLoading = $state(false);

	async function loadProfiles() {
		isLoading = true;
		try {
			profiles = await getProfiles();
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadProfiles();
	});

	function handleNavigateToProfile(profile: ArticleProfile) {
		viewState.currentProfileId = profile.id;
		goto(`/profile/${profile.id}`);
	}

	function handleHoverEnter(profile: ArticleProfile) {
		viewState.hoveredProfileName = profile.name;
		viewState.hoveredProfileId = profile.id;
	}

	function handleHoverLeave() {
		viewState.hoveredProfileName = null;
		viewState.hoveredProfileId = null;
	}
</script>

<div class="profiles-bar">
	{#if isLoading && profiles.length === 0}
		<span class="profiles-bar-loading"></span>
	{:else}
		{#each profiles as profile (profile.id)}
			{#if profile.profilePictureSrc}
				<button
					type="button"
					class="profile-btn"
					onclick={() => handleNavigateToProfile(profile)}
					onmouseenter={() => handleHoverEnter(profile)}
					onmouseleave={handleHoverLeave}
					aria-label={`Go to ${profile.name}`}
				>
					<Tooltip content={profile.name}>
						<img
							src={profile.profilePictureSrc}
							alt={profile.name}
							class="profile-avatar"
							style={`view-transition-name: vt-profile-${toVTName(profile.id)}`}
						/>
					</Tooltip>
				</button>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.profiles-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		width: 100%;
	}

	.profile-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.15s;
	}

	.profile-btn:hover {
		transform: scale(1.1);
	}

	.profile-avatar {
		display: block;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
		box-shadow: 0 0 6px color-mix(in srgb, var(--primary-color) 25%, transparent);
	}

	.profiles-bar-loading {
		width: 22px;
		height: 22px;
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
