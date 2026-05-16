<script lang="ts">
	type Props = {
		loading: boolean;
	};

	let { loading }: Props = $props();
</script>

<div class="loading-line" class:is-loading={loading}></div>

<style>
	.loading-line {
		width: 100%;
		height: 2px;
		position: relative;
		overflow: hidden;
	}

	.loading-line::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, var(--primary-color, #7c6af7), transparent);
		opacity: 0;
		transition: opacity 0.2s;
	}

	.loading-line.is-loading::after {
		opacity: 1;
		animation: line-progress 1.2s linear infinite;
	}

	@keyframes line-progress {
		from {
			left: -100%;
		}
		to {
			left: 100%;
		}
	}
</style>
