<script lang="ts">
type Props = {
	id: string;
	label: string;
	checked: boolean;
	onChange?: (v: boolean) => void;
};

let { id, label, checked, onChange }: Props = $props();

function onInput(e: Event) {
	const target = e.target as HTMLInputElement;
	checked = target.checked;
	onChange?.(checked);
}
</script>

<div class="control-group">
	<label for={id}>
		<span>{label}</span>
		<input {id} type="checkbox" {checked} oninput={onInput} />
	</label>
</div>

<style>
	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
		color: inherit;
		padding: 8px 12px;
		border-radius: 8px;
		background-color: rgba(255, 255, 255, 0.02);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	label span {
		font-weight: bold;
		color: var(--primary-color, #000);
	}

	input[type="checkbox"] {
		appearance: none;
		-webkit-appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 4px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
		cursor: pointer;
		position: relative;
		transition: all 150ms ease;
	}

	input[type="checkbox"]:hover {
		border-color: var(--primary-color, #7c6af7);
		background: rgba(124, 106, 247, 0.1);
	}

	input[type="checkbox"]:checked {
		background: var(--primary-color, #7c6af7);
		border-color: var(--primary-color, #7c6af7);
	}

	input[type="checkbox"]:checked::after {
		content: "";
		position: absolute;
		left: 5px;
		top: 2px;
		width: 4px;
		height: 8px;
		border: solid white;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	input[type="checkbox"]::-webkit-slider-thumb {
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 4px;
		cursor: pointer;
	}
</style>