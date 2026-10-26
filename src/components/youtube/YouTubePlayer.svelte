<script lang="ts">
	import type { YouTubePlayerContext } from '@/types/youtube.types';
	import { playerStore } from '@/stores/playerStore.svelte';
	import { toThumbnailVTName } from '@/lib/utils/url';

	type Props = {
		data?: Partial<YouTubePlayerContext>;
	};

	let { data = undefined }: Props = $props();

	const playerData = $derived<Partial<YouTubePlayerContext>>(data ?? {});

	function openInFloatingPlayer(): void {
		if (!playerData.videoId) return;
		playerStore.open(playerData as YouTubePlayerContext);
	}
</script>

<div class="yt-wrapper">
	<button class="yt-thumbnail-btn" onclick={openInFloatingPlayer} aria-label="Play video">
		<img src={playerData.thumbnailImageSrc} alt="YouTube thumbnail" class="yt-thumbnail" />
	</button>

	<button class="yt-play" onclick={openInFloatingPlayer} aria-label="Play video" title="Play video">
		▶
	</button>
</div>

<style>
	/* Wrapper with 16:9 aspect ratio for responsive player */
	.yt-wrapper {
		position: relative;
		width: 100%;
		border-radius: var(--radius-md);
		padding: 1rem;
		overflow: hidden;
		border: none;
	}

	/* Maintain aspect ratio */
	.yt-wrapper::before {
		display: block;
		padding-top: 56.25%; /* 16:9 */
		content: '';
		border-radius: var(--radius-md);
	}

	.yt-wrapper img {
		position: absolute;
		top: 0%;
		left: 0;
		right: auto;
		width: 100%;
		height: 80%;
		object-fit: cover;
		border-radius: var(--radius-sm);
	}

	.yt-thumbnail-btn {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
	}

	.yt-play {
		display: flex;
		position: absolute;
		justify-content: center;
		align-items: center;
		transition:
			background 0.12s ease,
			transform 0.12s;
		cursor: pointer;
		margin: auto;
		inset: 0;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		width: 80px;
		height: 80px;
		color: white;
		font-size: 60px;

		padding-left: 5px;
		opacity: 0.9;
		transform: translateY(-20px);
	}
</style>
