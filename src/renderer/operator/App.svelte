<script lang="ts">
  import type { AppInfo, MediaItem, OutputInfo, ThemeAssignment } from '@shared/api';
  import { initialState, type OnAirState, type OverrideMode } from '@shared/state';
  import { FACTORY_THEMES, type ThemeEntry } from '@shared/theme';
  import BiblePanel from './BiblePanel.svelte';
  import Icon from './Icon.svelte';
  import MediaPanel from './MediaPanel.svelte';
  import type { PreviewItem } from './preview-item';
  import Screen from './Screen.svelte';
  import SongsPanel from './SongsPanel.svelte';
  import StylesPanel from './StylesPanel.svelte';
  import TimersPanel from './TimersPanel.svelte';

  const api = window.ceflirics;
  const THEME_KEY = 'cef-theme';
  const MENU = [
    { id: 'biblia', label: 'Biblia', icon: 'bible' },
    { id: 'canciones', label: 'Canciones', icon: 'songs' },
    { id: 'medios', label: 'Medios', icon: 'media' },
    { id: 'temporizadores', label: 'Temporizadores', icon: 'timer' },
    { id: 'texto', label: 'Texto', icon: 'text' },
    { id: 'configuracion', label: 'Configuración', icon: 'settings' },
  ] as const;

  let info = $state<AppInfo | null>(null);
  let output = $state<OutputInfo | null>(null);
  let onAir = $state<OnAirState>(initialState);
  let tab = $state<(typeof MENU)[number]['id']>('biblia');
  let preview = $state<PreviewItem | null>(null);
  let onAirKey = $state<string>();
  let body = $state('');
  let title = $state('');
  let theme = $state<'dark' | 'light'>(readTheme());
  let themes = $state<ThemeEntry[]>(FACTORY_THEMES);
  let assignment = $state<ThemeAssignment>({ song: FACTORY_THEMES[0].id, bible: FACTORY_THEMES[0].id });
  let media = $state<MediaItem[]>([]);

  api.getAppInfo().then((value) => (info = value));
  api.getOutputInfo().then((value) => (output = value));
  api.getState().then((value) => (onAir = value));
  api.onState((value) => {
    onAir = value;
    if (!value.slide) onAirKey = undefined;
  });
  api.onOutputInfo((value) => (output = value));

  async function loadLibrary() {
    [themes, assignment, media] = await Promise.all([api.themes.list(), api.themes.assignment(), api.media.list()]);
  }
  loadLibrary();

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

  // Cada diapositiva sale con el estilo de su tipo. Las fotos y videos no llevan estilo.
  function withTheme(item: PreviewItem) {
    if (item.kind === 'media') return item.slide;
    const id = item.kind === 'bible' ? assignment.bible : assignment.song;
    return { ...item.slide, theme: themes.find((entry) => entry.id === id)?.theme };
  }

  function sendToAir(item: PreviewItem) {
    preview = item;
    onAirKey = item.key;
    api.dispatch({ type: 'show-slide', slide: $state.snapshot(withTheme(item)) });
  }

  const showPreview = (item: PreviewItem) => (preview = item);

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
  <nav class="menu" aria-label="Menú principal">
    <h1 class="logo"><span>CEF</span></h1>
    {#each MENU as item (item.id)}
      <button id={`tab-${item.id}`} class:active={tab === item.id} onclick={() => (tab = item.id)}>
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </button>
    {/each}
    <button
      id="btn-tema"
      class="theme"
      aria-label={theme === 'dark' ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  </nav>

  <main>
    <section class="card work">
      <div class="pane" hidden={tab !== 'biblia'}>
        <BiblePanel {onAirKey} onPreview={showPreview} onAir={sendToAir} />
      </div>
      <div class="pane" hidden={tab !== 'canciones'}>
        <SongsPanel {onAirKey} onPreview={showPreview} onAir={sendToAir} />
      </div>
      <div class="pane" hidden={tab !== 'medios'}>
        <MediaPanel {onAirKey} onPreview={showPreview} onAir={sendToAir} onChange={loadLibrary} />
      </div>
      <div class="pane" hidden={tab !== 'temporizadores'}>
        <TimersPanel {onAir} theme={themes.find((entry) => entry.id === assignment.song)?.theme} />
      </div>
      <div class="pane settings" hidden={tab !== 'configuracion'}>
        <h2>Configuración · Estilos y fuentes</h2>
        <StylesPanel {themes} {assignment} {media} onChange={loadLibrary} />
      </div>
      <div class="pane text-pane" hidden={tab !== 'texto'}>
        <textarea id="cuerpo" rows="8" placeholder="Texto a proyectar" bind:value={body}></textarea>
        <input id="titulo" type="text" placeholder="Referencia o título" bind:value={title} />
        <div>
          <button
            id="btn-mostrar"
            class="primary"
            disabled={!body.trim()}
            onclick={() => showPreview({ kind: 'text', slide: { body, title } })}
          >
            A vista previa
          </button>
        </div>
      </div>
    </section>

    <aside>
      <section class="card">
        <h2>Vista previa</h2>
        <Screen id="vista-previa" state={{ slide: preview ? withTheme(preview) : null, mode: 'live' }} />
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

      <div class="status">
        <span id="estado-salida">{outputLabel}</span>
        <button id="btn-salida" onclick={() => api.toggleOutput()}>
          {output?.open ? 'Cerrar salida' : 'Abrir salida'}
        </button>
      </div>
      {#if info}
        <small>Versión {info.version}</small>
      {/if}
    </aside>
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 98px minmax(0, 1fr);
    height: 100%;
  }

  .menu {
    display: grid;
    grid-template-rows: auto repeat(6, auto) 1fr;
    gap: 4px;
    padding: 10px 8px;
    background: var(--surface);
    border-right: 1px solid var(--line);
  }

  /* Con máscara, el logo toma el color del tema. */
  .logo {
    justify-self: center;
    width: 60px;
    height: 60px;
    margin: 2px 0 8px;
    background: var(--text);
    mask: url('../../../assets/logo-cef.svg') center / contain no-repeat;
  }

  .logo span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .menu button {
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: 9px 2px;
    font-size: 12px;
    color: var(--muted);
    background: transparent;
    border-color: transparent;
  }

  .menu button:hover {
    color: var(--text);
  }

  .menu button.active {
    font-weight: 600;
    color: var(--on-accent);
    background: var(--accent);
  }

  .menu .theme {
    align-self: end;
    font-size: 17px;
  }

  main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: 12px;
    min-height: 0;
    padding: 12px;
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

  .settings {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
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
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
  }

  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .modes button {
    padding: 5px 8px;
    font-size: 13px;
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    color: var(--muted);
  }

  .status button {
    padding: 4px 10px;
    font-size: 13px;
  }

  small {
    color: var(--muted);
    text-align: center;
  }
</style>
