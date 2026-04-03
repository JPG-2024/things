<script lang="ts">
type PillStatus = "loading" | "error" | "idle" | "done";

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
		border-radius: 999px;
		background-color: rgb(154, 154, 154, 0.1);
		background-size: 200% 200%;
		font-size: 0.88rem;
		line-height: 1.2;
		width: max-content;
		padding: 10px 20px;
		font-weight: bold;
	}

	.pill::before {
		display: inline-block;
		margin-right: 0.3rem;
		border-radius: 50%;
		background-color: var(--pill-indicator-idle, #6b7280);
		width: 0.5rem;
		height: 0.5rem;
		content: '';
	}

	.pill.loading::before {
		background-color: var(--pill-indicator-loading, var(--primary-color, #3b82f6));
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

	.pill.idle::before {
		background-color: var(--pill-indicator-idle, #6b7280);
	}

	.pill.done::before {
		background-color: var(--pill-indicator-done, #57f234);
	}

	.pill.done {
		opacity: 0.5;
	}

	.pill.tag {
		border-radius: 4px;
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
