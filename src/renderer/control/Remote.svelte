<script lang="ts">
  import type {
    BibleBook,
    BibleInfo,
    BibleSearchResult,
    BibleVerse,
    MediaItem,
    Shortcut,
    Song,
    SongSummary,
    ThemeAssignment,
  } from '@shared/api';
  import { bookGroup, bookShortName } from '@shared/bible-groups';
  import { verseParts } from '@shared/verse-parts';
  import { initialState, type OnAirState, type OverrideMode, type Slide } from '@shared/state';
  import type { ThemeEntry } from '@shared/theme';
  import { formatRemaining, remainingMs, type TimerConfig, type TimerLayout } from '@shared/timers';
  import Screen from '../operator/Screen.svelte';
  import { connect, type Connection } from './connection';

  type Props = {
    token: string;
    onConnection: (connection: Connection) => void;
    onRejected: () => void;
    onLeave: () => void;
  };
  let { token, onConnection, onRejected, onLeave }: Props = $props();

  type Item = { kind: 'bible' | 'song' | 'media'; key: string; label: string; slide: Slide; part?: number };
  const TABS = [
    { id: 'biblia', label: 'Biblia' },
    { id: 'canciones', label: 'Canciones' },
    { id: 'medios', label: 'Medios' },
    { id: 'atajos', label: 'Atajos' },
    { id: 'tiempo', label: 'Tiempo' },
  ] as const;
  const MODES: { mode: OverrideMode; label: string }[] = [
    { mode: 'wallpaper', label: 'Logo' },
    { mode: 'background', label: 'Fondo' },
    { mode: 'black', label: 'Negro' },
  ];

  let onAir = $state<OnAirState>(initialState);
  let online = $state(false);
  let tab = $state<(typeof TABS)[number]['id']>('biblia');
  let selected = $state<Item | null>(null);
  let airKey = $state<string>();
  let leaving = $state(false);
  let content = $state<HTMLElement>();

  let bibles = $state<BibleInfo[]>([]);
  let version = $state('');
  let books = $state<BibleBook[]>([]);
  let query = $state('');
  let book = $state<BibleBook | null>(null);
  let chapter = $state<number | null>(null);
  let chapterVerseIds = $state<number[]>([]);
  let currentVerseId = $state<number>();
  let currentVersePart = $state(0);
  let verses = $state<BibleVerse[]>([]);

  let songQuery = $state('');
  let songs = $state<SongSummary[]>([]);
  let song = $state<Song | null>(null);
  let slideIndex = $state(-1);

  const verseNavigationIds = $derived(chapterVerseIds.length ? chapterVerseIds : verses.map((verse) => verse.vid));
  const verseNavigationIndex = $derived(currentVerseId === undefined ? -1 : verseNavigationIds.indexOf(currentVerseId));
  const activeVerse = $derived(verses.find((verse) => verse.vid === currentVerseId));
  const activeVerseParts = $derived(activeVerse ? verseParts(activeVerse.text) : []);
  const canGoToPreviousVerse = $derived(currentVersePart > 0 || verseNavigationIndex > 0);
  const canGoToNextVerse = $derived(
    currentVersePart < activeVerseParts.length - 1 ||
      (verseNavigationIds.length > 0 && verseNavigationIndex < verseNavigationIds.length - 1),
  );
  // Lo elegido con un toque que todavía no está al aire: mientras tanto se ve "Al aire" y no las flechas.
  const canSend = $derived(!!selected && !(selected.key === airKey && !!onAir.slide && onAir.mode === 'live'));

  let media = $state<MediaItem[]>([]);
  let shortcuts = $state<Shortcut[]>([]);
  let timers = $state<TimerConfig[]>([]);
  let timerForm = $state<{
    name: string;
    kind: 'duration' | 'clock';
    minutes: number;
    clock: string;
    message: string;
  } | null>(null);
  let timerError = $state('');
  let clockNow = $state(Date.now());
  let themes = $state<ThemeEntry[]>([]);
  let assignment = $state<ThemeAssignment | null>(null);

  const savedRefs = $derived(new Map(shortcuts.map((item) => [item.ref, item.id])));

  async function loadShortcuts() {
    shortcuts = await connection.call<Shortcut[]>('shortcuts.list');
  }

  async function loadTimers() {
    timers = await connection.call<TimerConfig[]>('timers.list');
  }

  const runOf = (timer: TimerConfig) => onAir.timers.find((run) => run.id === String(timer.id));
  const isShown = (timer: TimerConfig, layout: TimerLayout) =>
    onAir.shownTimer?.id === String(timer.id) && onAir.shownTimer.layout === layout;
  const idleLabel = (timer: TimerConfig) =>
    timer.kind === 'clock' ? `Hasta las ${timer.clock}` : formatRemaining(timer.seconds * 1000);

  function newTimer() {
    timerError = '';
    timerForm = { name: '', kind: 'duration', minutes: 5, clock: '19:00', message: '' };
  }

  async function saveTimer() {
    if (!timerForm) return;
    const { name, kind, minutes, clock, message } = timerForm;
    const seconds = Math.round((Number(minutes) || 0) * 60);
    if (!name.trim()) timerError = 'Poné un nombre.';
    else if (kind === 'duration' && seconds <= 0) timerError = 'Poné una duración mayor a cero.';
    else if (kind === 'clock' && !clock) timerError = 'Elegí una hora.';
    else {
      const id = await connection.call<number | null>('timers.save', { name, kind, seconds, clock, message });
      if (id) timerForm = null;
      else timerError = 'No se pudo guardar.';
      await loadTimers();
    }
  }

  async function toggleStar(ref: string) {
    const id = savedRefs.get(ref);
    if (id === undefined) await connection.call('shortcuts.add', ref);
    else await connection.call('shortcuts.remove', id);
    await loadShortcuts();
  }

  // svelte-ignore state_referenced_locally
  const connection = connect(token, {
    onState: (value) => (onAir = value),
    onOnline: (value) => {
      const wasOffline = !online;
      online = value;
      if (value && wasOffline) load();
    },
    onShortcuts: () => loadShortcuts(),
    onTimers: () => loadTimers(),
    onRejected: () => onRejected(),
  });
  $effect(() => onConnection(connection));

  async function load() {
    bibles = await connection.call<BibleInfo[]>('bible.list');
    version ||= bibles[0]?.code ?? '';
    // Lo que se escribió mientras cargaba necesitaba la versión para buscar.
    if (query.trim()) searchBible();
    [themes, assignment, media, shortcuts, songs] = await Promise.all([
      connection.call<ThemeEntry[]>('themes.list'),
      connection.call<ThemeAssignment>('themes.assignment'),
      connection.call<MediaItem[]>('media.list'),
      connection.call<Shortcut[]>('shortcuts.list'),
      connection.call<SongSummary[]>('songs.list', ''),
    ]);
    await loadTimers();
    books = await connection.call<BibleBook[]>('bible.books', version);
  }

  function withTheme(item: Item): Slide {
    if (item.kind === 'media') return item.slide;
    const id = item.kind === 'bible' ? assignment?.bible : assignment?.song;
    return { ...item.slide, theme: themes.find((entry) => entry.id === id)?.theme };
  }

  const DOUBLE_TAP_MS = 350;
  let lastTap = { key: '', at: 0 };

  // Un toque elige; dos seguidos lo mandan al aire.
  function tap(item: Item) {
    const moment = performance.now();
    const twice = lastTap.key === item.key && moment - lastTap.at < DOUBLE_TAP_MS;
    lastTap = { key: item.key, at: twice ? 0 : moment };
    if (twice) sendToAir(item);
    else {
      selected = item;
      if (item.kind === 'bible') {
        currentVerseId = Number(item.key.split(':').at(-1));
        currentVersePart = item.part ?? 0;
      }
    }
  }

  function sendToAir(item: Item) {
    selected = item;
    airKey = item.key;
    if (item.kind === 'bible') {
      currentVerseId = Number(item.key.split(':').at(-1));
      currentVersePart = item.part ?? 0;
    }
    connection.dispatch({ type: 'show-slide', slide: $state.snapshot(withTheme(item)) });
  }

  const verseItem = (verse: BibleVerse, part = 0): Item => ({
    kind: 'bible',
    key: `bible:${version}:${verse.vid}`,
    label: verse.label,
    slide: { body: verseParts(verse.text)[part] ?? verse.text, title: `${verse.label} · ${version}` },
    part,
  });

  const mediaItem = ({ id, kind, name, url, thumb }: MediaItem): Item => ({
    kind: 'media',
    key: `media:${id}`,
    label: name,
    slide: { body: '', title: name, media: { kind, url, thumb, loop: true } },
  });

  function shortcutItem(shortcut: Shortcut): Item | null {
    if (shortcut.kind === 'media' && shortcut.media) return mediaItem(shortcut.media);
    if (shortcut.kind !== 'verse') return null;
    const [, code, vid] = shortcut.ref.split(':');
    const key = `bible:${code}:${vid}`;
    return { kind: 'bible', key, label: shortcut.title, slide: { body: shortcut.text, title: shortcut.title } };
  }

  async function searchBible() {
    const text = query.trim();
    book = null;
    chapter = null;
    if (!text) {
      verses = [];
      chapterVerseIds = [];
      currentVerseId = undefined;
      currentVersePart = 0;
      return;
    }
    const result = await connection.call<BibleSearchResult>('bible.search', version, text);
    if (query.trim() !== text) return;
    const ids =
      result.kind === 'reference' && result.book !== undefined
        ? await connection.call<number[]>('bible.chapter-verse-ids', version, result.book, result.chapter)
        : [];
    if (query.trim() !== text) return;
    verses = result.verses;
    chapterVerseIds = ids;
    currentVerseId = result.kind === 'reference' ? result.verses[0]?.vid : undefined;
    currentVersePart = 0;
  }

  async function openChapter(number: number) {
    chapter = number;
    verses = await connection.call<BibleVerse[]>('bible.chapter', version, book!.book, number);
    chapterVerseIds = verses.map((verse) => verse.vid);
    currentVerseId = undefined;
    currentVersePart = 0;
  }

  async function moveBibleVerse(step: -1 | 1) {
    if (!verseNavigationIds.length) return;
    const fromId = currentVerseId ?? (selected?.kind === 'bible' ? Number(selected.key.split(':').at(-1)) : undefined);
    const fromIndex = fromId === undefined ? -1 : verseNavigationIds.indexOf(fromId);
    const current =
      fromId === undefined
        ? undefined
        : (verses.find((item) => item.vid === fromId) ??
          (await connection.call<BibleVerse | undefined>('bible.verse', version, fromId)));
    const currentParts = current ? verseParts(current.text) : [];
    if (step > 0 && current && currentVersePart < currentParts.length - 1) {
      sendToAir(verseItem(current, currentVersePart + 1));
      return;
    }
    if (step < 0 && current && currentVersePart > 0) {
      sendToAir(verseItem(current, currentVersePart - 1));
      return;
    }

    const vid = verseNavigationIds[fromIndex + step];
    if (vid === undefined || vid === fromId) return;
    const verse =
      verses.find((item) => item.vid === vid) ??
      (await connection.call<BibleVerse | undefined>('bible.verse', version, vid));
    if (!verse) return;
    if (!verses.some((item) => item.vid === vid)) verses = [verse];
    sendToAir(verseItem(verse, step < 0 ? verseParts(verse.text).length - 1 : 0));
  }

  async function changeVersion() {
    books = await connection.call<BibleBook[]>('bible.books', version);
    if (book && chapter) await openChapter(chapter);
    else await searchBible();
  }

  function clearBible() {
    query = '';
    book = null;
    chapter = null;
    verses = [];
    chapterVerseIds = [];
    currentVerseId = undefined;
    currentVersePart = 0;
  }

  // Volver a tocar la pestaña en la que se está lleva al inicio de ese menú.
  function openTab(id: typeof tab) {
    if (tab === id) {
      if (id === 'biblia') clearBible();
      if (id === 'canciones') {
        song = null;
        songQuery = '';
        searchSongs();
      }
      if (id === 'tiempo') timerForm = null;
      content?.scrollTo({ top: 0 });
    }
    tab = id;
  }

  async function searchSongs() {
    songs = await connection.call<SongSummary[]>('songs.list', songQuery);
  }

  async function openSong(id: number) {
    song = await connection.call<Song | null>('songs.get', id);
    slideIndex = -1;
  }

  function showSongSlide(index: number) {
    if (!song || index < 0 || index >= song.slides.length) return;
    slideIndex = index;
    sendToAir({
      kind: 'song',
      key: `song:${song.id}:${index}`,
      label: song.title,
      slide: { body: song.slides[index].text, title: '' },
    });
  }

  async function useShortcut(shortcut: Shortcut) {
    if (justDragged) return;
    const item = shortcutItem(shortcut);
    if (item) {
      tap(item);
    } else if (shortcut.songId) {
      tab = 'canciones';
      await openSong(shortcut.songId);
    }
  }

  $effect(() => {
    if (tab !== 'tiempo' || !onAir.timers.length) return;
    clockNow = connection.now();
    const ticker = setInterval(() => (clockNow = connection.now()), 500);
    return () => clearInterval(ticker);
  });

  const HOLD_MS = 350;
  const MOVE_LIMIT = 10;
  let draggedId = $state<number | null>(null);
  let justDragged = false;

  // Mantener apretado y arrastrar, como en la PC. Se cancela si el dedo se mueve antes de tiempo:
  // ahí lo que quiere hacer es desplazar la lista.
  function reorderable(list: HTMLElement) {
    let hold: ReturnType<typeof setTimeout> | undefined;
    let startY = 0;

    function moveTo(y: number) {
      const rows = [...list.children] as HTMLElement[];
      const target = rows.findIndex((row) => {
        const { top, bottom } = row.getBoundingClientRect();
        return y >= top && y <= bottom;
      });
      const from = shortcuts.findIndex((item) => item.id === draggedId);
      if (target < 0 || target === from) return;
      const next = [...shortcuts];
      next.splice(target, 0, next.splice(from, 1)[0]);
      shortcuts = next;
    }

    function finish() {
      clearTimeout(hold);
      if (draggedId === null) return;
      draggedId = null;
      justDragged = true;
      setTimeout(() => (justDragged = false), 300);
      connection.call(
        'shortcuts.reorder',
        shortcuts.map((item) => item.id),
      );
    }

    function onDown(event: PointerEvent) {
      const row = (event.target as HTMLElement).closest('li');
      if (!row || (event.target as HTMLElement).closest('.star')) return;
      const id = Number(row.dataset.id);
      startY = event.clientY;
      hold = setTimeout(() => {
        draggedId = id;
        navigator.vibrate?.(30);
      }, HOLD_MS);
    }

    function onMove(event: PointerEvent) {
      if (draggedId !== null) moveTo(event.clientY);
      else if (Math.abs(event.clientY - startY) > MOVE_LIMIT) clearTimeout(hold);
    }

    // Una vez agarrado, el dedo mueve la tarjeta y no la lista.
    function onTouchMove(event: TouchEvent) {
      if (draggedId === null) return;
      event.preventDefault();
      moveTo(event.touches[0].clientY);
    }

    const noMenu = (event: Event) => event.preventDefault();
    list.addEventListener('pointerdown', onDown);
    list.addEventListener('pointermove', onMove);
    list.addEventListener('pointerup', finish);
    list.addEventListener('pointercancel', finish);
    list.addEventListener('touchmove', onTouchMove, { passive: false });
    list.addEventListener('touchend', finish);
    list.addEventListener('contextmenu', noMenu);
  }

  const chapters = $derived(Array.from({ length: book?.chapters ?? 0 }, (_, index) => index + 1));
</script>

{#snippet star(ref: string)}
  <button
    class="star"
    class:saved={savedRefs.has(ref)}
    data-estrella={ref}
    aria-label={savedRefs.has(ref) ? 'Quitar de atajos' : 'Guardar en atajos'}
    onclick={() => toggleStar(ref)}
  >
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8L12 4Z" />
    </svg>
  </button>
{/snippet}

<div class="remote">
  <header>
    <div class="screen-row">
      <div class="preview"><Screen id="control-aire" state={onAir} now={connection.now} /></div>
      <div class="modes">
        {#each MODES as { mode, label } (mode)}
          <button
            data-modo={mode}
            class:primary={onAir.mode === mode}
            onclick={() => connection.dispatch({ type: 'toggle-mode', mode })}
          >
            {label}
          </button>
        {/each}
        <button id="control-quitar" onclick={() => connection.dispatch({ type: 'clear' })}>Quitar</button>
      </div>
    </div>
    {#if !online}<p id="control-offline" class="offline">Buscando la PC…</p>{/if}
  </header>

  <main bind:this={content}>
    {#if tab === 'biblia'}
      <div class="search">
        <input
          id="control-buscar"
          type="search"
          placeholder="Cita o palabra"
          bind:value={query}
          oninput={searchBible}
        />
        <select aria-label="Versión" bind:value={version} onchange={changeVersion}>
          {#each bibles as bible (bible.code)}
            <option value={bible.code}>{bible.code}</option>
          {/each}
        </select>
      </div>
      {#if book || query.trim()}
        <button class="back" onclick={clearBible}>‹ Libros</button>
      {/if}
      {#if book && !chapter}
        <h2>{book.name}</h2>
        <div class="grid numbers">
          {#each chapters as number (number)}
            <button onclick={() => openChapter(number)}>{number}</button>
          {/each}
        </div>
      {:else if book || query.trim()}
        {#if book}<h2>{book.name} {chapter}</h2>{/if}
        <ul>
          {#each verses as verse (verse.vid)}
            {@const item = verseItem(verse)}
            <li class="starred">
              <button class="row" class:on={selected?.key === item.key} onclick={() => tap(item)}>
                <small>{verse.label}</small>
                {verse.text}
              </button>
              {@render star(`verse:${version}:${verse.vid}`)}
            </li>
          {/each}
        </ul>
      {:else}
        <div class="grid books">
          {#each books as entry (entry.book)}
            <button style:color={`var(--g-${bookGroup(entry.book)?.id})`} onclick={() => (book = entry)}>
              {bookShortName(entry.book)}
            </button>
          {/each}
        </div>
      {/if}
    {:else if tab === 'canciones'}
      {#if song}
        <button class="back" onclick={() => (song = null)}>‹ Canciones</button>
        <div class="starred heading">
          <h2>{song.title}</h2>
          {@render star(`song:${song.id}`)}
        </div>
        <ul id="control-diapositivas">
          {#each song.slides as slide, index (index)}
            <li>
              <button class="row" class:on={slideIndex === index} onclick={() => showSongSlide(index)}>
                <small>{slide.label}</small>
                <span class="lyrics">{slide.text}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <input type="search" placeholder="Buscar canción" bind:value={songQuery} oninput={searchSongs} />
        {#if songs.length}
          <ul>
            {#each songs as item (item.id)}
              <li>
                <button class="row" onclick={() => openSong(item.id)}>
                  {item.title}
                  <small>{item.author}</small>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No hay canciones.</p>
        {/if}
      {/if}
    {:else if tab === 'medios'}
      {#if media.length}
        <div class="grid photos">
          {#each media as file (file.id)}
            {@const item = mediaItem(file)}
            <div class="starred">
              <button class="photo" class:on={selected?.key === item.key} onclick={() => tap(item)}>
                {#if file.thumb}<img src={file.thumb} alt={file.name} loading="lazy" />{:else}{file.name}{/if}
              </button>
              {@render star(`media:${file.id}`)}
            </div>
          {/each}
        </div>
      {:else}
        <p class="empty">No hay fotos ni videos.</p>
      {/if}
    {:else if tab === 'tiempo'}
      {#if timerForm}
        <div class="timer-form" id="control-temporizador-form">
          <input
            id="control-temporizador-nombre"
            placeholder="Nombre: Comienza el culto"
            maxlength="60"
            bind:value={timerForm.name}
          />
          <div class="kinds">
            <button
              class:primary={timerForm.kind === 'duration'}
              onclick={() => timerForm && (timerForm.kind = 'duration')}
            >
              Temporizador
            </button>
            <button
              id="control-temporizador-hasta"
              class:primary={timerForm.kind === 'clock'}
              onclick={() => timerForm && (timerForm.kind = 'clock')}
            >
              Hasta una hora
            </button>
          </div>
          {#if timerForm.kind === 'duration'}
            <label
              >Minutos <input
                id="control-temporizador-minutos"
                type="number"
                min="0"
                inputmode="decimal"
                bind:value={timerForm.minutes}
              /></label
            >
          {:else}
            <label>Hora <input id="control-temporizador-hora" type="time" bind:value={timerForm.clock} /></label>
          {/if}
          <input placeholder="Mensaje al llegar a cero (opcional)" maxlength="200" bind:value={timerForm.message} />
          {#if timerError}<p class="timer-error">{timerError}</p>{/if}
          <div class="kinds">
            <button onclick={() => (timerForm = null)}>Cancelar</button>
            <button id="control-temporizador-guardar" class="primary" onclick={saveTimer}>Guardar</button>
          </div>
        </div>
      {:else}
        <button id="control-temporizador-nuevo" onclick={newTimer}>+ Nuevo</button>
        {#if timers.length}
          <ul id="control-temporizadores">
            {#each timers as timer (timer.id)}
              {@const run = runOf(timer)}
              <li class="timer">
                <div class="timer-head">
                  <div>
                    <b>{timer.name}</b>
                    <small>{timer.kind === 'clock' ? `Hasta las ${timer.clock}` : 'Temporizador'}</small>
                  </div>
                  <strong>{run ? formatRemaining(remainingMs(run, clockNow)) : idleLabel(timer)}</strong>
                </div>
                <div class="timer-actions">
                  {#if run?.endsAt && timer.kind === 'duration'}
                    <button data-pausar onclick={() => connection.call('timers.pause', timer.id)}>Pausa</button>
                  {:else if !run?.endsAt}
                    <button data-iniciar class="primary" onclick={() => connection.call('timers.start', timer.id)}>
                      {run ? 'Seguir' : 'Iniciar'}
                    </button>
                  {/if}
                  {#if run}
                    <button
                      data-detener
                      onclick={() => connection.dispatch({ type: 'timer-stop', id: String(timer.id) })}
                    >
                      Detener
                    </button>
                  {/if}
                  <button
                    data-completa
                    class:live={isShown(timer, 'full')}
                    onclick={() => connection.call('timers.show', timer.id, 'full')}
                  >
                    Pantalla
                  </button>
                  <button
                    data-esquina
                    class:live={isShown(timer, 'corner')}
                    onclick={() => connection.call('timers.show', timer.id, 'corner')}
                  >
                    Esquina
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">Creá un temporizador o una cuenta atrás hasta una hora.</p>
        {/if}
      {/if}
    {:else if shortcuts.length}
      <p class="hint">Mantené apretado y arrastrá para reordenar.</p>
      <ul id="control-atajos" {@attach reorderable}>
        {#each shortcuts as shortcut, index (shortcut.id)}
          <li class="starred" class:dragged={draggedId === shortcut.id} data-id={shortcut.id}>
            <button class="row" onclick={() => useShortcut(shortcut)}>
              <small>{index + 1} · {shortcut.title}</small>
              {shortcut.text}
            </button>
            {@render star(shortcut.ref)}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Marcá atajos con la estrella.</p>
    {/if}
  </main>

  <footer>
    {#if leaving}
      <p id="control-confirmar" class="confirm">¿Desvincular este celular? Después hay que escribir el PIN de nuevo.</p>
      <div class="stepper">
        <button id="control-salir-no" onclick={() => (leaving = false)}>Cancelar</button>
        <button id="control-salir-si" class="live" onclick={onLeave}>Sí, desvincular</button>
      </div>
    {:else if tab === 'canciones' && song}
      <div class="stepper">
        <button id="control-anterior" disabled={slideIndex <= 0} onclick={() => showSongSlide(slideIndex - 1)}>
          ‹ Anterior
        </button>
        <button
          id="control-siguiente"
          class="live"
          disabled={slideIndex >= song.slides.length - 1}
          onclick={() => showSongSlide(slideIndex + 1)}
        >
          Siguiente ›
        </button>
      </div>
    {:else if tab === 'biblia' && verseNavigationIds.length && !canSend}
      <div class="stepper">
        <button id="control-versiculo-anterior" disabled={!canGoToPreviousVerse} onclick={() => moveBibleVerse(-1)}>
          ‹ Anterior
        </button>
        <button
          id="control-versiculo-siguiente"
          class="live"
          disabled={!canGoToNextVerse}
          onclick={() => moveBibleVerse(1)}
        >
          Siguiente ›
        </button>
      </div>
    {:else}
      <button
        id="control-aire-boton"
        class="live send"
        disabled={!canSend}
        onclick={() => selected && sendToAir(selected)}
      >
        {selected ? `Al aire: ${selected.label}` : 'Un toque elige, dos van al aire'}
      </button>
    {/if}
    <nav>
      {#each TABS as item (item.id)}
        <button id={`control-tab-${item.id}`} class:active={tab === item.id} onclick={() => openTab(item.id)}>
          {item.label}
        </button>
      {/each}
      <button id="control-salir" class="leave" aria-label="Desvincular este celular" onclick={() => (leaving = true)}>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 3v9M6.8 6.8a7.5 7.5 0 1 0 10.4 0" />
        </svg>
      </button>
    </nav>
  </footer>
</div>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    height: 100%;
    margin: 0;
  }

  .remote {
    display: grid;
    touch-action: manipulation;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100dvh;
    background: var(--bg);
  }

  header {
    padding: 8px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  .screen-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px;
    gap: 8px;
  }

  .preview {
    min-width: 0;
  }

  .modes {
    display: grid;
    gap: 4px;
  }

  .modes button {
    padding: 2px;
    font-size: 13px;
  }

  .offline {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--live);
    text-align: center;
  }

  main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    overflow-y: auto;
  }

  .search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
  }

  input,
  select {
    min-height: 42px;
    font-size: 16px;
  }

  h2 {
    margin: 2px 0;
    font-size: 16px;
  }

  .back {
    align-self: start;
    padding: 6px 12px;
  }

  .grid {
    display: grid;
    gap: 6px;
  }

  .books {
    grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
  }

  .books button {
    padding: 11px 2px;
    font-weight: 600;
  }

  .numbers {
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  }

  .numbers button {
    padding: 11px 0;
  }

  .photos {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .starred {
    position: relative;
  }

  #control-atajos {
    user-select: none;
    -webkit-touch-callout: none;
  }

  .dragged {
    z-index: 1;
    opacity: 0.85;
    transform: scale(1.02);
  }

  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    text-align: center;
  }

  .starred .row {
    padding-right: 46px;
  }

  .heading {
    min-height: 40px;
    padding-right: 46px;
  }

  .star {
    position: absolute;
    top: 2px;
    right: 2px;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    color: var(--muted);
    background: transparent;
    border: 0;
  }

  .star svg {
    fill: none;
  }

  .star.saved {
    color: var(--accent);
  }

  .star.saved svg {
    fill: currentColor;
  }

  .starred .photo + .star {
    color: #fff;
    background: rgb(0 0 0 / 0.45);
    border-radius: 50%;
  }

  .starred .photo + .star.saved {
    color: var(--accent);
  }

  .photo {
    width: 100%;
    padding: 0;
    overflow: hidden;
    aspect-ratio: 16 / 9;
  }

  .photo img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo.on,
  .row.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  ul {
    display: grid;
    gap: 6px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .row {
    display: grid;
    gap: 3px;
    width: 100%;
    padding: 10px 12px;
    font-size: 15px;
    line-height: 1.3;
    text-align: left;
  }

  .row small {
    color: var(--accent);
  }

  .lyrics {
    white-space: pre-line;
  }

  .timer {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
  }

  .timer-head {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .timer-head div {
    display: grid;
    min-width: 0;
  }

  .timer-head small {
    color: var(--muted);
  }

  .timer-head strong {
    flex: none;
    font-size: 24px;
    font-variant-numeric: tabular-nums;
  }

  .timer-actions {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 6px;
  }

  .timer-actions button {
    padding: 9px 2px;
    font-size: 13px;
  }

  .timer-form {
    display: grid;
    gap: 8px;
  }

  .timer-form label {
    display: grid;
    gap: 4px;
    color: var(--muted);
  }

  .timer-form input {
    box-sizing: border-box;
    width: 100%;
  }

  .kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .kinds button {
    padding: 11px 4px;
  }

  .timer-error {
    margin: 0;
    color: var(--live);
  }

  .empty {
    color: var(--muted);
    text-align: center;
  }

  footer {
    display: grid;
    gap: 6px;
    padding: 8px 8px calc(6px + env(safe-area-inset-bottom));
    background: var(--surface);
    border-top: 1px solid var(--line);
  }

  .send,
  .stepper button {
    min-height: 52px;
    overflow: hidden;
    font-size: 16px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .confirm {
    margin: 0;
    font-size: 14px;
    text-align: center;
  }

  .stepper {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 6px;
  }

  nav {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr)) 34px;
    gap: 4px;
  }

  nav button {
    padding: 8px 0;
    overflow: hidden;
    font-size: 12px;
    color: var(--muted);
    background: transparent;
    border-color: transparent;
  }

  nav button.active {
    font-weight: 600;
    color: var(--on-accent);
    background: var(--accent);
  }

  /* Celular acostado: la pantalla y los botones a la izquierda, la lista a la derecha con todo el alto. */
  @media (orientation: landscape) and (max-height: 540px) {
    .remote {
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      grid-template-rows: minmax(0, 1fr) auto;
      padding: 0 env(safe-area-inset-right) 0 env(safe-area-inset-left);
    }

    header,
    footer {
      grid-column: 1;
      border: 0;
      border-right: 1px solid var(--line);
    }

    header {
      overflow-y: auto;
    }

    main {
      grid-area: 1 / 2 / 3 / 3;
    }
  }
</style>
