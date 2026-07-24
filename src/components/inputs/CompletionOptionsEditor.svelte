<script lang="ts">
	import RangeSelector from './RangeSelector.svelte';
	import Checkbox from './Checkbox.component.svelte';
	import Tooltip from '@/components/Tooltip.svelte';

	interface CompletionOptionsEditorProps {
		completionOptions: Record<string, unknown>;
		onChange?: () => void;
		showStream?: boolean;
	}

	let { completionOptions, onChange, showStream = true }: CompletionOptionsEditorProps = $props();

	interface ParamConfig {
		key: string;
		label: string;
		description: string;
		min: number;
		max: number;
		step: number;
		defaultValue: number;
		format?: (v: number) => string;
	}

	const intFormat = (v: number) => v.toFixed(0);

	const params: ParamConfig[] = [
		{
			key: 'temperature',
			label: 'Temperature',
			description:
				'Controls randomness. Low (0.1) = deterministic, High (1.5) = creative. Ex: 0.7 for balanced output.',
			min: 0,
			max: 2,
			step: 0.05,
			defaultValue: 0.7
		},
		{
			key: 'top_p',
			label: 'Top P',
			description:
				'Nucleus sampling: considers tokens whose cumulative probability reaches P. Ex: 0.9 = top 90% probability mass.',
			min: 0,
			max: 1,
			step: 0.05,
			defaultValue: 0.8
		},
		{
			key: 'top_k',
			label: 'Top K',
			description:
				'Limits to the K most likely next tokens. Ex: 40 restricts to top 40 candidates.',
			min: 1,
			max: 100,
			step: 1,
			defaultValue: 20,
			format: intFormat
		},
		{
			key: 'min_p',
			label: 'Min P',
			description:
				'Minimum probability relative to the best token. Ex: 0.05 filters improbable tokens.',
			min: 0,
			max: 1,
			step: 0.01,
			defaultValue: 0.0
		},
		{
			key: 'presence_penalty',
			label: 'Presence Penalty',
			description:
				'Penalizes tokens already present. Range -2 to 2. Ex: 0.5 reduces repetition moderately.',
			min: -2,
			max: 2,
			step: 0.1,
			defaultValue: 1.5
		},
		{
			key: 'repetition_penalty',
			label: 'Repetition Penalty',
			description: 'Applies penalty to repeated tokens. Ex: 1.1 mildly discourages repetition.',
			min: 0.5,
			max: 2,
			step: 0.1,
			defaultValue: 1.0
		},
		{
			key: 'n_predict',
			label: 'N Predict',
			description: 'Number of tokens to generate. Ex: 512 for short replies, 2048 for long form.',
			min: 1,
			max: 4096,
			step: 1,
			defaultValue: 256,
			format: intFormat
		},
		{
			key: 'max_tokens',
			label: 'Max Tokens',
			description: 'Hard limit on response length. Ex: 1000 for detailed answers.',
			min: 1,
			max: 4096,
			step: 1,
			defaultValue: 512,
			format: intFormat
		}
	];

	function getNum(key: string, fallback: number): number {
		const v = completionOptions[key];
		return typeof v === 'number' ? v : fallback;
	}

	function getBool(key: string): boolean {
		return completionOptions[key] === true;
	}

	function handleNumChange(key: string) {
		return (v: number) => {
			completionOptions[key] = v;
			onChange?.();
		};
	}

	function handleStreamChange(v: boolean) {
		completionOptions['stream'] = v;
		onChange?.();
	}
</script>

{#each params as p (p.key)}
	<Tooltip content={p.description} position="auto">
		<RangeSelector
			id={`completion-${p.key}`}
			label={p.label}
			value={getNum(p.key, p.defaultValue)}
			min={p.min}
			max={p.max}
			step={p.step}
			format={p.format}
			onChange={handleNumChange(p.key)}
		/>
	</Tooltip>
{/each}

{#if showStream}
	<Checkbox
		id="completion-stream"
		label="Stream"
		checked={getBool('stream')}
		onChange={handleStreamChange}
	/>
{/if}
