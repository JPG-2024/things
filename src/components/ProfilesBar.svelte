<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Tooltip from '@/components/Tooltip.svelte';
	import Modal from '@/components/Modal.svelte';
	import {
		fetchRemoteProfile,
		getProfiles,
		saveProfile,
		SCRAPY_BASE_URL,
		type ArticleProfile
	} from '@/stores/webStore';
	import { viewState } from '@/stores/viewStore.svelte';
	import { toVTName } from '@/lib/utils/url';

	let profiles = $state<ArticleProfile[]>([]);
	let isLoading = $state(false);

	const filterTerm = $derived(viewState.unifiedFilter.trim().toLowerCase());
	let filteredProfiles = $derived(
		filterTerm ? profiles.filter((p) => p.name.toLowerCase().includes(filterTerm)) : profiles
	);

	let showAddModal = $state(false);
	let profileNameInput = $state('');
	let isSubmitting = $state(false);
	let addError = $state('');

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

	function handleOpenAddModal() {
		profileNameInput = '';
		addError = '';
		showAddModal = true;
	}

	function handleCloseAddModal() {
		if (isSubmitting) return;
		showAddModal = false;
	}

	async function handleAddProfile() {
		const name = profileNameInput.trim();
		if (!name) {
			addError = 'Enter a profile name';
			return;
		}

		isSubmitting = true;
		addError = '';
		try {
			const remoteProfile = await fetchRemoteProfile(name);
			if (!remoteProfile) {
				addError = 'Profile not found';
				return;
			}

			await saveProfile(
				remoteProfile.id,
				remoteProfile.profileImage,
				`${SCRAPY_BASE_URL}/api/profile/${name}`,
				'youtube.com'
			);
			showAddModal = false;
			await loadProfiles();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="profiles-bar">
	{#if isLoading && profiles.length === 0}
		<span class="profiles-bar-loading"></span>
	{:else}
		<!-- 		<button
			type="button"
			class="profile-btn add-profile-btn"
			onclick={handleOpenAddModal}
			aria-label="Add profile"
		>
			<Tooltip content="Add profile">
				<span class="add-profile-icon">+</span>
			</Tooltip>
		</button> -->
		{#each filteredProfiles as profile (profile.id)}
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

<Modal show={showAddModal} onClose={handleCloseAddModal}>
	<form class="add-profile-form" onsubmit={(e) => e.preventDefault()}>
		<h3 class="add-profile-title">Add profile</h3>
		<input
			type="text"
			class="add-profile-input"
			placeholder="@LucianoMattica"
			bind:value={profileNameInput}
		/>
		{#if addError}
			<p class="add-profile-error">{addError}</p>
		{/if}
		<button
			type="submit"
			class="add-profile-submit"
			onclick={handleAddProfile}
			disabled={isSubmitting}
		>
			{isSubmitting ? 'Adding…' : 'Add'}
		</button>
	</form>
</Modal>

<style>
	.profiles-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 1.1rem;
		width: fit-content;
		padding: 0 1rem;
	}

	.profile-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.15s;
		opacity: 0.8;
	}

	.profile-btn:hover {
		opacity: 1;
	}

	.profile-avatar {
		display: block;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		object-fit: cover;
		/* 		border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
		box-shadow: 0 0 6px color-mix(in srgb, var(--primary-color) 25%, transparent); */
	}

	.add-profile-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		font-size: 1.1rem;
		line-height: 1;
		color: var(--primary-color);
		border: 1px dashed color-mix(in srgb, var(--primary-color) 50%, transparent);
		opacity: 0.75;
		transition: opacity 0.15s;
	}

	.add-profile-btn:hover .add-profile-icon {
		opacity: 1;
	}

	.add-profile-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: stretch;
	}

	.add-profile-title {
		margin: 0;
		font-size: 1.1rem;
	}

	.add-profile-input {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-sm);
		color: white;
		padding: 0.6rem 0.8rem;
		font-size: 0.95rem;
		outline: none;
	}

	.add-profile-input:focus {
		border-color: var(--primary-color);
	}

	.add-profile-error {
		margin: 0;
		color: #ff6b6b;
		font-size: 0.85rem;
	}

	.add-profile-submit {
		background: var(--primary-color);
		border: none;
		border-radius: var(--radius-sm);
		color: black;
		font-weight: bold;
		font-size: 0.9rem;
		padding: 0.6rem 1rem;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.add-profile-submit:hover {
		opacity: 0.85;
	}

	.add-profile-submit:disabled {
		opacity: 0.5;
		cursor: default;
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
