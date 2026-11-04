<script lang="ts">
  import type { AppInfo, OutputInfo } from '@shared/api';
  import { initialState, type OnAirState, type OverrideMode } from '@shared/state';
  import BiblePanel from './BiblePanel.svelte';
  import type { PreviewItem } from './preview-item';
  import Screen from './Screen.svelte';

  const api = window.ceflirics;
  const THEME_KEY = 'cef-theme';

  let info = $state<AppInfo | null>(null);
  let output = $state<OutputInfo | null>(null);
  let onAir = $state<OnAirState>(initialState);
  let tab = $state<'biblia' | 'texto'>('biblia');
  let preview = $state<PreviewItem | null>(null);
  let onAirVid = $state<number>();
  let body = $state('');
  let title = $state('');
  let theme = $state<'dark' | 'light'>(readTheme());

  api.getAppInfo().then((value) => (info = value));
  api.getOutputInfo().then((value) => (output = value));
  api.getState().then((value) => (onAir = value));
  api.onState((value) => {
    onAir = value;
    if (!value.slide) onAirVid = undefined;
  });
  api.onOutputInfo((value) => (output = value));

  function readTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  $effect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Sin almacenamiento el modo dura hasta cerrar la app.
    }
  });

  function sendToAir(item: PreviewItem) {
    preview = item;
    onAirVid = item.vid;
    api.dispatch({ type: 'show-slide', slide: $state.snapshot(item.slide) });
  }

  const MODES: { mode: OverrideMode; label: string }[] = [
    { mode: 'wallpaper', label: 'Wallpaper F8' },
    { mode: 'background', label: 'Fondo F9' },
    { mode: 'black', label: 'Negro F10' },
  ];

  const outputLabel = $derived.by(() => {
    if (!output?.open) return 'Salida cerrada';
    return output.fullscreen ? 'Salida en el segundo monitor' : 'Salida en ventana';
  });
</script>

<div class="app">
  <header>
    <h1>CEFLIRICS</h1>
    <div class="tabs" role="tablist">
      <button id="tab-biblia" role="tab" aria-selected={tab === 'biblia'} onclick={() => (tab = 'biblia')}
        >Biblia</button
      >
      <button id="tab-texto" role="tab" aria-selected={tab === 'texto'} onclick={() => (tab = 'texto')}>Texto</button>
    </div>
    <div class="status">
      <span id="estado-salida">{outputLabel}</span>
      <button id="btn-salida" onclick={() => api.toggleOutput()}
        >{output?.open ? 'Cerrar salida' : 'Abrir salida'}</button
      >
      <button
        id="btn-tema"
        aria-label={theme === 'dark' ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  </header>

  <main>
    <section class="card work">
      <div class="pane" hidden={tab !== 'biblia'}>
        <BiblePanel {onAirVid} onPreview={(item) => (preview = item)} onAir={sendToAir} />
      </div>
      <div class="pane text-pane" hidden={tab !== 'texto'}>
        <textarea id="cuerpo" rows="8" placeholder="Texto a proyectar" bind:value={body}></textarea>
        <input id="titulo" type="text" placeholder="Referencia o título" bind:value={title} />
        <div>
          <button
            id="btn-mostrar"
            class="primary"
            disabled={!body.trim()}
            onclick={() => (preview = { slide: { body, title } })}
          >
            A vista previa
          </button>
        </div>
      </div>
    </section>

    <aside>
      <section class="card">
        <h2>Vista previa</h2>
        <Screen id="vista-previa" state={{ slide: preview?.slide ?? null, mode: 'live' }} />
        <button id="btn-aire" class="live" disabled={!preview} onclick={() => preview && sendToAir(preview)}>
          Al aire
        </button>
      </section>

      <section class="card">
        <h2>Al aire</h2>
        <Screen id="vista-aire" state={onAir} />
        <div class="modes">
          {#each MODES as { mode, label } (mode)}
            <button class:primary={onAir.mode === mode} onclick={() => api.dispatch({ type: 'toggle-mode', mode })}>
              {label}
            </button>
          {/each}
          <button id="btn-limpiar" onclick={() => api.dispatch({ type: 'clear' })}>Quitar Esc</button>
        </div>
      </section>

      {#if info}
        <small>Versión {info.version} · Electron {info.electron}</small>
      {/if}
    </aside>
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    padding: 12px;
  }

  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 16px;
  }

  h1 {
    margin: 0;
    font-size: 17px;
    letter-spacing: 0.08em;
  }

  .tabs {
    display: flex;
    gap: 4px;
  }

  .tabs button {
    background: transparent;
    border-color: transparent;
    color: var(--muted);
  }

  .tabs button[aria-selected='true'] {
    font-weight: 600;
    color: var(--text);
    background: var(--surface-2);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 13px;
  }

  main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 12px;
    min-height: 0;
  }

  .card {
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
  }

  .work {
    align-content: stretch;
    min-height: 0;
  }

  .pane {
    min-height: 0;
  }

  .pane[hidden] {
    display: none;
  }

  .text-pane {
    display: grid;
    align-content: start;
    gap: 10px;
  }

  textarea {
    resize: vertical;
  }

  aside {
    display: grid;
    align-content: start;
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
  }

  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .modes button {
    padding: 6px 8px;
    font-size: 13px;
  }

  small {
    color: var(--muted);
    text-align: center;
  }
</style>
