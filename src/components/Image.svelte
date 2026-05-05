<script lang="ts">
import { toVTName } from "@/lib/utils/url";
import type { Task, TaskComponentProps } from "@/types/taskRunner.types";

type Props = {
	runId?: string;
	task: Task;
	componentProps?: TaskComponentProps;
};

type ImageTaskData = {
	thumbnailImageSrc?: string;
	thumbnailImage?: string;
	imageSrc?: string;
	alt?: string;
	videoId?: string;
	mediaDirectory?: string;
};

let { runId = undefined, task, componentProps = {} }: Props = $props();

const imageData = $derived((task.data ?? {}) as Partial<ImageTaskData>);
const imageSrc = $derived(
	imageData.thumbnailImageSrc ?? imageData.imageSrc ?? ""
);
const altText = $derived(
	typeof componentProps.alt === "string"
		? componentProps.alt
		: imageData.alt || task.name || "Image"
);
const transitionKey = $derived(
	imageData.videoId ??
		imageData.thumbnailImage ??
		imageData.mediaDirectory ??
		task.id
);

void runId;
</script>

{#if imageSrc}
	<div class="image-wrapper">
		<img
			src={imageSrc}
			alt={altText}
			class="image"
			style={`view-transition-name: vt-main-image-${toVTName(transitionKey)}`}
		/>
	</div>
{/if}

<style>
	.image-wrapper {
		position: relative;
		width: 100%;
		border-radius: 20px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-surface, #111) 18%, transparent);
	}

	.image-wrapper::before {
		display: block;
		padding-top: 56.25%;
		content: "";
	}

	.image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 20px;
	}
	</style>
