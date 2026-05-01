<script lang="ts">
import Modal from "../Modal.svelte";
import Dropdown from "../inputs/Dropdown.component.svelte";
import { viewState } from "../../stores/viewStore.svelte";

let { show = false, onClose = () => {} } = $props();

function closeModal() {
	onClose();
}
</script>

<Modal {show} onClose={closeModal}>
	{#snippet children()}
		<div class="modal-inner">
			<h2>Settings</h2>
			<Dropdown
				options={[
					{ label: "Spanish", value: "es" },
					{ label: "English", value: "en" },
				]}
				bind:value={viewState.language}
			/>
		</div>
	{/snippet}
</Modal>

<style>
	.modal-inner {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0 auto;
		width: min(100%, 32rem);
	}

	h2 {
		margin: 0;
	}
</style>