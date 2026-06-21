<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import Icon from '../Icon.svelte';
	import StringReveal from '../StringReveal.svelte';
	import { calculateDaysAgo } from '@/lib/utils/date';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void runId;
	void componentProps;

	function getDataContent(key: string): string | null {
		const data = task?.data as Record<string, unknown> | null | undefined;
		if (!data) return null;
		const value = data[key];
		if (typeof value === 'string' && value.trim()) {
			return value;
		}
		return null;
	}

	let title = $derived(task?.data ? getDataContent('title') : null);
</script>

{#if task?.data && getDataContent('title') && getDataContent('profileId') && getDataContent('views') && getDataContent('uploadDate')}
	<div class="video-info">
		<!-- <h3>{getDataContent("title")}</h3> -->
		<div class="title-container">
			<!-- <StringReveal message={getDataContent("title") || ""} /> -->
			<h3 class="title">{getDataContent('title') || ''}</h3>
		</div>

		<div class="info-row">
			<div class="pill">
				<!-- <Icon name="User" /> -->
				<p class="channel-name">{getDataContent('profileId')}</p>
			</div>
			<div class="pill">
				<Icon name="Eye" size={12} />
				<p>{getDataContent('views')}</p>
			</div>
			<div class="pill">
				<Icon name="Calendar" size={12} />
				<p>{calculateDaysAgo(getDataContent('uploadDate') || '')}</p>
			</div>
		</div>
	</div>
{/if}

<style>
	.title {
		color: var(--primary-color);
		font-family: Charter;
		font-size: 1.4rem;
		margin: 0;
	}

	.title-container {
	}

	.video-info {
		width: 100%;
		color: white;
	}

	:global(.revealer) {
		font-family: Charter;
		font-size: 1.6rem;
		color: var(--primary-color);
		letter-spacing: 3px;
	}

	.channel-name {
		font-family: Charter;
		font-weight: semi-bold;
		font-size: 1.1rem;
		padding-bottom: 5px;
	}

	.pill {
		font-size: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.info-row {
		font-size: 2rem;
		display: flex;
		align-items: center;
		gap: 2rem;
		margin-top: 1rem;
		justify-content: start;
	}
</style>
