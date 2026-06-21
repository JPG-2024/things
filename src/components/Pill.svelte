<script lang="ts">
	type PillStatus = 'loading' | 'error' | 'idle' | 'done';

	type Props = {
		status: PillStatus;
		text: string;
		tag?: boolean;
	};

	let { status, text, tag = false }: Props = $props();
</script>

<span class={`pill ${status} ${tag ? 'tag' : ''}`}>
	{text}
</span>

<style>
	.pill {
		color: var(--primary-color);
		border-radius: 12px;
		background-color: black;
		background-size: 200% 200%;
		font-size: 0.88rem;
		line-height: 1.2;
		width: max-content;
		padding: 7px 20px;
		font-weight: bold;
		text-transform: capitalize;
	}

	.pill.loading::before {
		background-color: var(--pill-indicator-loading, var(--primary-color, #f8f412));
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

	.pill.error::before {
		background-color: var(--pill-indicator-error, #ef4444);
	}

	.pill.idle {
		border: 1px solid var(--primary-color);
		border-radius: 16px;
	}

	.pill.done::before {
		background-color: var(--pill-indicator-done, #57f234);
	}

	.pill.done {
	}

	.pill.tag {
		border-radius: 12px;
	}

	.pill.tag::before {
		display: none;
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
