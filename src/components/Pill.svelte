<script lang="ts">
	type PillStatus = 'loading' | 'error' | 'idle' | 'done';

	type Props = {
		status: PillStatus;
		text: string;
		tag?: boolean;
		showPoint?: boolean;
	};

	let { status = 'idle', text, tag = false, showPoint = true }: Props = $props();
</script>

<span class={`pill ${status} ${tag ? 'tag' : ''} ${showPoint ? 'show-point' : ''}`}>
	{text === 'done' ? '' : text}
</span>

<style>
	.pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgb(194, 193, 193);
		background-color: transparent;
		background-size: 200% 200%;
		width: max-content;
		padding: 0 15px;
		text-transform: capitalize;
		font-size: 0.9rem;
		border-left: 2px solid color-mix(in srgb, var(--bg-color) 60%, transparent);
	}

	.pill.show-point.loading::before {
		color: var(--pill-indicator-loading, var(--primary-color, #f8f412));
	}

	.pill.show-point.error::before {
		color: var(--pill-indicator-error, #ef4444);
	}

	.pill.show-point.idle::before {
		color: var(--primary-color);
	}

	.pill.show-point.done::before {
		color: var(--pill-indicator-done, #57f234);
	}

	.pill.loading {
		background-image: linear-gradient(
			120deg,
			rgb(from var(--primary-color) r g b / 0.08) 0%,
			rgb(from var(--bg-color) r g b / 0.24) 50%,
			rgb(from var(--bg-color) r g b / 0.08) 100%
		);
		animation: pill-loading-gradient 2.4s ease-in-out infinite;
		border-left: none;
		padding: 0px 15px;
	}

	.pill.error {
		background-color: var(--pill-indicator-error, #ef4444);
	}

	.pill.idle {
	}

	.pill.done {
		border-left: none;
		display: none;
	}

	.pill.tag {
		border-radius: var(--radius-md);
	}

	@keyframes pill-loading-gradient {
		0% {
			background-position: 0% 50%;
		}

		50% {
			background-position: 100% 50%;
		}

		100% {
			background-position: 0% 50%;
		}
	}
</style>
