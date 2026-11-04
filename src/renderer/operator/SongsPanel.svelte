<script lang="ts">
  import { untrack } from 'svelte';
  import type { Song, SongSummary } from '@shared/api';
  import { labelName, toSongText } from '@shared/song-text';
  import type { PreviewItem } from './preview-item';

  type Props = {
    home: number;
    onAirKey: string | undefined;
    onPreview: (item: PreviewItem) => void;
    onAir: (item: PreviewItem) => void;
    openSongId: number | undefined;
    saved: Set<string>;
    onToggleShortcut: (ref: string) => void;
    onChange: () => void;
  };
  let { home, onAirKey, onPreview, onAir, openSongId, saved, onToggleShortcut, onChange }: Props = $props();

  const api = window.ceflyrics.songs;
  const EXAMPLE =
    'Verso 1\nPrimera estrofa de la canción\n\nCoro\nEl coro va en su propio bloque\n// Nota solo para el retorno';

  let query = $state('');
  let songs = $state<SongSummary[]>([]);
  let song = $state<Song | null>(null);
  let selected = $state(-1);
  let editing = $state(false);
  let confirmDelete = $state(false);
  let form = $state({ id: undefined as number | undefined, title: '', author: '', text: '' });
  let error = $state('');
  let slideList = $state<HTMLElement>();

  let typing: ReturnType<typeof setTimeout> | undefined;

  async function refresh() {
    clearTimeout(typing);
    songs = await api.list(query);
  }
  refresh();

  $effect(() => {
    if (home) untrack(goHome);
  });

  function goHome() {
    // Una letra a medio escribir no se pierde por tocar el menú.
    if (editing) return;
    song = null;
    selected = -1;
    confirmDelete = false;
    query = '';
    refresh();
  }

  function onType() {
    clearTimeout(typing);
    typing = setTimeout(refresh, 90);
  }

  async function open(id: number) {
    song = await api.get(id);
    selected = -1;
    editing = false;
    confirmDelete = false;
  }

  // Un atajo puede pedir abrir una canción desde otro menú.
  $effect(() => {
    if (openSongId) open(openSongId);
  });

  function startNew() {
    form = { id: undefined, title: '', author: '', text: '' };
    song = null;
    error = '';
    editing = true;
  }

  function startEdit() {
    if (!song) return;
    form = { id: song.id, title: song.title, author: song.author, text: toSongText(song.slides) };
    error = '';
    editing = true;
  }

  async function save() {
    try {
      const id = await api.save($state.snapshot(form));
      await refresh();
      await open(id);
      onChange();
    } catch (err) {
      error = (err as Error).message.replace(/^.*Error: /, '');
    }
  }

  async function remove() {
    if (!song) return;
    await api.remove(song.id);
    song = null;
    confirmDelete = false;
    await refresh();
    onChange();
  }

  const toItem = (index: number): PreviewItem => ({
    kind: 'song',
    key: `song:${song!.id}:${index}`,
    slide: { body: song!.slides[index].text, title: '' },
  });

  function select(index: number) {
    selected = index;
    onPreview(toItem(index));
    slideList?.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  function onKey(event: KeyboardEvent) {
    if (!song) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(song.slides.length - 1, Math.max(0, selected + step));
      const followsAir = selected >= 0 && toItem(selected).key === onAirKey;
      select(next);
      if (followsAir) onAir(toItem(next));
    } else if (event.key === 'Enter' && selected >= 0) {
      event.preventDefault();
      onAir(toItem(selected));
    }
  }
</script>

<div class="panel">
  <div class="list">
    <button id="cancion-nueva" class="primary" onclick={startNew}>+ Nueva canción</button>
    <input
      id="cancion-buscar"
      type="search"
      placeholder="Buscar por título o letra"
      bind:value={query}
      oninput={onType}
    />
    <ul>
      {#each songs as item (item.id)}
        <li>
          <button class="song" class:active={item.id === song?.id} onclick={() => open(item.id)}>
            <strong>{item.title}</strong>
            {#if item.author}<small>{item.author}</small>{/if}
          </button>
        </li>
      {:else}
        <li class="empty">{query ? 'No hay canciones con esa búsqueda' : 'Todavía no hay canciones'}</li>
      {/each}
    </ul>
  </div>

  <div class="detail">
    {#if editing}
      <div class="form">
        <h2>{form.id ? 'Editar canción' : 'Nueva canción'}</h2>
        <input id="cancion-titulo" type="text" placeholder="Título" bind:value={form.title} />
        <input id="cancion-autor" type="text" placeholder="Autor (opcional)" bind:value={form.author} />
        <textarea id="cancion-letra" placeholder={EXAMPLE} bind:value={form.text}></textarea>
        <p class="hint">
          Dejá una línea en blanco entre diapositivas. Podés empezar un bloque con Coro, Verso 2 o Puente. Las líneas
          con // solo se ven en el retorno.
        </p>
        {#if error}<p id="cancion-error" class="error">{error}</p>{/if}
        <div class="actions">
          <button id="cancion-guardar" class="primary" onclick={save}>Guardar</button>
          <button onclick={() => (editing = false)}>Cancelar</button>
        </div>
      </div>
    {:else if song}
      <div class="head">
        <div>
          <h3>{song.title}</h3>
          {#if song.author}<small>{song.author}</small>{/if}
        </div>
        <div class="actions">
          <button
            id="cancion-atajo"
            class:primary={saved.has(`song:${song.id}`)}
            onclick={() => onToggleShortcut(`song:${song!.id}`)}
          >
            {saved.has(`song:${song.id}`) ? '★ En atajos' : '☆ Atajo'}
          </button>
          <button id="cancion-editar" onclick={startEdit}>Editar</button>
          {#if confirmDelete}
            <button id="cancion-borrar-si" class="live" onclick={remove}>Sí, borrar</button>
            <button onclick={() => (confirmDelete = false)}>No</button>
          {:else}
            <button id="cancion-borrar" onclick={() => (confirmDelete = true)}>Borrar</button>
          {/if}
        </div>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <ol id="cancion-diapositivas" class="slides" tabindex="0" bind:this={slideList} onkeydown={onKey}>
        {#each song.slides as slide, index (index)}
          <li class:selected={index === selected} class:on-air={toItem(index).key === onAirKey}>
            <button class="slide" onclick={() => select(index)} ondblclick={() => onAir(toItem(index))}>
              <span class="label">{labelName(slide.label)}</span>
              <span class="text">{slide.text}</span>
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <div class="welcome">
        <p>Elegí una canción de la lista, o agregá una nueva pegando la letra.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 14px;
    height: 100%;
    min-height: 0;
  }

  .list {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
  }

  ul,
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  .song {
    display: grid;
    width: 100%;
    padding: 8px 10px;
    text-align: left;
    background: transparent;
    border-color: transparent;
  }

  .song.active {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  small {
    color: var(--muted);
  }

  .empty,
  .welcome {
    padding: 24px 12px;
    color: var(--muted);
    text-align: center;
  }

  .detail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }

  .head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 10px;
  }

  h3 {
    margin: 0;
    font-size: 17px;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .form {
    display: grid;
    grid-row: 1 / -1;
    grid-template-rows: auto auto auto minmax(120px, 1fr) auto auto;
    gap: 8px;
    min-height: 0;
  }

  textarea {
    resize: none;
    line-height: 1.4;
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .error {
    margin: 0;
    color: var(--live);
  }

  .slides {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    align-content: start;
    gap: 8px;
    padding: 2px;
    border-radius: 8px;
  }

  .slide {
    display: grid;
    align-content: start;
    gap: 4px;
    width: 100%;
    height: 100%;
    min-height: 96px;
    padding: 8px 10px;
    text-align: left;
    background: var(--surface-2);
  }

  .label {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }

  .text {
    white-space: pre-line;
    line-height: 1.3;
  }

  li.selected .slide {
    border-color: var(--accent);
  }

  li.on-air .slide {
    border-color: var(--live);
  }

  li.on-air .label {
    color: var(--live);
  }
</style>
