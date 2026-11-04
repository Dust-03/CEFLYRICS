<script lang="ts">
  import type { BibleBook, BibleInfo, BibleVerse } from '@shared/api';
  import { BOOK_GROUPS, bookShortName } from '@shared/bible-groups';
  import type { PreviewItem } from './preview-item';

  type Props = {
    onAirVid: number | undefined;
    onPreview: (item: PreviewItem) => void;
    onAir: (item: PreviewItem) => void;
  };
  let { onAirVid, onPreview, onAir }: Props = $props();

  const api = window.ceflirics.bible;

  let bibles = $state<BibleInfo[]>([]);
  let version = $state('RV1909');
  let books = $state<BibleBook[]>([]);
  let query = $state('');
  let book = $state<number>();
  let chapter = $state<number>();
  let verses = $state<BibleVerse[]>([]);
  let selected = $state(-1);
  let list = $state<HTMLElement>();
  let searchBox = $state<HTMLInputElement>();

  const currentBook = $derived(books.find((item) => item.book === book));
  const chapterNumbers = $derived(Array.from({ length: currentBook?.chapters ?? 0 }, (_, i) => i + 1));
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

  async function refresh(code: string) {
    const run = ++searchRun;
    const text = query.trim();
    if (text) {
      const result = await api.search(code, text);
      if (run !== searchRun) return;
      book = result.book;
      chapter = result.kind === 'reference' ? result.chapter : undefined;
      verses = result.verses;
    } else if (book && chapter) {
      const value = await api.chapter(code, book, chapter);
      if (run === searchRun) verses = value;
    } else {
      verses = [];
    }
    selected = -1;
  }

  function chooseBook(value: number) {
    query = '';
    book = value;
    chapter = undefined;
    verses = [];
    selected = -1;
  }

  async function chooseChapter(value: number) {
    query = '';
    chapter = value;
    await refresh(version);
    list?.focus();
  }

  const toItem = (verse: BibleVerse): PreviewItem => ({
    vid: verse.vid,
    slide: { body: verse.text, title: `${verse.label} · ${version}` },
  });

  function select(index: number) {
    selected = index;
    onPreview(toItem(verses[index]));
    list?.querySelectorAll('li')[index]?.scrollIntoView({ block: 'nearest' });
  }

  function onSearchKey(event: KeyboardEvent) {
    if (event.key !== 'Enter' || !verses.length) return;
    event.preventDefault();
    select(0);
    list?.focus();
  }

  function onListKey(event: KeyboardEvent) {
    if (!verses.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(verses.length - 1, Math.max(0, selected + step));
      // Si lo elegido está al aire, las flechas siguen al aire: así se recorre un pasaje.
      const followsAir = selected >= 0 && verses[selected].vid === onAirVid;
      select(next);
      if (followsAir) onAir(toItem(verses[next]));
    } else if (event.key === 'Enter' && selected >= 0) {
      event.preventDefault();
      onAir(toItem(verses[selected]));
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
      oninput={() => refresh(version)}
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
      {#each BOOK_GROUPS as group (group.id)}
        <section style:--group="var(--g-{group.id})">
          <h3>{group.name}</h3>
          <div class="grid">
            {#each books.filter((item) => item.book >= group.from && item.book <= group.to) as item (item.book)}
              <button
                class="book"
                class:active={item.book === book}
                title={item.name}
                data-book={item.book}
                onclick={() => chooseBook(item.book)}
              >
                {bookShortName(item.book)}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </nav>

    <div class="reader">
      {#if currentBook}
        <div class="chapters">
          <strong>{currentBook.name}</strong>
          <div class="chapter-list">
            {#each chapterNumbers as number (number)}
              <button class:active={number === chapter} data-chapter={number} onclick={() => chooseChapter(number)}>
                {number}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <ol id="biblia-versos" class="verses" tabindex="0" bind:this={list} onkeydown={onListKey}>
        {#each verses as verse, index (verse.vid)}
          <li class:selected={index === selected} class:on-air={verse.vid === onAirVid}>
            <button class="verse" onclick={() => select(index)} ondblclick={() => onAir(toItem(verse))}>
              <span class="label">{verse.label}</span>
              <span>{verse.text}</span>
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
    grid-template-columns: 318px minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }

  .books {
    display: grid;
    align-content: start;
    gap: 6px;
    overflow-y: auto;
    padding-right: 4px;
  }

  h3 {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--group);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 3px;
  }

  .book {
    padding: 2px 0;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--group);
    background: color-mix(in srgb, var(--group) 12%, var(--surface));
    border-color: color-mix(in srgb, var(--group) 30%, var(--surface));
  }

  .book:hover:enabled {
    border-color: var(--group);
  }

  .book.active {
    color: var(--surface);
    background: var(--group);
    border-color: var(--group);
  }

  .reader {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
  }

  .chapters {
    display: grid;
    gap: 6px;
  }

  .chapter-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 92px;
    overflow-y: auto;
  }

  .chapter-list button {
    min-width: 34px;
    padding: 3px 6px;
    font-size: 13px;
  }

  .chapter-list button.active {
    font-weight: 700;
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }

  .verses {
    margin: 0;
    padding: 2px;
    overflow-y: auto;
    list-style: none;
    border-radius: 8px;
  }

  .verse {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 8px 10px;
    font-size: 15px;
    line-height: 1.35;
    text-align: left;
    background: transparent;
    border-color: transparent;
  }

  .label {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
  }

  li.selected .verse {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  li.on-air .verse {
    border-color: var(--live);
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
