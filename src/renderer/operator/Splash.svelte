<script lang="ts">
  import { dovePose, LOGO_PARTS } from './splash-logo';

  const { ring, dove, cef, letters } = LOGO_PARTS;

  let done = $state(matchMedia('(prefers-reduced-motion: reduce)').matches);
  let skipped = $state(false);

  const skip = () => (skipped = true);

  // Aletea en la vuelta y, al posarse, cada vez menos hasta plegar el ala como en el logo.
  const WING_BEATS = [0, -62, 10, -62, 10, -62, 10, -62, 10, -62, 10, -44, 7, -24, 4, 0];
  const FLAP_MS = 1600;

  function flap(dovePath: SVGPathElement) {
    const frames = WING_BEATS.map((degrees) => ({ d: `path("${dovePose(degrees)}")` }));
    dovePath.animate(frames, { duration: FLAP_MS, delay: 150, easing: 'linear' });
  }

  function onEnd(event: AnimationEvent) {
    if (event.target === event.currentTarget) done = true;
  }
</script>

<svelte:window onpointerdowncapture={skip} onkeydowncapture={skip} />

<!-- No frena a nadie: los clics y el teclado pasan a la consola, y cualquiera de los dos la saltea. -->
{#if !done}
  <div id="inicio" class="splash" class:skipped aria-hidden="true" onanimationend={onEnd}>
    <svg class="logo" viewBox="0 0 6281 2828">
      <defs>
        <mask id="inicio-pincel" maskUnits="userSpaceOnUse" x="-300" y="-300" width="3400" height="3400">
          <path class="brush" d="M2381 659A1230 1230 0 1 1 2118 410" pathLength="1" />
        </mask>
        <linearGradient id="inicio-borde">
          <stop offset="0.85" stop-color="#fff" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <mask id="inicio-escritura" maskUnits="userSpaceOnUse" x="0" y="0" width="6281" height="2828">
          <rect class="wipe" x="300" y="0" width="3000" height="2828" fill="url(#inicio-borde)" />
        </mask>
        <mask id="inicio-todo" maskUnits="userSpaceOnUse" x="0" y="0" width="6281" height="2828">
          <path d={ring} fill="#fff" />
          <path d={dove} fill="#fff" fill-rule="evenodd" />
          <path d={cef} fill="#fff" fill-rule="evenodd" />
          {#each letters as letter, index (index)}
            <path d={letter} fill="#fff" />
          {/each}
        </mask>
        <radialGradient id="inicio-cometa">
          <stop offset="0" stop-color="#ffdf9a" stop-opacity="0.9" />
          <stop offset="1" stop-color="#f2b544" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="inicio-brillo">
          <stop offset="0" stop-color="#f2b544" stop-opacity="0" />
          <stop offset="0.45" stop-color="#f2b544" />
          <stop offset="0.55" stop-color="#fff3d6" />
          <stop offset="1" stop-color="#f2b544" stop-opacity="0" />
        </linearGradient>
      </defs>

      <path class="gold" d={ring} mask="url(#inicio-pincel)" />
      <g mask="url(#inicio-escritura)"><path class="white" d={cef} fill-rule="evenodd" /></g>

      <circle class="pulse" cx="2367" cy="559" r="260" />

      <!-- La paloma da la vuelta adelante del pincel y se posa en el hueco del círculo. -->
      <g class="orbit">
        <circle class="comet" cx="2367" cy="559" r="560" fill="url(#inicio-cometa)" />
        <path class="gold" d={dove} fill-rule="evenodd" {@attach flap} />
      </g>

      {#each letters as letter, index (index)}
        <path class="white letter" style:--order={index} d={letter} />
      {/each}

      <!-- Su propio recuadro: el borde del brillo se escapa de la máscara y deja una rayita. -->
      <svg width="6281" height="2828">
        <g mask="url(#inicio-todo)">
          <rect class="shine" x="-1600" y="-800" width="1500" height="4400" fill="url(#inicio-brillo)" />
        </g>
      </svg>
    </svg>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    pointer-events: none;
    background: radial-gradient(circle at 50% 46%, #18233f 0%, #05070d 62%);
    animation: leave 0.45s ease 2.6s forwards;
  }

  .splash.skipped {
    animation: skip 0.2s ease forwards;
  }

  .logo {
    width: min(86vw, 780px);
    overflow: visible;
    animation: approach 3s ease-out both;
  }

  .brush {
    fill: none;
    stroke: #fff;
    stroke-width: 560;
    stroke-dasharray: 1 1;
    animation: draw 1.1s cubic-bezier(0.55, 0, 0.25, 1) 0.15s both;
  }

  .orbit {
    transform-origin: 1412px 1417px;
    animation: orbit 1.1s cubic-bezier(0.55, 0, 0.25, 1) 0.15s both;
  }

  .comet {
    animation: comet 1.35s linear 0.1s both;
  }

  .gold {
    animation: cool 0.7s ease 1.25s both;
  }

  .white {
    fill: #fff;
  }

  .wipe {
    animation: wipe 0.6s ease-in-out 0.8s both;
  }

  .pulse {
    fill: none;
    stroke: #f2b544;
    stroke-width: 26;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulse 0.8s ease-out 1.2s forwards;
  }

  .letter {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: rise 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) both;
    animation-delay: calc(1.25s + var(--order) * 70ms);
  }

  .shine {
    animation: shine 0.7s ease-in-out 1.9s both;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes orbit {
    from {
      transform: rotate(-346deg);
    }
    to {
      transform: rotate(0deg);
    }
  }

  @keyframes comet {
    0% {
      opacity: 0;
    }
    12%,
    82% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes cool {
    from {
      fill: #f2b544;
    }
    to {
      fill: #fff;
    }
  }

  @keyframes wipe {
    from {
      transform: translateX(-2900px);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes pulse {
    from {
      opacity: 0.9;
      transform: scale(0.3);
    }
    to {
      opacity: 0;
      transform: scale(4.5);
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(260px) scale(0.8);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes shine {
    from {
      transform: translateX(0) skewX(-18deg);
    }
    to {
      transform: translateX(8800px) skewX(-18deg);
    }
  }

  @keyframes approach {
    from {
      transform: scale(0.96);
    }
    to {
      transform: scale(1.03);
    }
  }

  @keyframes leave {
    to {
      opacity: 0;
    }
  }

  @keyframes skip {
    to {
      opacity: 0;
    }
  }
</style>
