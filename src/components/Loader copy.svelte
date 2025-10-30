<script>
  let { loading = false } = $props()
  // Animation state
  let moved = false
</script>

<div>
  <div class="square" class:move={loading} class:breath={!loading}></div>
</div>

<style>
  .square {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 100%;

    background: #ffffff;
    width: 100px;
    height: 100px;
  }

  .square.breath {
    animation-duration: 10s;
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    animation-iteration-count: infinite;
    animation-name: breath;
  }

  .square.move {
    animation-duration: 30s;
    animation-timing-function: cubic-bezier(0.68, -0.55, 0.27, 1.55);
    animation-name: moveDownUp;
  }

  @keyframes breath {
    0%,
    100% {
      transform: translateY(-51%);
    }
    25% {
      transform: translateY(25%);
    }
    50% {
      transform: translateY(-101%);
    }
    75% {
      transform: translateY(51%);
    }
  }

  @keyframes moveDownUp {
    0% {
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    1% {
      top: 80vh;
      left: 110vw;
      z-index: -1;
    }
    3% {
      top: 80vh;
      left: 110vw;
      transform: translate(-50%, -50%);
      z-index: -1;
      width: 5px;
      height: 5px;
    }
    100% {
      top: -10vh;
      left: -10vw;
      transform: translate(-50%, -50%);
      z-index: -1;
      width: 1px;
      height: 1px;
    }
  }
</style>
