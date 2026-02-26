<script lang="ts">
import { primaryColor } from "@/stores/uiStore"
import { viewState } from "@/stores/viewStore.svelte"

let { children } = $props()

let flashy = $state(false)

let mainElement: HTMLElement | undefined = $state()

$effect(() => {
	if (mainElement) {
		console.log("Updating primary color to:", $primaryColor)
		mainElement.style.setProperty("--primary-color", $primaryColor)
	}

	console.log("ViewState loaded:", viewState.loaded)
})

// scroll effect
/*   $effect(() => {
    if (mainElement === undefined) return

    mainElement.scrollTop = 100

    if (viewState.loaded && mainElement) {
      setTimeout(() => {
        if (mainElement === undefined) return
        // scroll mainElement to top of page

        mainElement.scrollTop = 0
      }, 200) // Delay to allow the flashy animation to complete
    }
  }) */

$effect.pre(() => {
	let stopFlow: undefined | (() => void)
	viewState.initFlowStatusListeners().then((stop) => (stopFlow = stop))
	viewState.initMediaBasePath()

	const flashyInterval = setInterval(() => {
		if (viewState.loading) return

		flashy = true
		setTimeout(() => {
			flashy = false
		}, 2000) // Duración de la animación
	}, 30000)

	return () => {
		stopFlow?.()
		clearInterval(flashyInterval)
	}
})

// Global View Transitions wrapper for all client navigations
/*   onNavigate((navigation) => {
    const anyDoc: any = document
    if (!anyDoc || typeof anyDoc.startViewTransition !== 'function') return

    if (document.hidden) {
      return
    }

    return new Promise((resolve) => {
      anyDoc.startViewTransition(async () => {
        // Allow SvelteKit to proceed with navigation
        resolve()
        // Wait until the new route is fully rendered so the "new" snapshot has the elements
        await navigation.complete
      })
    })
  }) */
</script>

<main
  id="layout-main"
  bind:this={mainElement}
  class="container {viewState.loading ? 'loading' : ''} {flashy ? 'flashy' : ''} {viewState.loaded
    ? 'loaded'
    : ''}"
>
  {@render children()}
</main>

<style>
  :global(body) {
    margin: 0;
    font-size: 15px;
    font-family: 'Noto Sans Mono Thin', monospace;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :root {
    color: #ffffff;
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
    background-image: linear-gradient(-45deg, var(--primary-color) 10%, rgba(0, 0, 0, 0.68) 90%);
    background-size: 400% 400%;
    background-attachment: fixed;
    background-color: #000000;
    overflow-y: auto;
    height: 100vh;
    padding: 2rem;
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
      transform: translateY(-100%);
    }
    to {
      transform: translateY(100%);
    }
  }

  @keyframes gradient {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 10% 10%;
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
