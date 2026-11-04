<script lang="ts">
  import type { Shortcut } from '@shared/api';
  import type { PreviewItem } from './preview-item';

  type Props = {
    shortcuts: Shortcut[];
    onAirKey: string | undefined;
    onUse: (shortcut: Shortcut) => void;
    onAir: (item: PreviewItem) => void;
    toItem: (shortcut: Shortcut) => PreviewItem | null;
    onRemove: (shortcut: Shortcut) => void;
  };
  let { shortcuts, onAirKey, onUse, onAir, toItem, onRemove }: Props = $props();

  const FILTERS = [
    { id: 'all', label: 'Todo' },
    { id: 'song', label: 'Canciones' },
    { id: 'verse', label: 'Versículos' },
    { id: 'image', label: 'Fotos' },
    { id: 'video', label: 'Videos' },
  ] as const;

  let filter = $state<(typeof FILTERS)[number]['id']>('all');

  const typeOf = (shortcut: Shortcut) => shortcut.media?.kind ?? shortcut.kind;
  const TYPE_NAMES: Record<string, string> = { song: 'Canción', verse: 'Versículo', image: 'Foto', video: 'Video' };
  const visible = $derived(shortcuts.filter((item) => filter === 'all' || typeOf(item) === filter));

  function airNow(shortcut: Shortcut) {
    const item = toItem(shortcut);
    if (item) onAir(item);
  }
</script>

<div class="panel">
  <div class="filters" role="group" aria-label="Filtrar">
    {#each FILTERS as item (item.id)}
      <button class:active={filter === item.id} onclick={() => (filter = item.id)}>{item.label}</button>
    {/each}
  </div>

  <div class="grid" id="atajos">
    {#each visible as shortcut (shortcut.id)}
      {@const number = shortcuts.indexOf(shortcut) + 1}
      {@const preview = toItem(shortcut)}
      <div class="card" class:on-air={preview?.key === onAirKey} data-tipo={typeOf(shortcut)}>
        <button
          class="open"
          title={shortcut.kind === 'song' ? 'Abrir la canción' : 'A la vista previa. Doble clic: al aire'}
          onclick={() => onUse(shortcut)}
          ondblclick={() => airNow(shortcut)}
        >
          {#if shortcut.media}
            {#if shortcut.media.thumb || shortcut.media.kind === 'image'}
              <img src={shortcut.media.thumb ?? shortcut.media.url} alt="" loading="lazy" decoding="async" />
            {:else}
              <video src={`${shortcut.media.url}#t=1`} preload="metadata" muted></video>
            {/if}
          {:else}
            <span class="text">{shortcut.text}</span>
          {/if}
          <span class="foot">
            <small>{TYPE_NAMES[typeOf(shortcut)]}</small>
            <strong>{shortcut.title}</strong>
          </span>
        </button>
        {#if number <= 9}<kbd title={`Ctrl+${number}`}>{number}</kbd>{/if}
        <button
          class="remove"
          aria-label={`Quitar ${shortcut.title}`}
          title="Quitar de atajos"
          onclick={() => onRemove(shortcut)}
        >
          ×
        </button>
      </div>
    {:else}
      <p class="empty">
        {#if shortcuts.length}
          No hay atajos de este tipo.
        {:else}
          Tocá la estrella ☆ en un versículo, una canción, una foto o un video para tenerlos acá a mano.
        {/if}
      </p>
    {/each}
  </div>
</div>

<style>
  .panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .filters button {
    color: var(--muted);
    background: transparent;
    border-color: transparent;
  }

  .filters button.active {
    font-weight: 600;
    color: var(--text);
    background: var(--surface-2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    align-content: start;
    gap: 10px;
    padding: 2px;
    overflow-y: auto;
  }

  .card {
    position: relative;
  }

  .open {
    display: grid;
    grid-template-rows: auto auto;
    gap: 5px;
    width: 100%;
    height: 100%;
    padding: 5px;
    text-align: left;
  }

  .card.on-air .open {
    border-color: var(--live);
  }

  img,
  video,
  .text {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 6px;
  }

  img,
  video {
    object-fit: cover;
    background: #000;
  }

  .text {
    display: -webkit-box;
    padding: 34px 8px 6px;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.3;
    white-space: pre-line;
    background: var(--bg);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .foot {
    display: grid;
    min-width: 0;
    padding: 0 3px 2px;
  }

  .foot small {
    font-size: 11px;
    color: var(--muted);
  }

  .foot strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  kbd {
    position: absolute;
    top: 10px;
    left: 10px;
    min-width: 20px;
    padding: 1px 5px;
    font: 600 12px system-ui;
    color: #fff;
    text-align: center;
    background: rgb(0 0 0 / 0.65);
    border-radius: 4px;
  }

  .remove {
    position: absolute;
    top: 9px;
    right: 9px;
    width: 24px;
    height: 24px;
    padding: 0;
    line-height: 1;
    color: #fff;
    background: rgb(0 0 0 / 0.65);
    border-color: transparent;
  }

  .empty {
    grid-column: 1 / -1;
    padding: 32px 12px;
    color: var(--muted);
    text-align: center;
  }
</style>
