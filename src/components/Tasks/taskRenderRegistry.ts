import BaseTaskRender from "@/components/Tasks/BaseTaskRender.svelte"

export const taskRenderRegistry: Record<string, unknown> = {
	base: BaseTaskRender,
}
