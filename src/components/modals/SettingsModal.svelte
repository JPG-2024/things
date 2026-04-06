<script lang="ts">
import Modal from "../Modal.svelte";
import Dropdown from "../inputs/Dropdown.component.svelte";
import Input from "../inputs/Input.component.svelte";
import { AVAILABLE_VOICES, ttsStore } from "../../stores/ttsStore";
import { viewState } from "../../stores/viewStore.svelte";

let { show = false, onClose = () => {} } = $props();

const ttsState = ttsStore.state;

function closeModal() {
	onClose();
}

function handleVoiceChange(voice: string) {
	if (!AVAILABLE_VOICES.includes(voice)) {
		return;
	}

	ttsStore.state.update((prev) => ({ ...prev, selectedVoice: voice }));
}

function handleSpeedChange(speed: string) {
	ttsStore.state.update((prev) => ({ ...prev, speed: Number(speed) }));
}

function handleTotalStepChange(totalStep: string) {
	ttsStore.state.update((prev) => ({ ...prev, totalStep: Number(totalStep) }));
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
			<Dropdown
				options={AVAILABLE_VOICES.map((voice) => ({ label: voice, value: voice }))}
				onChange={handleVoiceChange}
				value={$ttsState.selectedVoice}
			/>
			<Input
				placeholder="speed.."
				onChange={handleSpeedChange}
				value={String($ttsState.speed)}
			/>
			<Input
				placeholder="total steps.."
				onChange={handleTotalStepChange}
				value={String($ttsState.totalStep)}
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
