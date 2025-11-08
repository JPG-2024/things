<script lang="ts">
  import { listen } from '@tauri-apps/api/event'
  import { loading, loaded, initFlowStatusListeners } from '../stores/viewStore'
  // SvelteKit programmatic navigation
  import { goto } from '$app/navigation'
  let { children } = $props()

  let listeningClipboard = $state(true)
  let flashy = $state(false)

  $effect.pre(() => {
    let stopFlow: undefined | (() => void)
    initFlowStatusListeners().then((stop) => (stopFlow = stop))

    let unlistenClipboard: undefined | (() => void)
    listen('clipboard-changed', (event) => {
      if (!listeningClipboard) return
      const payload = (event.payload as string)?.trim()
      if (!payload) return
      // Navigate to dynamic article route; encode to keep the URL safe
      // check payload is a url string
      const urlPattern = /^(https?:\/\/[^\s]+)/g
      if (!urlPattern.test(payload)) return
      goto(`/article/${encodeURIComponent(payload)}`)
    }).then((u) => (unlistenClipboard = u))

    const flashyInterval = setInterval(() => {
      if ($loading) return

      flashy = true
      setTimeout(() => {
        flashy = false
      }, 2000) // Duración de la animación
    }, 20000)

    return () => {
      stopFlow?.()
      unlistenClipboard?.()
      clearInterval(flashyInterval)
    }
  })
</script>

<main
  class="container {$loading ? 'loading' : ''} {flashy ? 'flashy' : ''} {$loaded ? 'loaded' : ''}"
>
  {@render children()}
</main>

<style>
  :global(body) {
    margin: 0;
    height: 100vh;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :root {
    color: #ffffff;
    font-size: 16px;
    line-height: 24px;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;

    * {
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE 10+ */
      &::-webkit-scrollbar {
        background: transparent; /* Chrome/Safari/Webkit */
        width: 0px;
      }
    }
  }

  main {
    display: flex;
    position: relative;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    box-sizing: border-box;
    margin: 0;
    background-image: linear-gradient(
      -45deg,
      rgba(33, 207, 117, 0.27) 10%,
      rgba(33, 207, 117, 0.16) 35%,
      rgba(10, 134, 70, 0.07) 60%,
      rgba(0, 0, 0, 0.68) 90%
    );
    background-size: 400% 400%;
    background-attachment: fixed;
    background-color: #082b19;
    padding: 1rem;
    height: 100vh;
    overflow-y: auto;
    scroll-behavior: smooth;
    scroll-padding-top: 2rem;
  }

  /* Overlay que barre el viewport cuando .flashy está activo */
  main.loaded::after {
    position: fixed;
    transform: translateY(-120%);
    z-index: 9999;
    /* opcional para efecto “sheen”: */
    mix-blend-mode: screen;
    animation: sweep-overlay 1s ease-in-out forwards; /* 5s = tu ventana de flashy */
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0) 10%,
      rgba(255, 255, 255, 0.6) 50%,
      rgba(255, 255, 255, 0) 80%,
      rgba(255, 255, 255, 0) 100%
    );
    pointer-events: none; /* que no bloquee clicks */
    content: '';
  }

  .loading {
    animation: gradient 2s ease infinite;
  }

  .flashy {
    animation: flashy 2s ease-in-out infinite;
  }

  @keyframes sweep-overlay {
    from {
      transform: translateY(-120%);
    }
    to {
      transform: translateY(120%);
    }
  }

  @keyframes gradient {
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

  @keyframes flashy {
    0% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 80% 5%;
    }
    100% {
      background-position: 0% 0%;
    }
  }
</style>
