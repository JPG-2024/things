import type { Component } from "svelte";
import BaseTaskRender from "@/components/Tasks/BaseTaskRender.svelte";
import Player from "@/components/youtube/YouTubePlayer.svelte";
import VideoInfo from "@/components/youtube/VideoInfo.svelte";

export const taskRenderRegistry: Record<
	string,
	Component<Record<string, unknown>>
> = {
	base: BaseTaskRender,
	player: Player,
	videoInfo: VideoInfo,
};
