import type { Component } from 'svelte';
import AskComponent from '@/components/AskComponent.svelte';
import Image from '@/components/Image.svelte';
import MarkdownTaskComponent from '@/components/Tasks/markdownTaskComponent.svelte';
import Player from '@/components/youtube/YouTubePlayer.svelte';
import VideoInfo from '@/components/youtube/VideoInfo.svelte';
import Keywords from '@/components/Keywords.svelte';
import ListItems from '@/components/ListItems.svelte';
import ProfileTaskComponent from '@/components/Tasks/ProfileTaskComponent.svelte';

export const taskRenderRegistry: Record<string, Component<Record<string, unknown>>> = {
	ask: AskComponent,
	taskBase: MarkdownTaskComponent,
	image: Image,
	player: Player,
	videoInfo: VideoInfo,
	keywords: Keywords,
	listItems: ListItems,
	profile: ProfileTaskComponent
};
