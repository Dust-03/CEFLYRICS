<script lang="ts">
  import { untrack } from 'svelte';
  import type { BibleBook, BibleInfo, BibleVerse } from '@shared/api';
  import { TESTAMENTS, bookGroup } from '@shared/bible-groups';
  import { verseParts } from '@shared/verse-parts';
  import type { PreviewItem } from './preview-item';

  type Props = {
    // Sube cada vez que se vuelve a tocar el menú: hay que volver al inicio.
    home: number;
    onAirKey: string | undefined;
    onPreview: (item: PreviewItem) => void;
    onAir: (item: PreviewItem) => void;
    saved: Set<string>;
    onToggleShortcut: (ref: string) => void;
  };
  let { home, onAirKey, onPreview, onAir, saved, onToggleShortcut }: Props = $props();

  const api = window.ceflyrics.bible;
  const SEARCH_DELAY_MS = 90;

  let bibles = $state<BibleInfo[]>([]);
  let version = $state('RV1909');
  let books = $state<BibleBook[]>([]);
  let query = $state('');
  let book = $state<number>();
  let chapter = $state<number>();
  let chapterVerseIds = $state<number[]>([]);
  let currentVerseId = $state<number>();
  let currentVersePart = $state(0);
  // Con un capítulo ya abierto, el operador puede volver a la grilla de capítulos.
  let pickingChapter = $state(false);
  let verses = $state<BibleVerse[]>([]);
  let selected = $state(-1);
  let list = $state<HTMLElement>();
  let searchBox = $state<HTMLInputElement>();

  const currentBook = $derived(books.find((item) => item.book === book));
  const chapterNumbers = $derived(Array.from({ length: currentBook?.chapters ?? 0 }, (_, i) => i + 1));
  const navigationIds = $derived(chapterVerseIds.length ? chapterVerseIds : verses.map((verse) => verse.vid));
  const navigationIndex = $derived(currentVerseId === undefined ? -1 : navigationIds.indexOf(currentVerseId));
  const activeVerse = $derived(verses.find((verse) => verse.vid === currentVerseId));
  const activeParts = $derived(activeVerse ? verseParts(activeVerse.text) : []);
  const canGoPrevious = $derived(currentVersePart > 0 || navigationIndex > 0);
  const canGoNext = $derived(
    currentVersePart < activeParts.length - 1 ||
      (navigationIds.length > 0 && navigationIndex < navigationIds.length - 1),
  );
  const emptyMessage = $derived(
    query.trim() ? `No se encontró «${query.trim()}» en ${version}` : 'Elegí un libro o escribí una cita o una palabra',
  );

  api.list().then((value) => (bibles = value));

  // Cambiar de versión repite lo que se estaba viendo.
  let searchRun = 0;
  $effect(() => {
    const code = version;
    api.books(code).then((value) => (books = value));
    refresh(code);
  });

  let typing: ReturnType<typeof setTimeout> | undefined;

  function onType() {
    clearTimeout(typing);
    typing = setTimeout(() => refresh(version), SEARCH_DELAY_MS);
  }

  async function refresh(code: string) {
    clearTimeout(typing);
    const run = ++searchRun;
    const text = query.trim();
    if (text) {
      const result = await api.search(code, text);
      if (run !== searchRun) return;
      book = result.book;
      chapter = result.kind === 'reference' ? result.chapter : undefined;
      chapterVerseIds =
        result.kind === 'reference' && result.book !== undefined
          ? await api.chapterVerseIds(code, result.book, result.chapter)
          : [];
      if (run !== searchRun) return;
      verses = result.verses;
      currentVerseId = result.kind === 'reference' ? result.verses[0]?.vid : undefined;
      currentVersePart = 0;
    } else if (book && chapter) {
      const value = await api.chapter(code, book, chapter);
      if (run === searchRun) {
        chapterVerseIds = value.map((verse) => verse.vid);
        verses = value;
        currentVerseId = undefined;
        currentVersePart = 0;
      }
    } else {
      chapterVerseIds = [];
      verses = [];
      currentVerseId = undefined;
      currentVersePart = 0;
    }
    selected = -1;
  }

  $effect(() => {
    if (home) untrack(goHome);
  });

  function goHome() {
    searchRun++;
    query = '';
    book = undefined;
    chapter = undefined;
    pickingChapter = false;
    chapterVerseIds = [];
    currentVerseId = undefined;
    currentVersePart = 0;
    verses = [];
    selected = -1;
    searchBox?.focus();
  }

  function chooseBook(value: number) {
    query = '';
    book = value;
    chapter = undefined;
    pickingChapter = false;
    chapterVerseIds = [];
    currentVerseId = undefined;
    currentVersePart = 0;
    verses = [];
    selected = -1;
  }

  async function chooseChapter(value: number) {
    query = '';
    chapter = value;
    pickingChapter = false;
    await refresh(version);
    list?.focus();
  }

  async function chooseVerse(vid: number) {
    clearTimeout(typing);
    const run = ++searchRun;
    const code = version;
    const verse = await api.verse(code, vid);
    if (run !== searchRun || code !== version) return;
    if (!verse) return;
    verses = [verse];
    showVerse(verse, 0);
    list?.focus();
  }

  async function navigateVerse(step: -1 | 1) {
    if (!navigationIds.length) return;
    clearTimeout(typing);
    const fromId = currentVerseId ?? (selected >= 0 ? verses[selected]?.vid : undefined);
    const fromIndex = fromId === undefined ? -1 : navigationIds.indexOf(fromId);
    const followsAir = fromId !== undefined && onAirKey === `bible:${fromId}`;
    const run = ++searchRun;
    const current =
      fromId === undefined
        ? undefined
        : (verses.find((verse) => verse.vid === fromId) ?? (await api.verse(version, fromId)));
    if (run !== searchRun) return;
    const currentParts = current ? verseParts(current.text) : [];

    if (step > 0 && current && currentVersePart < currentParts.length - 1) {
      showVerse(current, currentVersePart + 1);
      if (followsAir) onAir(toItem(current, currentVersePart));
      return;
    }
    if (step < 0 && current && currentVersePart > 0) {
      showVerse(current, currentVersePart - 1);
      if (followsAir) onAir(toItem(current, currentVersePart));
      return;
    }

    const nextIndex = fromIndex + step;
    const vid = navigationIds[nextIndex];
    if (vid === undefined || vid === fromId) return;
    const visibleIndex = verses.findIndex((verse) => verse.vid === vid);
    const verse = visibleIndex >= 0 ? verses[visibleIndex] : await api.verse(version, vid);
    if (run !== searchRun || !verse) return;
    if (visibleIndex < 0) verses = [verse];
    const part = step < 0 ? verseParts(verse.text).length - 1 : 0;
    showVerse(verse, part);
    if (followsAir) onAir(toItem(verse, part));
    list?.focus();
  }

  const toItem = (verse: BibleVerse, part = 0): PreviewItem => ({
    kind: 'bible',
    key: `bible:${verse.vid}`,
    slide: { body: verseParts(verse.text)[part] ?? verse.text, title: `${verse.label} · ${version}` },
  });

  function showVerse(verse: BibleVerse, part: number) {
    selected = verses.findIndex((item) => item.vid === verse.vid);
    currentVerseId = verse.vid;
    currentVersePart = part;
    onPreview(toItem(verse, part));
    if (selected >= 0) list?.querySelectorAll('li')[selected]?.scrollIntoView({ block: 'nearest' });
  }

  function select(index: number) {
    showVerse(verses[index], 0);
  }

  async function onSearchKey(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await refresh(version);
    if (!verses.length) return;
    select(0);
    list?.focus();
  }

  function onListKey(event: KeyboardEvent) {
    if (!verses.length) return;
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowLeft'
    ) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      void navigateVerse(step);
    } else if (event.key === 'Enter' && selected >= 0) {
      event.preventDefault();
      onAir(toItem(verses[selected], currentVersePart));
    }
  }

  export function focusSearch() {
    searchBox?.focus();
    searchBox?.select();
  }
</script>

<div class="panel">
  <div class="search">
    <input
      id="biblia-buscar"
      type="search"
      placeholder="Cita o palabra: jn 3 16, amor…"
      bind:this={searchBox}
      bind:value={query}
      oninput={onType}
      onkeydown={onSearchKey}
    />
    <select id="biblia-version" aria-label="Versión" bind:value={version}>
      {#each bibles as bible (bible.code)}
        <option value={bible.code}>{bible.code}</option>
      {/each}
    </select>
  </div>

  <div class="body">
    <nav class="books" aria-label="Libros">
      {#each TESTAMENTS as testament (testament.name)}
        <section>
          <h3>{testament.name}</h3>
          <div class="grid">
            {#each books.filter((item) => item.book >= testament.from && item.book <= testament.to) as item (item.book)}
              {@const group = bookGroup(item.book)}
              <button
                class="book"
                class:active={item.book === book}
                class:long={item.name.length > 12}
                style:--group="var(--g-{group.id})"
                title={`${item.name} · ${group.name}`}
                data-book={item.book}
                onclick={() => chooseBook(item.book)}
              >
                <!-- El número no se separa del nombre: "1 Tesalonicenses" no se parte en dos renglones. -->
                {item.name.replace(/^(d) /, '$1 ')}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </nav>

    <div class="reader">
      {#if currentBook}
        {@const showChapters = !chapter || pickingChapter}
        <div class="picker">
          <div class="picker-head">
            <span class="ref"
              >{currentBook.name}{#if chapter}<span class="ref-chapter">{chapter}</span>{/if}</span
            >
            {#if !chapter}
              <span class="step">Elegí el capítulo</span>
            {:else}
              {#if verses.length === 1 && !pickingChapter}
                <button class="link" onclick={() => chooseChapter(chapter!)}>Todo el capítulo</button>
              {/if}
              <button class="link" aria-expanded={pickingChapter} onclick={() => (pickingChapter = !pickingChapter)}>
                {pickingChapter ? 'Volver a los versículos' : 'Otro capítulo'}
              </button>
            {/if}
          </div>
          {#if showChapters}
            <div class="tiles" class:roomy={verses.length === 0} role="group" aria-label="Capítulos">
              {#each chapterNumbers as number (number)}
                <button class:active={number === chapter} data-chapter={number} onclick={() => chooseChapter(number)}>
                  {number}
                </button>
              {/each}
            </div>
          {:else if chapterVerseIds.length > 0}
            <div class="tiles" role="group" aria-label="Versículos">
              {#each chapterVerseIds as vid (vid)}
                {@const number = vid % 1000}
                <button
                  class:active={verses.length === 1 && verses[0].vid === vid}
                  aria-label={`Versículo ${number}`}
                  aria-pressed={verses.length === 1 && verses[0].vid === vid}
                  data-verse-number={number}
                  onclick={() => chooseVerse(vid)}
                >
                  {number}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if navigationIds.length > 0}
        <div class="verse-navigation" aria-label="Navegar versículos">
          <button
            id="biblia-anterior"
            aria-label="Versículo anterior"
            title="Anterior (←)"
            disabled={!canGoPrevious}
            onclick={() => navigateVerse(-1)}
          >
            ←
          </button>
          <button
            id="biblia-siguiente"
            aria-label="Versículo siguiente"
            title="Siguiente (→)"
            disabled={!canGoNext}
            onclick={() => navigateVerse(1)}
          >
            →
          </button>
        </div>
      {/if}

      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <ol id="biblia-versos" class="verses" tabindex="0" bind:this={list} onkeydown={onListKey}>
        {#each verses as verse, index (verse.vid)}
          {@const ref = `verse:${version}:${verse.vid}`}
          <li class:selected={index === selected} class:on-air={`bible:${verse.vid}` === onAirKey}>
            <button class="verse" onclick={() => select(index)} ondblclick={() => onAir(toItem(verse))}>
              <span class="label">{verse.label}</span>
              <span>{verse.text}</span>
            </button>
            <button
              class="star"
              class:on={saved.has(ref)}
              data-atajo={verse.label}
              aria-label={saved.has(ref) ? 'Quitar de atajos' : 'Guardar en atajos'}
              title={saved.has(ref) ? 'Quitar de atajos' : 'Guardar en atajos'}
              onclick={() => onToggleShortcut(ref)}
            >
              {saved.has(ref) ? '★' : '☆'}
            </button>
          </li>
        {:else}
          <li class="empty">{emptyMessage}</li>
        {/each}
      </ol>
    </div>
  </div>
</div>

<style>
  .panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .search input {
    padding: 10px 12px;
    font-size: 16px;
  }

  .body {
    display: grid;
    grid-template-columns: 460px minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }

  .books {
    display: grid;
    align-content: start;
    gap: 12px;
    overflow-y: auto;
    padding-right: 4px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 650;
    color: var(--muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3px;
  }

  /* Fichas neutras con el nombre entero: el grupo se lee en el filo de la izquierda,
     como la pestaña de un índice; solo el libro elegido va lleno. */
  .book {
    position: relative;
    min-height: 27px;
    padding: 3px 4px 3px 11px;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: var(--surface);
    border-radius: var(--radius-sm);
  }

  /* Los nombres largos se achican un poco y, si hace falta, van en dos renglones. */
  .book.long {
    padding-block: 1px;
    font-size: 11.5px;
    line-height: 1.05;
    white-space: normal;
  }

  .book::after {
    content: '';
    position: absolute;
    inset: 4px auto 4px 4px;
    width: 3px;
    background: var(--group);
    border-radius: 2px;
  }

  .book:hover:enabled {
    border-color: var(--group);
  }

  .book.active {
    color: var(--bg);
    background: var(--group);
    border-color: var(--group);
  }

  .book.active::after {
    background: currentColor;
    opacity: 0.5;
  }

  .reader {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
  }

  .verse-navigation {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .verse-navigation button {
    min-width: 34px;
    padding: 3px 8px;
    font-size: 16px;
  }

  .picker {
    display: grid;
    gap: 8px;
  }

  .picker-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-height: 30px;
  }

  /* La referencia en la letra de la Biblia: es lo que el operador está buscando. */
  .ref {
    margin-right: auto;
    font-family: var(--font-text);
    font-size: 20px;
    font-weight: 600;
  }

  .ref-chapter {
    margin-left: 0.3em;
    color: var(--accent);
  }

  .step {
    color: var(--muted);
  }

  .link {
    padding: 4px 2px;
    font-size: 13px;
    color: var(--muted);
    background: transparent;
    border: 0;
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
  }

  .link:hover:enabled {
    color: var(--text);
    text-decoration-color: var(--accent);
  }

  /* Números grandes y parejos, fáciles de acertar con el mouse o en una pantalla táctil. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
    grid-auto-rows: 36px;
    gap: 4px;
    max-height: 160px;
    padding: 2px;
    overflow-y: auto;
    scroll-snap-type: y proximity;
    scroll-padding: 2px;
  }

  .tiles.roomy {
    max-height: min(52vh, 420px);
  }

  .tiles button {
    padding: 0;
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    background: var(--surface);
    border-radius: var(--radius-sm);
    scroll-snap-align: start;
  }

  .tiles button.active {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }

  .verses {
    margin: 0;
    padding: 2px;
    overflow-y: auto;
    list-style: none;
    border-radius: var(--radius);
  }

  /* El navegador no dibuja los resultados que están fuera de la vista. */
  .verses li {
    position: relative;
    content-visibility: auto;
    contain-intrinsic-size: auto 64px;
  }

  .verse {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 8px 34px 8px 12px;
    font-family: var(--font-text);
    font-size: 15.5px;
    line-height: 1.5;
    text-align: left;
    background: transparent;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .label {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 650;
    color: var(--muted);
  }

  .star {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 16px;
    line-height: 1;
    color: var(--muted);
    background: transparent;
    border-color: transparent;
  }

  .star.on {
    color: var(--accent);
  }

  /* Regla dorada a la izquierda: el versículo elegido; roja si además está al aire. */
  li.selected .verse {
    background: var(--surface-2);
    border-left-color: var(--accent);
  }

  li.on-air .verse {
    border-left-color: var(--live);
  }

  li.on-air .label {
    color: var(--live);
  }

  .empty {
    padding: 24px 12px;
    color: var(--muted);
    text-align: center;
  }
</style>
