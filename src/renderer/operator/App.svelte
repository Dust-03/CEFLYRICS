<script lang="ts">
  import type { AppInfo, MediaItem, OutputInfo, Shortcut, ThemeAssignment } from '@shared/api';
  import { initialState, type OnAirState, type OverrideMode } from '@shared/state';
  import { FACTORY_THEMES, type ThemeEntry } from '@shared/theme';
  import BiblePanel from './BiblePanel.svelte';
  import Icon from './Icon.svelte';
  import MediaPanel from './MediaPanel.svelte';
  import type { PreviewItem } from './preview-item';
  import Screen from './Screen.svelte';
  import ShortcutsPanel from './ShortcutsPanel.svelte';
  import SongsPanel from './SongsPanel.svelte';
  import Splash from './Splash.svelte';
  import StylesPanel from './StylesPanel.svelte';
  import TimersPanel from './TimersPanel.svelte';
  import TransferPanel from './TransferPanel.svelte';
  import TransmissionPanel from './TransmissionPanel.svelte';

  const api = window.ceflyrics;
  const THEME_KEY = 'cef-theme';
  const MENU = [
    { id: 'biblia', label: 'Biblia', icon: 'bible' },
    { id: 'canciones', label: 'Canciones', icon: 'songs' },
    { id: 'medios', label: 'Medios', icon: 'media' },
    { id: 'atajos', label: 'Atajos', icon: 'star' },
    { id: 'temporizadores', label: 'Temporizadores', icon: 'timer' },
    { id: 'texto', label: 'Texto', icon: 'text' },
    { id: 'transmision', label: 'Transmisión', icon: 'cast' },
    { id: 'configuracion', label: 'Configuración', icon: 'settings' },
  ] as const;

  let info = $state<AppInfo | null>(null);
  let output = $state<OutputInfo | null>(null);
  let onAir = $state<OnAirState>(initialState);
  let tab = $state<(typeof MENU)[number]['id']>('biblia');
  let opened = $state<Record<string, boolean>>({ biblia: true });
  // Cuántas veces se volvió a tocar cada menú estando en él: lo devuelve a su inicio.
  let homes = $state<Record<string, number>>({});
  let settingsTab = $state<'estilos' | 'datos'>('estilos');
  // Sube al importar: Biblia y Canciones se vuelven a armar con lo nuevo.
  let libraryRev = $state(0);
  let preview = $state<PreviewItem | null>(null);
  let onAirKey = $state<string>();
  let body = $state('');
  let title = $state('');
  let theme = $state<'dark' | 'light'>(readTheme());
  let themes = $state<ThemeEntry[]>(FACTORY_THEMES);
  let assignment = $state<ThemeAssignment>({ song: FACTORY_THEMES[0].id, bible: FACTORY_THEMES[0].id });
  let media = $state<MediaItem[]>([]);
  let shortcuts = $state<Shortcut[]>([]);
  let openSongId = $state<number>();
  const savedRefs = $derived(new Set(shortcuts.map((item) => item.ref)));

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

  async function loadShortcuts() {
    shortcuts = await api.shortcuts.list();
  }
  loadShortcuts();
  api.shortcuts.onChange(loadShortcuts);

  async function toggleShortcut(ref: string) {
    const existing = shortcuts.find((item) => item.ref === ref);
    if (existing) await api.shortcuts.remove(existing.id);
    else await api.shortcuts.add(ref);
    await loadShortcuts();
  }

  function shortcutItem(shortcut: Shortcut): PreviewItem | null {
    if (shortcut.kind === 'verse') {
      const [, , vid] = shortcut.ref.split(':');
      return { kind: 'bible', key: `bible:${vid}`, slide: { body: shortcut.text, title: shortcut.title } };
    }
    if (shortcut.kind === 'media' && shortcut.media) {
      const { id, kind, url, thumb, name } = shortcut.media;
      return {
        kind: 'media',
        key: `media:${id}`,
        slide: { body: '', title: name, media: { kind, url, thumb, loop: true } },
      };
    }
    return null;
  }

  // Una canción tiene varias diapositivas: el atajo la abre. Lo demás va a la vista previa.
  function useShortcut(shortcut: Shortcut) {
    const item = shortcutItem(shortcut);
    if (item) {
      showPreview(item);
      return;
    }
    openSongId = undefined;
    openTab('canciones');
    queueMicrotask(() => (openSongId = shortcut.songId));
  }

  function onGlobalKey(event: KeyboardEvent) {
    if (!event.ctrlKey || event.key < '1' || event.key > '9') return;
    const shortcut = shortcuts[Number(event.key) - 1];
    if (!shortcut) return;
    event.preventDefault();
    useShortcut(shortcut);
  }

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

  function openTab(id: typeof tab) {
    if (tab === id) {
      homes[id] = (homes[id] ?? 0) + 1;
      if (id === 'configuracion') settingsTab = 'estilos';
    }
    tab = id;
    opened[id] = true;
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

  // Las vistas toman la forma de la pantalla real: lo que se ve acá corta las líneas igual que allá.
  const outputAspect = $derived(output?.width && output.height ? `${output.width} / ${output.height}` : undefined);
</script>

<svelte:window onkeydown={onGlobalKey} />

<Splash />

<div class="app">
  <nav class="menu" aria-label="Menú principal">
    <h1 class="logo"><span>Ceflyrics</span></h1>
    {#each MENU as item (item.id)}
      <button id={`tab-${item.id}`} class:active={tab === item.id} onclick={() => openTab(item.id)}>
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
        {#key libraryRev}
          <BiblePanel
            home={homes.biblia ?? 0}
            {onAirKey}
            onPreview={showPreview}
            onAir={sendToAir}
            saved={savedRefs}
            onToggleShortcut={toggleShortcut}
          />
        {/key}
      </div>
      <div class="pane" hidden={tab !== 'canciones'}>
        {#if opened.canciones}
          {#key libraryRev}
            <SongsPanel
              home={homes.canciones ?? 0}
              {onAirKey}
              {openSongId}
              onPreview={showPreview}
              onAir={sendToAir}
              saved={savedRefs}
              onToggleShortcut={toggleShortcut}
              onChange={loadShortcuts}
            />
          {/key}
        {/if}
      </div>
      <div class="pane" hidden={tab !== 'medios'}>
        {#if opened.medios}
          <MediaPanel
            home={homes.medios ?? 0}
            {onAirKey}
            onPreview={showPreview}
            onAir={sendToAir}
            onChange={() => {
              loadLibrary();
              loadShortcuts();
            }}
            saved={savedRefs}
            onToggleShortcut={toggleShortcut}
          />
        {/if}
      </div>
      <div class="pane" hidden={tab !== 'atajos'}>
        {#if opened.atajos}
          <ShortcutsPanel
            home={homes.atajos ?? 0}
            {shortcuts}
            {onAirKey}
            onUse={useShortcut}
            onAir={sendToAir}
            toItem={shortcutItem}
            onRemove={(item) => toggleShortcut(item.ref)}
            onReorder={async (ids) => {
              await api.shortcuts.reorder(ids);
              await loadShortcuts();
            }}
          />
        {/if}
      </div>
      <div class="pane" hidden={tab !== 'temporizadores'}>
        {#if opened.temporizadores}
          <TimersPanel
            home={homes.temporizadores ?? 0}
            {onAir}
            active={tab === 'temporizadores'}
            theme={themes.find((entry) => entry.id === assignment.song)?.theme}
          />
        {/if}
      </div>
      <div class="pane settings" hidden={tab !== 'configuracion'}>
        <div class="settings-head">
          <h2>Configuración</h2>
          <div class="settings-tabs">
            <button
              id="config-estilos"
              class:primary={settingsTab === 'estilos'}
              onclick={() => (settingsTab = 'estilos')}
            >
              Estilos y fuentes
            </button>
            <button id="config-datos" class:primary={settingsTab === 'datos'} onclick={() => (settingsTab = 'datos')}>
              Importar y exportar
            </button>
          </div>
        </div>
        {#if opened.configuracion}
          {#if settingsTab === 'estilos'}
            <StylesPanel home={homes.configuracion ?? 0} {themes} {assignment} {media} onChange={loadLibrary} />
          {:else}
            <TransferPanel
              onChange={() => {
                libraryRev++;
                loadShortcuts();
              }}
            />
          {/if}
        {/if}
      </div>
      <div class="pane" hidden={tab !== 'transmision'}>
        {#if opened.transmision}
          <TransmissionPanel />
        {/if}
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
        <Screen
          id="vista-previa"
          aspect={outputAspect}
          state={{ slide: preview ? withTheme(preview) : null, mode: 'live' }}
        />
        <button id="btn-aire" class="live" disabled={!preview} onclick={() => preview && sendToAir(preview)}>
          Al aire
        </button>
      </section>

      <section class="card">
        <h2>Al aire</h2>
        <Screen id="vista-aire" aspect={outputAspect} state={onAir} />
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
        <span>
          <span id="estado-salida">{outputLabel}</span>
          {#if output?.open}<span id="salida-resolucion">{output.width} × {output.height}</span>{/if}
        </span>
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
    grid-template-columns: 100px minmax(0, 1fr);
    height: 100%;
  }

  .menu {
    display: grid;
    grid-template-rows: auto repeat(8, auto) 1fr;
    gap: 4px;
    padding: 10px 8px;
    background: var(--surface);
    border-right: 1px solid var(--line);
  }

  /* Con máscara, el logo toma el color del tema. */
  .logo {
    justify-self: center;
    width: 58px;
    height: 58px;
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

  .settings-head {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }

  .settings-tabs {
    display: flex;
    gap: 6px;
  }

  .settings-tabs button {
    padding: 4px 12px;
    font-size: 13px;
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

  #salida-resolucion {
    display: block;
    font-size: 12px;
  }

  small {
    color: var(--muted);
    text-align: center;
  }
</style>
