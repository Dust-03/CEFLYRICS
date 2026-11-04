<script lang="ts">
  import type {
    BibleBook,
    BibleInfo,
    BibleVerse,
    MediaItem,
    Shortcut,
    Song,
    SongSummary,
    ThemeAssignment,
  } from '@shared/api';
  import { bookGroup, bookShortName } from '@shared/bible-groups';
  import { initialState, type OnAirState, type OverrideMode, type Slide } from '@shared/state';
  import type { ThemeEntry } from '@shared/theme';
  import Screen from '../operator/Screen.svelte';
  import { connect, type Connection } from './connection';

  type Props = {
    token: string;
    onConnection: (connection: Connection) => void;
    onRejected: () => void;
    onLeave: () => void;
  };
  let { token, onConnection, onRejected, onLeave }: Props = $props();

  type Item = { kind: 'bible' | 'song' | 'media'; key: string; label: string; slide: Slide };
  const TABS = [
    { id: 'biblia', label: 'Biblia' },
    { id: 'canciones', label: 'Canciones' },
    { id: 'medios', label: 'Medios' },
    { id: 'atajos', label: 'Atajos' },
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

  let bibles = $state<BibleInfo[]>([]);
  let version = $state('');
  let books = $state<BibleBook[]>([]);
  let query = $state('');
  let book = $state<BibleBook | null>(null);
  let chapter = $state<number | null>(null);
  let verses = $state<BibleVerse[]>([]);

  let songQuery = $state('');
  let songs = $state<SongSummary[]>([]);
  let song = $state<Song | null>(null);
  let slideIndex = $state(-1);

  let media = $state<MediaItem[]>([]);
  let shortcuts = $state<Shortcut[]>([]);
  let themes = $state<ThemeEntry[]>([]);
  let assignment = $state<ThemeAssignment | null>(null);

  // svelte-ignore state_referenced_locally
  const connection = connect(token, {
    onState: (value) => (onAir = value),
    onOnline: (value) => {
      const wasOffline = !online;
      online = value;
      if (value && wasOffline) load();
    },
    onRejected: () => onRejected(),
  });
  $effect(() => onConnection(connection));

  async function load() {
    [bibles, themes, assignment, media, shortcuts, songs] = await Promise.all([
      connection.call<BibleInfo[]>('bible.list'),
      connection.call<ThemeEntry[]>('themes.list'),
      connection.call<ThemeAssignment>('themes.assignment'),
      connection.call<MediaItem[]>('media.list'),
      connection.call<Shortcut[]>('shortcuts.list'),
      connection.call<SongSummary[]>('songs.list', ''),
    ]);
    version ||= bibles[0]?.code ?? '';
    books = await connection.call<BibleBook[]>('bible.books', version);
  }

  function withTheme(item: Item): Slide {
    if (item.kind === 'media') return item.slide;
    const id = item.kind === 'bible' ? assignment?.bible : assignment?.song;
    return { ...item.slide, theme: themes.find((entry) => entry.id === id)?.theme };
  }

  function sendToAir(item: Item) {
    selected = item;
    airKey = item.key;
    connection.dispatch({ type: 'show-slide', slide: $state.snapshot(withTheme(item)) });
  }

  const verseItem = (verse: BibleVerse): Item => ({
    kind: 'bible',
    key: `bible:${verse.vid}`,
    label: verse.label,
    slide: { body: verse.text, title: `${verse.label} · ${version}` },
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
    const key = `bible:${shortcut.ref.split(':')[2]}`;
    return { kind: 'bible', key, label: shortcut.title, slide: { body: shortcut.text, title: shortcut.title } };
  }

  async function searchBible() {
    const text = query.trim();
    book = null;
    chapter = null;
    if (!text) {
      verses = [];
      return;
    }
    const result = await connection.call<{ verses: BibleVerse[] }>('bible.search', version, text);
    if (query.trim() === text) verses = result.verses;
  }

  async function openChapter(number: number) {
    chapter = number;
    verses = await connection.call<BibleVerse[]>('bible.chapter', version, book!.book, number);
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
    const item = shortcutItem(shortcut);
    if (item) {
      selected = item;
    } else if (shortcut.songId) {
      tab = 'canciones';
      await openSong(shortcut.songId);
    }
  }

  const chapters = $derived(Array.from({ length: book?.chapters ?? 0 }, (_, index) => index + 1));
</script>

<div class="remote">
  <header>
    <div class="screen-row">
      <div class="preview"><Screen id="control-aire" state={onAir} /></div>
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

  <main>
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
            <li>
              <button class="row" class:on={selected?.key === item.key} onclick={() => (selected = item)}>
                <small>{verse.label}</small>
                {verse.text}
              </button>
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
        <h2>{song.title}</h2>
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
            <button class="photo" class:on={selected?.key === item.key} onclick={() => (selected = item)}>
              {#if file.thumb}<img src={file.thumb} alt={file.name} loading="lazy" />{:else}{file.name}{/if}
            </button>
          {/each}
        </div>
      {:else}
        <p class="empty">No hay fotos ni videos.</p>
      {/if}
    {:else if shortcuts.length}
      <ul id="control-atajos">
        {#each shortcuts as shortcut, index (shortcut.id)}
          <li>
            <button class="row" onclick={() => useShortcut(shortcut)}>
              <small>{index + 1} · {shortcut.title}</small>
              {shortcut.text}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Marcá atajos con la estrella en la PC.</p>
    {/if}
  </main>

  <footer>
    {#if tab === 'canciones' && song}
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
    {:else}
      <button
        id="control-aire-boton"
        class="live send"
        disabled={!selected || selected.key === airKey}
        onclick={() => selected && sendToAir(selected)}
      >
        {selected ? `Al aire: ${selected.label}` : 'Elegí algo para mandar al aire'}
      </button>
    {/if}
    <nav>
      {#each TABS as item (item.id)}
        <button id={`control-tab-${item.id}`} class:active={tab === item.id} onclick={() => (tab = item.id)}>
          {item.label}
        </button>
      {/each}
      <button id="control-salir" class="leave" aria-label="Desvincular este celular" onclick={onLeave}>
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

  .photo {
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

  .stepper {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 6px;
  }

  nav {
    display: grid;
    grid-template-columns: repeat(4, 1fr) 40px;
    gap: 4px;
  }

  nav button {
    padding: 8px 0;
    font-size: 13px;
    color: var(--muted);
    background: transparent;
    border-color: transparent;
  }

  nav button.active {
    font-weight: 600;
    color: var(--on-accent);
    background: var(--accent);
  }
</style>
