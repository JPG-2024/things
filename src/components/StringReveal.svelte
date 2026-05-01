<script lang="ts">
let {
	message = "Esto es un prueba",
	loading = false,
	CHANGE_PERIOD = 10,
	TIMEOUT_SECONDS = 500,
	text = "!@#$%^&*()_+-=[]{}|;:,.<>/?`~",
} = $props();

let randomChars = $state<string[]>([]);
let revealedCount = $state(0);
let isRevealing = $state(false);

function getRandomChar() {
	return message[Math.floor(Math.random() * message.length)];
}

function updateChars() {
	randomChars = randomChars.map((char, index) =>
		index < revealedCount ? char : getRandomChar()
	);
}

function startRevealing() {
	isRevealing = true;
	const revealInterval = setInterval(() => {
		if (revealedCount < message.length) {
			randomChars[revealedCount] = message[revealedCount];
			revealedCount++;
		} else {
			// When loading is true, loop the animation by resetting the counter.
			if (loading) {
				revealedCount = 0;
			} else {
				clearInterval(revealInterval);
			}
		}
	}, CHANGE_PERIOD);
}

$effect(() => {
	// Reinitialize on message or text change
	if (typeof message !== "string" || message.length === 0) return;

	randomChars = Array(message.length).fill("");
	revealedCount = 0;
	isRevealing = false;

	const interval = setInterval(updateChars, CHANGE_PERIOD);
	const timeout = setTimeout(startRevealing, TIMEOUT_SECONDS * 1);

	return () => {
		clearInterval(interval);
		clearTimeout(timeout);
	};
});
</script>

<div class="revealer {isRevealing ? 'revealing' : ''}">
  {#each randomChars as char, i}
    {char}
  {/each}
</div>

<style>
  .revealer {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    text-align: left;
  }

  .char {
    display: inline-block;
    opacity: 0.4;
    min-width: 1ch;
    text-align: center;
  }
</style>
