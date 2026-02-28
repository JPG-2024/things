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
    padding-top: 50px;
    overflow: hidden;
  }

  .widget-title {
    position: absolute;
    top: 30px;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 0 14px;
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

  .img-flex {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 10px;
    padding-top: 10px;
    box-sizing: border-box;
    width: 100%;
    height: auto;
    align-items: start;
  }

  .mini-img {
    border-radius: 15px;
    width: 45px;
    height: 45px;
    object-fit: cover;
    will-change: transform, opacity;
    transform: translateZ(0);
  }

  .img-button {
    transition: transform 0.2s ease-in-out;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  .yt-button::after {
    position: absolute;
    top: 58%;
    left: 50%;
    transform: translate(-50%, -50%);
    content: '▶';
    color: rgb(255, 0, 0);
    font-size: 24px;
  }

  .img-button:hover {
    transform: scale(1.05);
  }

  .img-button:active {
    transform: scale(0.98);
  }
</style>
