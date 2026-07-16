<script lang="ts">
	import RangeSelector from './RangeSelector.svelte';
	import Checkbox from './Checkbox.component.svelte';

	interface CompletionOptionsEditorProps {
		completionOptions: Record<string, unknown>;
		onChange?: () => void;
		showStream?: boolean;
	}

	let { completionOptions, onChange, showStream = true }: CompletionOptionsEditorProps = $props();

	interface ParamConfig {
		key: string;
		label: string;
		min: number;
		max: number;
		step: number;
		defaultValue: number;
		format?: (v: number) => string;
	}

	const intFormat = (v: number) => v.toFixed(0);

	const params: ParamConfig[] = [
		{ key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.05, defaultValue: 0.7 },
		{ key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.05, defaultValue: 0.8 },
		{
			key: 'top_k',
			label: 'Top K',
			min: 1,
			max: 100,
			step: 1,
			defaultValue: 20,
			format: intFormat
		},
		{ key: 'min_p', label: 'Min P', min: 0, max: 1, step: 0.01, defaultValue: 0.0 },
		{
			key: 'presence_penalty',
			label: 'Presence Penalty',
			min: -2,
			max: 2,
			step: 0.1,
			defaultValue: 1.5
		},
		{
			key: 'repetition_penalty',
			label: 'Repetition Penalty',
			min: 0.5,
			max: 2,
			step: 0.1,
			defaultValue: 1.0
		},
		{
			key: 'n_predict',
			label: 'N Predict',
			min: 1,
			max: 4096,
			step: 1,
			defaultValue: 256,
			format: intFormat
		},
		{
			key: 'max_tokens',
			label: 'Max Tokens',
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
{/each}

{#if showStream}
	<Checkbox
		id="completion-stream"
		label="Stream"
		checked={getBool('stream')}
		onChange={handleStreamChange}
	/>
{/if}
