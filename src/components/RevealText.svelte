<script lang="ts">
	interface Props {
		/** String to reveal. Rendered only when non-null and non-empty. */
		text: string | null | undefined;
		/** Gate for the reveal animation (e.g. a "process finished" flag). */
		reveal?: boolean;
		/** CSS font-size, e.g. `'0.95rem'`. */
		fontSize?: string;
		/** Trailing `.` flourish. */
		dot?: boolean;
	}

	let { text, reveal = true, fontSize = 'inherit', dot = false }: Props = $props();
</script>

{#if text}
	<div class="reveal-text" class:reveal class:dot style:font-size={fontSize}>
		{text}
	</div>
{/if}

<style>
	.reveal-text {
		position: relative;
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: var(--font-secondary);
		font-variant: all-small-caps;
	}

	.reveal-text.dot::after {
		content: '.';
	}

	/* Left→right wipe + light sweep. Only applied when `reveal` is true: text
	   that is already present on mount (a cached value, not a finished
	   process) shows without the animations. */
	.reveal-text.reveal {
		animation: reveal-text-wipe 0.9s cubic-bezier(0.4, 0, 0.2, 1) both;
	}

	/* Colored shine crossing the text left → right while the wipe reveals it
	   (moved from the old topbar sweep). */
	.reveal-text.reveal::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		mix-blend-mode: screen;
		background: linear-gradient(
			90deg,
			transparent 0%,
			transparent 35%,
			color-mix(in srgb, var(--primary-color) 60%, white) 10%,
			transparent 65%,
			transparent 100%
		);
		background-size: 45% 100%;
		background-repeat: no-repeat;
		animation: reveal-text-sweep 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}

	@keyframes reveal-text-wipe {
		from {
			clip-path: inset(0 100% 0 0);
		}
		to {
			clip-path: inset(0 0 0 0);
		}
	}

	@keyframes reveal-text-sweep {
		from {
			background-position: -100% 0;
		}
		to {
			background-position: 200% 0;
		}
	}
</style>
