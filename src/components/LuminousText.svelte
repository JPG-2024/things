<script lang="ts">
	import type { Snippet } from 'svelte';

	const BLINK_INTERVAL = 70;

	interface Props {
		children: Snippet;
		mode?: string;
		size?: string;
		onclick?: () => void;
		[key: string]: unknown;
	}

	let { children, mode = 'off', size = '1em', onclick, ...restProps }: Props = $props();

	let glowIntensity = $state(mode === 'off' ? 0 : 1);

	function triggerQuickBlink(): ReturnType<typeof setTimeout>[] {
		const count = 2 + Math.floor(Math.random() * 6);
		const timeouts: ReturnType<typeof setTimeout>[] = [];
		let offset = 0;

		for (let i = 0; i < count; i++) {
			const dipDuration = 30 + Math.floor(Math.random() * 21);
			const onDuration = 20 + Math.floor(Math.random() * 41);

			timeouts.push(
				setTimeout(() => {
					glowIntensity = 0.15;
				}, offset),
				setTimeout(() => {
					glowIntensity = 1;
				}, offset + dipDuration)
			);

			offset += dipDuration + onDuration;
		}

		return timeouts;
	}

	$effect(() => {
		if (mode !== 'random') return;

		let blinkTimeouts: ReturnType<typeof setTimeout>[] = [];

		const interval = setInterval(() => {
			if (Math.random() > 0.5) {
				blinkTimeouts = triggerQuickBlink();
			}
		}, 8000);

		return () => {
			clearInterval(interval);
			blinkTimeouts.forEach(clearTimeout);
		};
	});

	$effect(() => {
		if (mode !== 'blink') return;

		const interval = setInterval(() => {
			glowIntensity = glowIntensity === 1 ? 0.15 : 1;
		}, BLINK_INTERVAL);

		return () => clearInterval(interval);
	});
</script>

π<button
	type="button"
	style:--glow-opacity={glowIntensity}
	style:font-size={size}
	{onclick}
	{...restProps}
>
	{@render children()}
</button>

<style>
	button {
		all: unset;
		cursor: pointer;
		color: var(--primary-color);
		position: relative;
		display: inline-block;
		font-family: 'CaskaydiaCove NFM Light', monospace;

		text-shadow:
			0 0 5px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 10px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 20px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 40px
				color-mix(in srgb, var(--primary-color) calc(100% * var(--glow-opacity, 1)), transparent),
			0 0 80px color-mix(in srgb, white calc(100% * var(--glow-opacity, 1)), transparent);
	}

	button:hover {
		text-shadow: none;
	}
</style>
