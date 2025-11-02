<script>
  let {
    message = 'Esto es un prueba',
    loading = false,
    CHANGE_PERIOD = 40,
    TIMEOUT_SECONDS = 0.7,
    text = 'abcdefghijklmnopqrstuvwxyz',
  } = $props()

  let randomChars = $state([])
  let revealedCount = $state(0)
  let isRevealing = $state(false)

  function getRandomChar() {
    return text[Math.floor(Math.random() * text.length)]
  }

  function updateChars() {
    randomChars = randomChars.map((char, index) => (index < revealedCount ? char : getRandomChar()))
  }

  function startRevealing() {
    isRevealing = true
    const revealInterval = setInterval(() => {
      if (revealedCount < message.length) {
        randomChars[revealedCount] = message[revealedCount]
        revealedCount++
      } else {
        // When loading is true, loop the animation by resetting the counter.
        if (loading) {
          revealedCount = 0
        } else {
          clearInterval(revealInterval)
        }
      }
    }, CHANGE_PERIOD)
  }

  $effect(() => {
    // Reinitialize on message or text change
    if (typeof message !== 'string' || message.length === 0) return

    randomChars = Array(message.length).fill('')
    revealedCount = 0
    isRevealing = false

    const interval = setInterval(updateChars, CHANGE_PERIOD)
    const timeout = setTimeout(startRevealing, TIMEOUT_SECONDS * 1000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  })
</script>

<span class="loader {isRevealing ? 'revealing' : ''}">
  {#each randomChars as char, i}
    <span class="char {i < revealedCount ? 'revealed' : ''}">{char}</span>
  {/each}
</span>

<style>
  .loader {
    display: inline-flex;
    font-weight: bold;
    font-size: 0.9rem;
    font-family: monospace;
  }

  .char {
    display: inline-block;
    opacity: 0.4;
    min-width: 1ch;

    text-align: center;

    &.revealed {
      opacity: 1;
    }
  }
</style>
