<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import { urlRouter } from '@/lib/urlRouter/urlRouter';
	import { goto } from '$app/navigation';

	interface Props {
		task?: Task;
		componentProps?: TaskComponentProps;
	}

	let { task = undefined, componentProps = {} }: Props = $props();

	void componentProps;

	interface ProfileData {
		name: string;
		profilePicture: string | null;
		videoUrls: string[];
		videosTitles: string[];
		videosImageSrc: string[];
		id: string;
	}

	const profileData = $derived.by((): ProfileData | null => {
		const data = task?.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		return {
			name: (data.name as string) ?? '',
			profilePicture: (data.profilePicture as string) ?? null,
			videoUrls: (data.videoUrls as string[]) ?? [],
			videosTitles: (data.videosTitles as string[]) ?? [],
			videosImageSrc: (data.videosImageSrc as string[]) ?? [],
			id: (data.id as string) ?? ''
		};
	});

	$inspect(profileData);

	async function handleNavigate(url: string) {
		await urlRouter(url);
		goto(`/youtube/${encodeURIComponent(url)}`);
	}
</script>

{#if profileData}
	<div class="profile-task">
		{#if profileData.profilePicture}
			<div class="profile-header">
				<img src={profileData.profilePicture} alt={profileData.name} class="profile-avatar" />
				{#if profileData.name}
					<span class="profile-name">{profileData.name}</span>
				{/if}
			</div>
		{/if}

		{#if profileData.videosImageSrc.length > 0}
			<div class="video-grid">
				{#each profileData.videosImageSrc as src, i (i)}
					<button
						type="button"
						class="video-card"
						onclick={() => handleNavigate(profileData.videoUrls[i])}
					>
						<img {src} alt={profileData.videosTitles[i] ?? ''} class="video-thumb" />
						{#if profileData.videosTitles[i]}
							<span class="video-title">{profileData.videosTitles[i]}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.profile-task {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.profile-avatar {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
	}

	.profile-name {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--primary-color);
	}

	.video-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		width: 100%;
	}

	.video-card {
		all: unset;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		width: 140px;
		cursor: pointer;
		border-radius: 0.5rem;
		transition: transform 0.15s ease;
	}

	.video-card:hover {
		transform: scale(1.05);
	}

	.video-thumb {
		width: 140px;
		height: 79px;
		border-radius: 0.5rem;
		object-fit: cover;
		display: block;
	}

	.video-title {
		font-size: 0.75rem;
		line-height: 1.3;
		text-align: center;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
		word-break: break-word;
	}
</style>
