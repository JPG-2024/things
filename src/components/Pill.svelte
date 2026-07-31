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
		color: var(--primary-color);
		border-radius: 12px;
		background-color: transparent;
		background-size: 200% 200%;
		line-height: 1.2;
		width: max-content;
		padding: 4px 15px;
		font-weight: bold;
		text-transform: capitalize;
	}

	.pill.show-point::before {
		content: '●';
		font-size: 0.8rem;
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
			rgb(from var(--primary-color) r g b / 0.24) 50%,
			rgb(from var(--primary-color) r g b / 0.08) 100%
		);
		animation: pill-loading-gradient 2.4s ease-in-out infinite;
	}

	.pill.error {
		background-color: var(--pill-indicator-error, #ef4444);
	}

	.pill.idle {
	}

	.pill.done {
	}

	.pill.tag {
		border-radius: 8px;
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
