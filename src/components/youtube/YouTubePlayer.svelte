<script lang="ts">
	import { toVTName } from '@/lib/utils/url';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import type { YouTubePlayerContext } from '@/runners/youtube/tasks/youtubeTasks.shared';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	let showIframe = $state(false);
	const playerData = $derived((task.data ?? {}) as Partial<YouTubePlayerContext>);

	void runId;
	void componentProps;
</script>

<div class="yt-wrapper">
	{#if showIframe}
		<iframe
			class="yt-video"
			src={`https://www.youtube-nocookie.com/embed/${playerData.videoId || ''}?autoplay=1&rel=0&modestbranding=1`}
			title="YouTube video player"
			frameborder="0"
			allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
			allowfullscreen
		></iframe>
	{:else}
		<button
			class="yt-thumbnail-btn"
			onclick={() => {
				showIframe = true;
			}}
			aria-label="Play video"
		>
			<img
				src={playerData.thumbnailImageSrc}
				alt="YouTube thumbnail"
				class="yt-thumbnail"
				style={`view-transition-name: vt-main-image-${toVTName(playerData.url ?? '')}`}
			/>
		</button>

		<!-- 		<button
			class="yt-play"
			onclick={() => {
				showIframe = true;
			}}
			aria-label="Play video"
			title="Play video"
		>
			▶
		</button> -->
	{/if}
</div>

<style>
	/* Wrapper with 16:9 aspect ratio for responsive player */
	.yt-wrapper {
		position: relative;
		width: 100%;
		border-radius: 20px;
		overflow: hidden;
		border: none;
	}

	/* Maintain aspect ratio */
	.yt-wrapper::before {
		display: block;
		padding-top: 56.25%; /* 16:9 */
		content: '';
		border-radius: 20px;
	}

	.yt-wrapper img {
		position: absolute;
		top: 0%;
		left: 0;
		right: auto;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 15px;
	}

	/* Make iframe fill the wrapper */
	.yt-wrapper .yt-video {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}

	.yt-play {
		display: flex;
		position: absolute;
		justify-content: center;
		align-items: center;
		transform: translateY(-8%);
		transition:
			background 0.12s ease,
			transform 0.12s;
		cursor: pointer;
		margin: auto;
		inset: 0;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		width: 64px;
		height: 64px;
		color: white;
		font-size: 28px;
	}
</style>
