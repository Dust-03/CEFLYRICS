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
  import { TESTAMENTS, bookGroup, bookShortName } from '@shared/bible-groups';
  import { DEFAULT_KEY_BUTTONS, keyActionToAction, type KeyButton } from '@shared/keys';
  import { verseParts } from '@shared/verse-parts';
  import { MAX_MEDIA_FILES } from '@shared/lan';
  import { initialState, type OnAirState, type Slide } from '@shared/state';
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

  let onAir = $state<OnAirState>(initialState);
  // Los mismos botones de salida que la consola, con los nombres que les pusieron ahí.
  let keyButtons = $state<KeyButton[]>(DEFAULT_KEY_BUTTONS);
  const live = $derived(onAir.mode === 'live' ? !!(onAir.slide || onAir.shownTimer) : true);
  let online = $state(false);
  let tab = $state<(typeof TABS)[number]['id'] | 'datos'>('biblia');
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

  async function loadMedia() {
    media = await connection.call<MediaItem[]>('media.list');
  }

  async function loadThemes() {
    [themes, assignment] = await Promise.all([
      connection.call<ThemeEntry[]>('themes.list'),
      connection.call<ThemeAssignment>('themes.assignment'),
    ]);
  }

  // Desde el celular se suben solo fotos y videos; la PC da permiso y los vuelve a revisar.
  let uploadNote = $state('');
  async function uploadFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    if (files.length > MAX_MEDIA_FILES) {
      uploadNote = `Elegí hasta ${MAX_MEDIA_FILES} archivos por vez.`;
      return;
    }
    const videos = files.filter((file) => file.type.startsWith('video/')).length;
    const bytes = files.reduce((total, file) => total + file.size, 0);
    uploadNote = 'Esperando permiso en la PC…';
    const { ticket } = await connection.call<{ ticket?: string }>('data.request', 'media', {
      images: files.length - videos,
      videos,
      bytes,
    });
    if (!ticket) {
      uploadNote = 'La PC no dio permiso.';
      return;
    }
    let added = 0;
    let rejected = 0;
    for (const [index, file] of files.entries()) {
      uploadNote = `Subiendo ${index + 1} de ${files.length}…`;
      try {
        const response = await fetch('/api/medios', {
          method: 'POST',
          headers: { 'X-Ticket': ticket, 'X-File-Name': encodeURIComponent(file.name) },
          body: file,
        });
        const result = response.ok ? ((await response.json()) as { added: number }) : { added: 0 };
        if (result.added) added += 1;
        else rejected += 1;
      } catch {
        rejected += 1;
      }
    }
    uploadNote = [
      added === 1 ? 'Se agregó 1 archivo.' : added ? `Se agregaron ${added} archivos.` : '',
      rejected ? `${rejected} no se pudieron agregar: solo fotos (JPG, PNG, WebP, GIF) y videos (MP4, MOV, WebM).` : '',
    ].join(' ');
    await loadMedia();
  }

  // Exportar o importar todo: la PC tiene que dar permiso, y responde con un pase de un solo uso.
  type DataNote = { tone: 'wait' | 'ok' | 'bad'; text: string };
  let dataNote = $state<DataNote | null>(null);
  let importFile = $state<File | null>(null);
  let dataBusy = $state(false);

  async function askPc(action: 'export' | 'import') {
    dataNote = { tone: 'wait', text: 'Esperando permiso en la PC…' };
    const { ticket } = await connection.call<{ ticket?: string }>('data.request', action);
    if (!ticket) dataNote = { tone: 'bad', text: 'La PC no dio permiso.' };
    return ticket;
  }

  async function exportAll() {
    dataBusy = true;
    try {
      const ticket = await askPc('export');
      if (!ticket) return;
      location.href = `/api/datos/exportar?ticket=${encodeURIComponent(ticket)}`;
      dataNote = { tone: 'ok', text: 'Descargando la copia: queda en la carpeta Descargas del celular.' };
    } finally {
      dataBusy = false;
    }
  }

  function chooseImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    importFile = input.files?.[0] ?? null;
    input.value = '';
    dataNote = null;
  }

  async function importAll() {
    const file = importFile;
    if (!file) return;
    importFile = null;
    dataBusy = true;
    try {
      const ticket = await askPc('import');
      if (!ticket) return;
      dataNote = { tone: 'wait', text: 'Enviando la copia a la PC…' };
      const response = await fetch('/api/datos/importar', {
        method: 'POST',
        headers: { 'X-Ticket': ticket },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) {
        dataNote = { tone: 'bad', text: result.error ?? 'La PC no pudo importar la copia.' };
        return;
      }
      const { songs: s, media: m, themes: t, bibles: b } = result as Record<string, number>;
      const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
      dataNote = {
        tone: 'ok',
        text: `Listo: ${n(s, 'canción', 'canciones')}, ${n(m, 'medio', 'medios')}, ${n(t, 'estilo', 'estilos')} y ${n(b, 'biblia', 'biblias')}. La PC ya tiene los datos nuevos.`,
      };
      await Promise.all([loadMedia(), loadThemes(), loadShortcuts(), loadTimers()]);
    } catch {
      dataNote = { tone: 'bad', text: 'Se cortó la conexión con la PC antes de terminar.' };
    } finally {
      dataBusy = false;
    }
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
    onMedia: () => loadMedia(),
    onThemes: () => loadThemes(),
    onRejected: () => onRejected(),
  });
  $effect(() => onConnection(connection));

  async function load() {
    bibles = await connection.call<BibleInfo[]>('bible.list');
    version ||= bibles[0]?.code ?? '';
    // Lo que se escribió mientras cargaba necesitaba la versión para buscar.
    if (query.trim()) searchBible();
    await loadThemes();
    [media, shortcuts, songs, keyButtons] = await Promise.all([
      connection.call<MediaItem[]>('media.list'),
      connection.call<Shortcut[]>('shortcuts.list'),
      connection.call<SongSummary[]>('songs.list', ''),
      connection.call<KeyButton[]>('keys.list'),
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
      <div class="preview" class:lit={live}><Screen id="control-aire" state={onAir} now={connection.now} /></div>
      <div class="modes">
        {#each keyButtons as button, index (index)}
          <button
            id={button.action === 'clear' ? 'control-quitar' : undefined}
            data-modo={button.action === 'clear' ? undefined : button.action}
            class:primary={onAir.mode === button.action}
            onclick={() => connection.dispatch(keyActionToAction(button.action))}
          >
            {button.label}
          </button>
        {/each}
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
        {#each TESTAMENTS as testament (testament.name)}
          {@const inTestament = books.filter((entry) => entry.book >= testament.from && entry.book <= testament.to)}
          {#if inTestament.length}
            <section>
              <h3>{testament.name}</h3>
              <div class="grid books">
                {#each inTestament as entry (entry.book)}
                  <button
                    class="book"
                    style:--group={`var(--g-${bookGroup(entry.book)?.id})`}
                    onclick={() => (book = entry)}
                  >
                    {bookShortName(entry.book)}
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        {/each}
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
      <label class="upload">
        + Subir fotos o videos
        <input id="control-subir" type="file" accept="image/*,video/*" multiple onchange={uploadFiles} hidden />
      </label>
      {#if uploadNote}<p class="upload-note">{uploadNote}</p>{/if}
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
    {:else if tab === 'datos'}
      <section id="control-datos" class="data">
        <h2>Datos de la PC</h2>
        <p class="hint">
          Cada vez la PC pregunta si da permiso, salvo que elijan "Permitir siempre" para este celular.
        </p>
        <div class="data-card">
          <h3>Importar fotos y videos</h3>
          <p>Suma fotos y videos de este celular a los medios de la PC. No se borra nada.</p>
          <label class="pick-file">
            Elegir fotos o videos…
            <input
              id="control-datos-medios"
              type="file"
              accept="image/*,video/*"
              multiple
              onchange={uploadFiles}
              hidden
            />
          </label>
          {#if uploadNote}<p class="upload-note" role="status">{uploadNote}</p>{/if}
        </div>
        <div class="data-card">
          <h3>Exportar todo</h3>
          <p>
            Baja a este celular una copia de las canciones, medios, estilos, cuentas regresivas, atajos y biblias
            importadas.
          </p>
          <button id="control-exportar" class="primary" disabled={dataBusy} onclick={exportAll}>Exportar todo</button>
        </div>
        <div class="data-card import">
          <h3>Importar todo</h3>
          <p>
            Manda una copia .ceflyrics que <strong>reemplaza</strong> todo lo de la PC. Lo que hay ahora en la PC se pierde.
          </p>
          {#if importFile}
            <p id="control-importar-confirmar" class="confirm">¿Reemplazar todo lo de la PC por {importFile.name}?</p>
            <div class="stepper">
              <button id="control-importar-no" onclick={() => (importFile = null)}>Cancelar</button>
              <button id="control-importar-si" class="live" onclick={importAll}>Sí, importar</button>
            </div>
          {:else}
            <label class="pick-file" class:disabled={dataBusy}>
              Elegir copia…
              <input
                id="control-importar"
                type="file"
                accept=".ceflyrics"
                onchange={chooseImport}
                disabled={dataBusy}
                hidden
              />
            </label>
          {/if}
        </div>
        {#if dataNote}<p id="control-datos-estado" class="data-note {dataNote.tone}" role="status">
            {dataNote.text}
          </p>{/if}
      </section>
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
      <button
        id="control-tab-datos"
        class:active={tab === 'datos'}
        aria-label="Exportar o importar todo"
        onclick={() => openTab('datos')}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M7 20V5M3 9l4-4 4 4M17 4v15M13 15l4 4 4-4" />
        </svg>
      </button>
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

  /* Luz de tally, como en la consola: roja mientras la salida muestra algo. */
  .preview {
    min-width: 0;
    padding: 2px;
    border: 2px solid var(--line);
    border-radius: 10px;
    transition: border-color 0.2s var(--ease);
  }

  .preview.lit {
    border-color: var(--live);
  }

  .modes {
    display: grid;
    grid-auto-rows: minmax(0, 1fr);
    gap: 4px;
  }

  /* Tapas de tecla, como los botones debajo de Al aire. */
  .modes button {
    padding: 2px;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-bottom-width: 3px;
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

  h3 {
    margin: 6px 0 6px;
    font-size: 13px;
    font-weight: 650;
    color: var(--muted);
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

  /* Como en la consola: tarjeta neutra con la franja del color de su grupo. */
  .book {
    position: relative;
    padding: 11px 4px 11px 13px;
    font-weight: 600;
    text-align: left;
    background: var(--surface);
  }

  .book::after {
    position: absolute;
    inset: 6px auto 6px 5px;
    width: 3px;
    content: '';
    background: var(--group);
    border-radius: 2px;
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
    font-family: var(--font-text);
    font-size: 15px;
    line-height: 1.4;
    text-align: left;
  }

  .row small {
    font-family: var(--font-ui);
    font-weight: 600;
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
    border-radius: var(--radius-lg);
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

  .upload {
    display: block;
    margin-bottom: 8px;
    padding: 10px;
    border: 1px dashed var(--muted);
    border-radius: var(--radius);
    text-align: center;
    cursor: pointer;
  }

  .upload-note {
    margin: 0 0 8px;
    color: var(--muted);
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
    grid-template-columns: repeat(5, minmax(min-content, 1fr)) 34px 34px;
    gap: 4px;
  }

  /* En los celulares más angostos las seis pestañas entran enteras achicando un poco la letra. */
  @media (max-width: 360px) {
    nav {
      gap: 2px;
    }

    nav button {
      font-size: 11px;
    }
  }

  /* Datos: misma luz de tally que el aviso de la PC, oro si se lleva algo y rojo si pisa. */
  .data {
    display: grid;
    gap: 10px;
  }

  .data-card {
    --tone: var(--accent);
    display: grid;
    gap: 8px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 3px solid var(--tone);
    border-radius: var(--radius);
  }

  .data-card.import {
    --tone: var(--live);
  }

  .data-card h3 {
    margin: 0;
    font-size: 15px;
    color: var(--tone);
  }

  .data-card p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--muted);
  }

  .data-card strong {
    color: var(--text);
  }

  .data-card .primary,
  .pick-file {
    min-height: 46px;
    font-size: 15px;
  }

  .pick-file {
    display: grid;
    place-items: center;
    font-weight: 600;
    color: var(--tone);
    border: 1px solid var(--tone);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .pick-file.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .data-card .stepper button {
    min-height: 46px;
    font-size: 15px;
  }

  .data-note {
    margin: 0;
    padding: 10px 12px;
    font-size: 14px;
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .data-note.ok {
    color: var(--accent);
  }

  .data-note.bad {
    color: var(--live);
  }

  .data-note.wait {
    color: var(--muted);
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
