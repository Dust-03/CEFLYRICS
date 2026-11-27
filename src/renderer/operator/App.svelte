<script lang="ts">
  import type { AppInfo, MediaItem, OutputInfo, Shortcut, ThemeAssignment, UpdateCheck } from '@shared/api';
  import { DEFAULT_KEY_BUTTONS, keyActionToAction, keyName, type KeyButton } from '@shared/keys';
  import { initialState, type OnAirState } from '@shared/state';
  import { FACTORY_THEMES, type ThemeEntry } from '@shared/theme';
  import BiblePanel from './BiblePanel.svelte';
  import DataRequest from './DataRequest.svelte';
  import Icon from './Icon.svelte';
  import KeysPanel from './KeysPanel.svelte';
  import MediaPanel from './MediaPanel.svelte';
  import type { PreviewItem } from './preview-item';
  import Screen from './Screen.svelte';
  import ShortcutsPanel from './ShortcutsPanel.svelte';
  import SongsPanel from './SongsPanel.svelte';
  import Splash from './Splash.svelte';
  import StylesPanel from './StylesPanel.svelte';
  import TimersPanel from './TimersPanel.svelte';
  import TitleBar from './TitleBar.svelte';
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
  let updateStatus = $state('');
  let downloading = $state<number | null>(null);

  const UPDATE_MESSAGES: Record<UpdateCheck, string> = {
    available: 'Hay una versión nueva',
    latest: 'Ya tenés la última versión',
    error: 'No se pudo consultar GitHub; revisá internet',
    dev: 'Solo se actualiza la app instalada',
  };

  async function checkUpdates() {
    updateStatus = 'Buscando…';
    updateStatus = UPDATE_MESSAGES[await api.checkUpdates()];
  }
  let output = $state<OutputInfo | null>(null);
  let onAir = $state<OnAirState>(initialState);
  let tab = $state<(typeof MENU)[number]['id']>('biblia');
  let opened = $state<Record<string, boolean>>({ biblia: true });
  // Cuántas veces se volvió a tocar cada menú estando en él: lo devuelve a su inicio.
  let homes = $state<Record<string, number>>({});
  const SETTINGS = [
    { id: 'estilos', label: 'Estilos y fuentes', hint: 'Cómo se ven las letras y la Biblia', icon: 'palette' },
    { id: 'teclas', label: 'Botones de salida', hint: 'Nombre, tecla y qué hace cada uno', icon: 'keys' },
    { id: 'datos', label: 'Importar y exportar', hint: 'Canciones, Biblias y copias de todo', icon: 'transfer' },
  ] as const;
  let settingsTab = $state<(typeof SETTINGS)[number]['id']>('estilos');
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
  // Con llaves: lo que devuelve un aviso se copia de vuelta al puente, y un estado de Svelte no se puede copiar.
  api.onOutputInfo((value) => {
    output = value;
  });
  api.onUpdateProgress((percent) => (downloading = percent));

  async function loadLibrary() {
    [themes, assignment, media] = await Promise.all([api.themes.list(), api.themes.assignment(), api.media.list()]);
  }
  loadLibrary();

  async function loadShortcuts() {
    shortcuts = await api.shortcuts.list();
  }
  loadShortcuts();
  api.shortcuts.onChange(loadShortcuts);

  async function reorderShortcuts(ids: number[]) {
    await api.shortcuts.reorder(ids);
    await loadShortcuts();
  }

  let keyButtons = $state<KeyButton[]>(DEFAULT_KEY_BUTTONS);
  api.keys.get().then((value) => (keyButtons = value));
  api.keys.onChange((value) => {
    keyButtons = value;
  });
  // El primero que quita lo que está al aire conserva el id de siempre.
  const clearIndex = $derived(keyButtons.findIndex((button) => button.action === 'clear'));

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
    api.setTitleBarTheme(theme);
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

  // Lo que muestra la barra al pasar por un atajo: una canción, su primera diapositiva.
  function shortcutSlide(shortcut: Shortcut) {
    const item = shortcutItem(shortcut);
    if (item) return withTheme(item);
    const theme = themes.find((entry) => entry.id === assignment.song)?.theme;
    return { body: shortcut.text, title: shortcut.title, theme };
  }

  function shortcutToAir(shortcut: Shortcut) {
    const item = shortcutItem(shortcut);
    if (item) sendToAir(item);
  }

  function openTab(id: typeof tab) {
    if (tab === id) {
      homes[id] = (homes[id] ?? 0) + 1;
      if (id === 'configuracion') settingsTab = 'estilos';
    }
    tab = id;
    opened[id] = true;
  }

  const outputLabel = $derived.by(() => {
    if (!output?.open) return 'Salida cerrada';
    return output.fullscreen ? 'Salida en el segundo monitor' : 'Salida en ventana';
  });

  // Las vistas toman la forma de la pantalla real: lo que se ve acá corta las líneas igual que allá.
  // Luz de tally, como en una cabina: roja mientras la salida muestra algo.
  const live = $derived(onAir.mode === 'live' ? !!(onAir.slide || onAir.shownTimer) : true);
  const outputAspect = $derived(output?.width && output.height ? `${output.width} / ${output.height}` : undefined);
</script>

<svelte:window onkeydown={onGlobalKey} />

<Splash />
<DataRequest />

<div class="shell">
  <TitleBar
    {shortcuts}
    aspect={outputAspect}
    slideOf={shortcutSlide}
    onUse={useShortcut}
    onAir={shortcutToAir}
    onManage={() => openTab('atajos')}
    onReorder={reorderShortcuts}
  />
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

    <!-- Configuración y Transmisión no proyectan nada: usan todo el ancho, sin los monitores. -->
    <main class:wide={tab === 'configuracion' || tab === 'transmision'}>
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
              onReorder={reorderShortcuts}
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
          <nav class="settings-nav" aria-label="Secciones de Configuración">
            <h2>Configuración</h2>
            {#each SETTINGS as section (section.id)}
              <button
                id="config-{section.id}"
                class:active={settingsTab === section.id}
                aria-current={settingsTab === section.id ? 'page' : undefined}
                onclick={() => (settingsTab = section.id)}
              >
                <Icon name={section.icon} />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.hint}</small>
                </span>
              </button>
            {/each}
            <button id="btn-pantalla-completa" class="fullscreen" onclick={() => api.toggleFullscreen()}>
              <Icon name="fullscreen" />
              <span>Pantalla completa</span>
              <kbd>F11</kbd>
            </button>
          </nav>
          <div class="settings-body">
            {#if opened.configuracion}
              {#if settingsTab === 'estilos'}
                <StylesPanel home={homes.configuracion ?? 0} {themes} {assignment} {media} onChange={loadLibrary} />
              {:else if settingsTab === 'teclas'}
                <KeysPanel buttons={keyButtons} />
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
        <section class="monitor">
          <h2>Vista previa</h2>
          <div class="tally preview" class:lit={!!preview}>
            <Screen
              id="vista-previa"
              aspect={outputAspect}
              state={{ slide: preview ? withTheme(preview) : null, mode: 'live' }}
            />
          </div>
        </section>

        <button id="btn-aire" class="live take" disabled={!preview} onclick={() => preview && sendToAir(preview)}>
          Al aire
        </button>

        <section class="monitor">
          <h2 class:on={live}>Al aire</h2>
          <div class="tally" class:lit={live}>
            <Screen id="vista-aire" aspect={outputAspect} state={onAir} />
          </div>
          <div class="modes">
            {#each keyButtons as button, index (index)}
              <button
                id={index === clearIndex ? 'btn-limpiar' : `btn-modo-${index}`}
                class:primary={onAir.mode === button.action}
                onclick={() => api.dispatch(keyActionToAction(button.action))}
              >
                {button.label}
                {#if button.key}<kbd>{keyName(button.key)}</kbd>{/if}
              </button>
            {/each}
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
          <small class="version">
            Versión {info.version}
            {#if downloading === null}
              ·
              <button id="btn-actualizar" disabled={updateStatus === 'Buscando…'} onclick={checkUpdates}>
                Buscar actualizaciones
              </button>
              {#if updateStatus}<span id="estado-actualizacion">{updateStatus}</span>{/if}
            {:else}
              <span id="descarga-actualizacion">Descargando actualización… {Math.floor(downloading)} %</span>
              <span class="update-bar" role="progressbar" aria-valuenow={Math.floor(downloading)}>
                <span style:width="{downloading}%"></span>
              </span>
            {/if}
          </small>
        {/if}
      </aside>
    </main>
  </div>
</div>

<style>
  /* El menú sube hasta arriba; la barra de atajos queda a su derecha, sobre el trabajo. */
  .shell {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }

  .app {
    display: contents;
  }

  .menu {
    display: grid;
    grid-template-rows: auto repeat(8, auto) 1fr;
    gap: 4px;
    padding: 10px 8px;
    grid-row: 1 / 3;
    grid-column: 1;
    min-height: 0;
    background: var(--surface);
    border-right: 1px solid var(--line);
  }

  /* Con máscara, el logo toma el color del tema. */
  .logo {
    justify-self: center;
    width: 58px;
    height: 58px;
    margin: 2px 0 8px;
    /* Sin barra arriba del menú, la ventana se arrastra desde el logo. */
    -webkit-app-region: drag;
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
    background: var(--surface-2);
  }

  .menu button {
    position: relative;
  }

  .menu button.active {
    font-weight: 650;
    color: var(--text);
    background: var(--surface-2);
  }

  .menu button.active :global(svg) {
    color: var(--accent);
  }

  .menu button.active::before {
    content: '';
    position: absolute;
    inset: 8px auto 8px -8px;
    width: 3px;
    background: var(--accent);
    border-radius: 0 3px 3px 0;
  }

  .menu .theme {
    align-self: end;
    font-size: 17px;
  }

  main {
    grid-row: 2;
    grid-column: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: 12px;
    min-height: 0;
    padding: 12px;
  }

  main.wide {
    grid-template-columns: minmax(0, 1fr);
  }

  main.wide aside {
    display: none;
  }

  .card {
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
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

  .pane:not([hidden]) {
    animation: pane-in 0.18s var(--ease);
  }

  @keyframes pane-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  /* Configuración: un índice a la izquierda que se lee como tal, y la sección elegida a la derecha. */
  .settings {
    display: grid;
    grid-template-columns: 228px minmax(0, 1fr);
    gap: 18px;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    padding-right: 14px;
    border-right: 1px solid var(--line);
  }

  .settings-nav h2 {
    margin: 2px 0 10px 10px;
    font-size: 18px;
  }

  .settings-nav button {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 10px 10px 10px 8px;
    text-align: left;
    color: var(--muted);
    background: transparent;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .settings-nav button:hover:enabled {
    color: var(--text);
    background: var(--surface-2);
  }

  .settings-nav button.active {
    color: var(--text);
    background: var(--surface-2);
    border-left-color: var(--accent);
  }

  .settings-nav button.active :global(svg) {
    color: var(--accent);
  }

  .settings-nav strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }

  .settings-nav small {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.35;
    color: var(--muted);
    text-align: left;
  }

  .settings-nav .fullscreen {
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    margin-top: auto;
  }

  .settings-body {
    min-height: 0;
    overflow-y: auto;
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

  .monitor {
    display: grid;
    gap: 8px;
  }

  /* El marco se enciende verde en la previa y rojo al aire: se ve sin leer nada. */
  .tally {
    padding: 3px;
    border: 2px solid var(--line);
    border-radius: 11px;
    transition: border-color 0.2s var(--ease);
  }

  .tally.lit {
    border-color: var(--live);
  }

  .tally.preview.lit {
    border-color: var(--preview);
  }

  .take {
    padding: 10px;
    font-size: 15px;
  }

  h2.on::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    vertical-align: 1px;
    background: var(--live);
    border-radius: 50%;
    animation: live-pulse 1.6s ease-in-out infinite;
  }

  @keyframes live-pulse {
    50% {
      opacity: 0.35;
    }
  }

  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .modes button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
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

  .version button {
    padding: 0;
    font: inherit;
    color: var(--accent);
    text-decoration: underline;
    background: none;
  }

  .version span {
    display: block;
  }

  .version .update-bar {
    height: 4px;
    margin-top: 6px;
    overflow: hidden;
    background: var(--line);
    border-radius: 999px;
  }

  .update-bar span {
    height: 100%;
    background: var(--accent);
    border-radius: inherit;
    transition: width 0.3s var(--ease);
  }
</style>
