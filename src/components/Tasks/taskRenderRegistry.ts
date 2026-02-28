import BaseTaskRender from "@/components/Tasks/BaseTaskRender.svelte";
import Player from "../YouTubePlayer.svelte";

export const taskRenderRegistry: Record<string, unknown> = {
	base: BaseTaskRender,
	player: Player,
};
