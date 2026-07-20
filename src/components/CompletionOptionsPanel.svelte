<script lang="ts">
	import type { LlamaChatCompletionsRequest } from '@/lib/utils/inference/chat-completions-provider';

	interface CompletionParams extends Omit<LlamaChatCompletionsRequest, 'model' | 'messages'> {}

	let {
		model = 'llama-2',
		onParametersChange = (params: CompletionParams) => {}
	}: { model?: string; onParametersChange?: (params: CompletionParams) => void } = $props();

	let params = $state<CompletionParams>({
		temperature: 0.7,
		top_p: 0.9,
		top_k: 40,
		max_tokens: 512,
		frequency_penalty: 0,
		presence_penalty: 0,
		repeat_penalty: 1.1,
		stream: false
	});

	$effect(() => {
		onParametersChange(params);
	});
</script>

<div class="panel">
	<h2>Completion Options</h2>

	<div class="control-group">
		<label for="temperature">Temperature: <span>{params.temperature?.toFixed(2)}</span></label>
		<input
			id="temperature"
			type="range"
			min="0"
			max="2"
			step="0.05"
			bind:value={params.temperature}
		/>
	</div>

	<div class="control-group">
		<label for="top_p">Top P: <span>{params.top_p?.toFixed(2)}</span></label>
		<input id="top_p" type="range" min="0" max="1" step="0.05" bind:value={params.top_p} />
	</div>

	<div class="control-group">
		<label for="top_k">Top K</label>
		<input id="top_k" type="number" min="0" max="100" bind:value={params.top_k} />
	</div>

	<div class="control-group">
		<label for="max_tokens">Max Tokens</label>
		<input id="max_tokens" type="number" min="1" max="4096" bind:value={params.max_tokens} />
	</div>

	<div class="control-group">
		<label for="frequency_penalty"
			>Frequency Penalty: <span>{params.frequency_penalty?.toFixed(2)}</span></label
		>
		<input
			id="frequency_penalty"
			type="range"
			min="-2"
			max="2"
			step="0.1"
			bind:value={params.frequency_penalty}
		/>
	</div>

	<div class="control-group">
		<label for="presence_penalty"
			>Presence Penalty: <span>{params.presence_penalty?.toFixed(2)}</span></label
		>
		<input
			id="presence_penalty"
			type="range"
			min="-2"
			max="2"
			step="0.1"
			bind:value={params.presence_penalty}
		/>
	</div>

	<div class="control-group">
		<label for="repeat_penalty"
			>Repeat Penalty: <span>{params.repeat_penalty?.toFixed(2)}</span></label
		>
		<input
			id="repeat_penalty"
			type="range"
			min="0.8"
			max="2"
			step="0.1"
			bind:value={params.repeat_penalty}
		/>
	</div>

	<div class="control-group checkbox">
		<label for="stream">
			<input id="stream" type="checkbox" bind:checked={params.stream} />
			Stream responses
		</label>
	</div>
</div>

<style>
	.panel {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		border: 1px solid var(--primary-color, #ccc);
		border-radius: 8px;
		background-color: rgba(255, 255, 255, 0.02);
	}

	h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		color: var(--primary-color, #000);
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.control-group.checkbox {
		flex-direction: row;
		align-items: center;
	}

	label {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
		color: inherit;
	}

	label span {
		font-weight: bold;
		color: var(--primary-color, #000);
	}

	input[type='range'],
	input[type='number'] {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--primary-color, #ccc);
		border-radius: 4px;
		font-size: 0.9rem;
	}

	input[type='checkbox'] {
		margin-right: 0.5rem;
		cursor: pointer;
	}
</style>
