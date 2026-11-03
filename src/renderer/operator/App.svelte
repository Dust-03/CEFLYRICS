<script lang="ts">
  import { createRenderer } from '@render-engine/index';
  import type { AppInfo, OutputInfo } from '@shared/api';
  import { initialState, type OnAirState, type OverrideMode } from '@shared/state';

  const api = window.ceflirics;

  let info = $state<AppInfo | null>(null);
  let output = $state<OutputInfo | null>(null);
  let onAir = $state<OnAirState>(initialState);
  let body = $state('');
  let title = $state('');
  let preview = $state<HTMLElement>();

  api.getAppInfo().then((value) => (info = value));
  api.getOutputInfo().then((value) => (output = value));
  api.getState().then((value) => (onAir = value));
  api.onState((value) => (onAir = value));
  api.onOutputInfo((value) => (output = value));

  // La vista de lo que está al aire usa el mismo motor que las salidas.
  $effect(() => {
    if (!preview) return;
    const render = createRenderer(preview);
    $effect(() => render(onAir));
  });

  const MODES: { mode: OverrideMode; label: string }[] = [
    { mode: 'wallpaper', label: 'Wallpaper (F8)' },
    { mode: 'background', label: 'Solo fondo (F9)' },
    { mode: 'black', label: 'Negro (F10)' },
  ];

  function show() {
    api.dispatch({ type: 'show-slide', slide: { body, title } });
  }

  const outputLabel = $derived.by(() => {
    if (!output?.open) return 'Salida cerrada';
    return output.fullscreen ? 'Salida en el segundo monitor' : 'Salida en ventana (sin segundo monitor)';
  });
</script>

<main>
  <header>
    <h1>CEFLIRICS</h1>
    <div class="salida">
      <span id="estado-salida">{outputLabel}</span>
      <button id="btn-salida" onclick={() => api.toggleOutput()}>{output?.open ? 'Cerrar salida' : 'Abrir salida'}</button>
    </div>
  </header>

  <div class="columnas">
    <section>
      <h2>Texto</h2>
      <textarea id="cuerpo" rows="7" placeholder="Texto a proyectar" bind:value={body}></textarea>
      <input id="titulo" type="text" placeholder="Referencia o título" bind:value={title} />
      <div class="botones">
        <button id="btn-mostrar" class="primario" disabled={!body.trim()} onclick={show}>Mostrar</button>
        <button id="btn-limpiar" onclick={() => api.dispatch({ type: 'clear' })}>Quitar (Esc)</button>
      </div>
    </section>

    <section>
      <h2>Al aire</h2>
      <div class="vista"><div id="vista-aire" bind:this={preview}></div></div>
      <div class="botones">
        {#each MODES as { mode, label } (mode)}
          <button class:primario={onAir.mode === mode} onclick={() => api.dispatch({ type: 'toggle-mode', mode })}>
            {label}
          </button>
        {/each}
      </div>
    </section>
  </div>

  {#if info}
    <small>Versión {info.version} · Electron {info.electron}</small>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0e1320;
    color: #e7ebf3;
    font-family: system-ui, 'Segoe UI', sans-serif;
  }

  main {
    display: grid;
    gap: 16px;
    padding: 16px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    letter-spacing: 0.08em;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    color: #8d97ab;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .salida {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: #8d97ab;
  }

  .columnas {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  section {
    display: grid;
    align-content: start;
    gap: 10px;
    padding: 14px;
    background: #161d2d;
    border: 1px solid #2a3552;
    border-radius: 8px;
  }

  textarea,
  input {
    box-sizing: border-box;
    width: 100%;
    padding: 8px 10px;
    font: inherit;
    color: inherit;
    background: #0e1320;
    border: 1px solid #2a3552;
    border-radius: 6px;
    resize: vertical;
  }

  .botones {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  button {
    padding: 7px 12px;
    font: inherit;
    color: inherit;
    background: #1e2740;
    border: 1px solid #2a3552;
    border-radius: 6px;
    cursor: pointer;
  }

  button:hover:enabled {
    border-color: #f2b544;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .primario {
    font-weight: 600;
    color: #1b1405;
    background: #f2b544;
    border-color: #f2b544;
  }

  .vista {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #000;
    border-radius: 6px;
  }

  small {
    color: #8d97ab;
  }
</style>
