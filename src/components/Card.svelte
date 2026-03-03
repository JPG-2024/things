<script lang="ts">
import type { Snippet } from "svelte"; // Optional, for TypeScript
export type CardProps = { children?: Snippet; title?: string; showTopLeftBorder?: boolean };
let {
	children,
	title = "",
	showTopLeftBorder = true,
}: { children?: Snippet; title?: string; showTopLeftBorder?: boolean } = $props();
</script>

<div class="widget" class:no-top-left-border={!showTopLeftBorder} role="group">
  {#if title}
    <div class="widget-title">{title}</div>
  {/if}
  {@render children?.()}
  <div class="widget-corner"></div>
</div>

<style>
  .widget {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    max-width: 100%;
    max-height: 100%;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.031);
    backdrop-filter: blur(20px);
    border-radius: 30px;
    padding: 15px;
    overflow: hidden;
  }

  .widget-title {
    padding: 12px;
    
    line-height: 1;
    font-size: 1rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.825);
    pointer-events: none;
    z-index: 20;
    font-family: 'Noto Sans Mono', monospace;
  }

  .widget.no-top-left-border::before,
  .widget.no-top-left-border::after {
    display: none;
  }

  /* Esquina superior izquierda + lado superior */
  .widget::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 40%; /* Cubre 40% del ancho superior */
    height: 1px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.334) 0%,
      rgba(255, 255, 255, 0.159) 50%,
      transparent 100%
    );
    border-radius: 30px 0 0 0;
  }

  .widget::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 40%; /* Cubre 40% de la altura izquierda */
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.334) 0%,
      rgba(255, 255, 255, 0.159) 50%,
      transparent 100%
    );
    border-radius: 30px 0 0 0;
  }

  /* Esquina inferior derecha + lado inferior (usando span o elemento extra) */
  .widget-corner {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 80%;
    height: 60%;
    pointer-events: none;
  }

  .widget-corner::before {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 100%;
    height: 1px;
    background: linear-gradient(
      270deg,
      rgba(255, 255, 255, 0.334) 0%,
      rgba(255, 255, 255, 0.159) 50%,
      transparent 100%
    );
    border-radius: 0 0 30px 0;
  }

  .widget-corner::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    width: 1px;
    height: 100%;
    background: linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.334) 0%,
      rgba(255, 255, 255, 0.159) 50%,
      transparent 100%
    );
    border-radius: 0 0 30px 0;
  }
</style>
