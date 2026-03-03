<script lang="ts">
type PillStatus = "loading" | "error" | "idle" | "done";

type Props = {
	status: PillStatus;
	text: string;
};

let { status, text }: Props = $props();
</script>

<span class={`pill ${status}`}>
	{text}
</span>

<style>
	.pill {
		color: white;
		border: 1px solid #555;
		border-radius: 999px;
		background-color: rgb(154, 154, 154, 0.1);
		font-size: 0.75rem;
		line-height: 1.2;
		width: max-content;
		padding: 5px 8px;
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
		background-color: var(--pill-indicator-loading, #f59e0b);
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
</style>
