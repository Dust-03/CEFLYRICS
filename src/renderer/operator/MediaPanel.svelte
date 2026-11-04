<script lang="ts">
  import { untrack } from 'svelte';
  import type { MediaItem } from '@shared/api';
  import type { PreviewItem } from './preview-item';

  type Props = {
    home: number;
    onAirKey: string | undefined;
    onPreview: (item: PreviewItem) => void;
    onAir: (item: PreviewItem) => void;
    onChange: () => void;
    saved: Set<string>;
    onToggleShortcut: (ref: string) => void;
  };
  let { home, onAirKey, onPreview, onAir, onChange, saved, onToggleShortcut }: Props = $props();

  const api = window.ceflirics.media;
  const FILTERS = [
    { id: 'all', label: 'Todo' },
    { id: 'image', label: 'Fotos' },
    { id: 'video', label: 'Videos' },
  ] as const;

  let items = $state<MediaItem[]>([]);
  let filter = $state<'all' | 'image' | 'video'>('all');
  let selected = $state<MediaItem | null>(null);
  let loop = $state(true);
  let confirmDelete = $state(false);
  let message = $state('');

  $effect(() => {
    if (home) untrack(goHome);
  });

  function goHome() {
    filter = 'all';
    selected = null;
    confirmDelete = false;
  }

  const visible = $derived(items.filter((item) => filter === 'all' || item.kind === filter));

  async function refresh() {
    items = await api.list();
  }
  refresh();

  async function add() {
    const { added, rejected } = await api.add();
    await refresh();
    onChange();
    const parts = [];
    if (added) parts.push(added === 1 ? 'Se agregó 1 archivo' : `Se agregaron ${added} archivos`);
    if (rejected.length) parts.push(`Formato no compatible: ${rejected.join(', ')}`);
    message = parts.join('. ');
  }

  const toItem = (item: MediaItem): PreviewItem => ({
    kind: 'media',
    key: `media:${item.id}`,
    slide: { body: '', title: item.name, media: { kind: item.kind, url: item.url, thumb: item.thumb, loop } },
  });

  function select(item: MediaItem) {
    selected = item;
    confirmDelete = false;
    onPreview(toItem(item));
  }

  async function remove() {
    if (!selected) return;
    await api.remove(selected.id);
    selected = null;
    confirmDelete = false;
    await refresh();
    onChange();
  }
</script>

<div class="panel">
  <div class="toolbar">
    <button id="medio-agregar" class="primary" onclick={add}>+ Agregar fotos y videos</button>
    <div class="filters" role="group" aria-label="Filtrar">
      {#each FILTERS as item (item.id)}
        <button class:active={filter === item.id} onclick={() => (filter = item.id)}>{item.label}</button>
      {/each}
    </div>
    <label><input id="medio-repetir" type="checkbox" bind:checked={loop} /> Repetir videos</label>
    {#if selected}
      {@const ref = `media:${selected.id}`}
      <button id="medio-atajo" class:primary={saved.has(ref)} onclick={() => onToggleShortcut(ref)}>
        {saved.has(ref) ? '★ En atajos' : '☆ Atajo'}
      </button>
      {#if confirmDelete}
        <button id="medio-borrar-si" class="live" onclick={remove}>Sí, borrar</button>
        <button onclick={() => (confirmDelete = false)}>No</button>
      {:else}
        <button id="medio-borrar" onclick={() => (confirmDelete = true)}>Borrar</button>
      {/if}
    {/if}
  </div>
  {#if message}<p id="medio-mensaje" class="message">{message}</p>{/if}

  <div class="grid" id="medios">
    {#each visible as item (item.id)}
      <button
        class="item"
        class:selected={item.id === selected?.id}
        class:on-air={`media:${item.id}` === onAirKey}
        title={item.name}
        onclick={() => select(item)}
        ondblclick={() => onAir(toItem(item))}
      >
        {#if item.thumb || item.kind === 'image'}
          <img src={item.thumb ?? item.url} alt="" loading="lazy" decoding="async" />
        {:else}
          <video src={`${item.url}#t=1`} preload="metadata" muted></video>
        {/if}
        {#if item.kind === 'video'}<span class="badge">Video</span>{/if}
        <span class="name">{item.name}</span>
      </button>
    {:else}
      <p class="empty">
        {items.length ? 'No hay archivos de este tipo.' : 'Agregá fotos y videos para proyectarlos o usarlos de fondo.'}
      </p>
    {/each}
  </div>
</div>

<style>
  .panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .filters {
    display: flex;
    gap: 2px;
  }

  .filters button {
    background: transparent;
    border-color: transparent;
    color: var(--muted);
  }

  .filters button.active {
    font-weight: 600;
    color: var(--text);
    background: var(--surface-2);
  }

  label {
    color: var(--muted);
  }

  .message {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    align-content: start;
    gap: 10px;
    overflow-y: auto;
    padding: 2px;
  }

  .item {
    position: relative;
    display: grid;
    gap: 4px;
    padding: 5px;
    text-align: left;
  }

  img,
  video {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: #000;
    border-radius: 6px;
  }

  .name {
    overflow: hidden;
    font-size: 12px;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 1px 6px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: rgb(0 0 0 / 0.65);
    border-radius: 4px;
  }

  .item.selected {
    border-color: var(--accent);
  }

  .item.on-air {
    border-color: var(--live);
  }

  .empty {
    grid-column: 1 / -1;
    padding: 32px 12px;
    color: var(--muted);
    text-align: center;
  }
</style>
