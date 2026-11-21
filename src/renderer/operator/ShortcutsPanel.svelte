<script lang="ts">
  import { untrack } from 'svelte';
  import type { Shortcut } from '@shared/api';
  import type { PreviewItem } from './preview-item';

  type Props = {
    home: number;
    shortcuts: Shortcut[];
    onAirKey: string | undefined;
    onUse: (shortcut: Shortcut) => void;
    onAir: (item: PreviewItem) => void;
    toItem: (shortcut: Shortcut) => PreviewItem | null;
    onRemove: (shortcut: Shortcut) => void;
    onReorder: (ids: number[]) => Promise<void>;
  };
  let { home, shortcuts, onAirKey, onUse, onAir, toItem, onRemove, onReorder }: Props = $props();

  const HOLD_MS = 250;
  const MOVE_TOLERANCE_PX = 8;

  const FILTERS = [
    { id: 'all', label: 'Todo' },
    { id: 'song', label: 'Canciones' },
    { id: 'verse', label: 'Versículos' },
    { id: 'image', label: 'Fotos' },
    { id: 'video', label: 'Videos' },
  ] as const;

  let filter = $state<(typeof FILTERS)[number]['id']>('all');
  // Mientras se arrastra, el orden nuevo vive acá; se guarda al soltar.
  let draft = $state<Shortcut[] | null>(null);
  let draggingId = $state<number>();

  $effect(() => {
    if (home) untrack(goHome);
  });

  function goHome() {
    filter = 'all';
  }
  let hold: ReturnType<typeof setTimeout> | undefined;
  let pressAt = { x: 0, y: 0 };
  let justDragged = false;

  const typeOf = (shortcut: Shortcut) => shortcut.media?.kind ?? shortcut.kind;
  const TYPE_NAMES: Record<string, string> = { song: 'Canción', verse: 'Versículo', image: 'Foto', video: 'Video' };
  const ordered = $derived(draft ?? shortcuts);
  const visible = $derived(ordered.filter((item) => filter === 'all' || typeOf(item) === filter));

  function use(shortcut: Shortcut) {
    if (!justDragged) onUse(shortcut);
  }

  function airNow(shortcut: Shortcut) {
    const item = toItem(shortcut);
    if (item && !justDragged) onAir(item);
  }

  // Mantener apretado y arrastrar. Solo con "Todo": con un filtro no se ven todos los lugares.
  function onPress(event: PointerEvent, shortcut: Shortcut) {
    justDragged = false;
    if (filter !== 'all' || event.button !== 0 || (event.target as HTMLElement).closest('.remove')) return;
    const card = event.currentTarget as HTMLElement;
    pressAt = { x: event.clientX, y: event.clientY };
    hold = setTimeout(() => {
      draggingId = shortcut.id;
      draft = [...shortcuts];
      card.setPointerCapture(event.pointerId);
    }, HOLD_MS);
  }

  function onMove(event: PointerEvent) {
    if (draggingId === undefined) {
      const moved = Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y);
      if (moved > MOVE_TOLERANCE_PX) clearTimeout(hold);
      return;
    }
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-atajo-id]');
    const targetId = Number(over?.dataset.atajoId);
    if (!draft || !targetId || targetId === draggingId) return;
    const from = draft.findIndex((item) => item.id === draggingId);
    const to = draft.findIndex((item) => item.id === targetId);
    const next = [...draft];
    next.splice(to, 0, ...next.splice(from, 1));
    draft = next;
  }

  async function onRelease() {
    clearTimeout(hold);
    if (draggingId === undefined) return;
    justDragged = true;
    draggingId = undefined;
    if (draft) await onReorder(draft.map((item) => item.id));
    draft = null;
  }

  function onCancel() {
    clearTimeout(hold);
    draggingId = undefined;
    draft = null;
  }
</script>

<div class="panel">
  <div class="filters" role="group" aria-label="Filtrar">
    {#each FILTERS as item (item.id)}
      <button class:active={filter === item.id} onclick={() => (filter = item.id)}>{item.label}</button>
    {/each}
    {#if ordered.length > 1}
      <small class="hint">
        {filter === 'all' ? 'Mantené apretado y arrastrá para reordenar' : 'Para reordenar, elegí Todo'}
      </small>
    {/if}
  </div>

  <div class="grid" id="atajos">
    {#each visible as shortcut (shortcut.id)}
      {@const number = ordered.indexOf(shortcut) + 1}
      {@const preview = toItem(shortcut)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="card"
        class:on-air={preview?.key === onAirKey}
        class:dragging={shortcut.id === draggingId}
        data-tipo={typeOf(shortcut)}
        data-atajo-id={shortcut.id}
        onpointerdown={(event) => onPress(event, shortcut)}
        onpointermove={onMove}
        onpointerup={onRelease}
        onpointercancel={onCancel}
      >
        <button
          class="open"
          title={shortcut.kind === 'song' ? 'Abrir la canción' : 'A la vista previa. Doble clic: al aire'}
          onclick={() => use(shortcut)}
          ondblclick={() => airNow(shortcut)}
        >
          {#if shortcut.media}
            {#if shortcut.media.thumb || shortcut.media.kind === 'image'}
              <img
                src={shortcut.media.thumb ?? shortcut.media.url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
              />
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
    align-items: center;
    gap: 2px;
  }

  .hint {
    margin-left: auto;
    color: var(--muted);
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
    user-select: none;
  }

  .card.dragging {
    z-index: 1;
    cursor: grabbing;
    opacity: 0.75;
    transform: scale(1.03);
  }

  .card.dragging .open {
    cursor: grabbing;
    border-color: var(--accent);
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
    display: block;
    padding: 34px 8px 6px;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.3;
    white-space: pre-line;
    background: var(--bg);
    /* Un texto largo se desvanece en vez de cortarse a media línea. */
    mask-image: linear-gradient(#000 72%, transparent 96%);
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
    font: 650 12px var(--font-ui);
    color: #fff;
    border: 0;
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
