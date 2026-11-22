<script lang="ts">
  import type { Shortcut } from '@shared/api';
  import type { Slide } from '@shared/state';
  import Icon from './Icon.svelte';
  import Screen from './Screen.svelte';

  type Props = {
    shortcuts: Shortcut[];
    aspect?: string;
    // La diapositiva ya con su estilo, tal como saldría al aire.
    slideOf: (shortcut: Shortcut) => Slide;
    onUse: (shortcut: Shortcut) => void;
    onAir: (shortcut: Shortcut) => void;
    onManage: () => void;
    onReorder: (ids: number[]) => Promise<void>;
  };
  let { shortcuts, aspect, slideOf, onUse, onAir, onManage, onReorder }: Props = $props();

  const TYPE_NAMES = { verse: 'Versículo', song: 'Canción', image: 'Foto', video: 'Video' };
  const PREVIEW_WIDTH = 280;

  // Los tipos de la pestaña Atajos; "Todo" queda solo allá.
  const FILTERS = [
    { id: 'song', label: 'Canciones' },
    { id: 'verse', label: 'Versículos' },
    { id: 'image', label: 'Fotos' },
    { id: 'video', label: 'Videos' },
  ] as const;
  type Filter = (typeof FILTERS)[number]['id'];

  const kindOf = (shortcut: Shortcut) => shortcut.media?.kind ?? shortcut.kind;
  let chosen = $state<Filter>();
  // Hasta que se elija uno, el primer tipo que tenga atajos.
  const filter = $derived(
    chosen ?? FILTERS.find((option) => shortcuts.some((item) => kindOf(item) === option.id))?.id ?? 'song',
  );
  let hovered = $state<{ shortcut: Shortcut; left: number } | null>(null);

  // Arrastrar para reordenar, igual que en la pestaña Atajos: mantener apretado y mover.
  const HOLD_MS = 250;
  const MOVE_TOLERANCE_PX = 8;
  let draft = $state<Shortcut[] | null>(null);
  let draggingId = $state<number>();
  let justDragged = false;
  let pressAt = { x: 0, y: 0 };
  let hold: ReturnType<typeof setTimeout> | undefined;

  // El número sigue siendo el de Ctrl+1…9, que cuenta todos los atajos aunque haya filtro.
  const visible = $derived(
    (draft ?? shortcuts)
      .map((shortcut, index) => ({ shortcut, index }))
      .filter(({ shortcut }) => kindOf(shortcut) === filter),
  );

  function show(shortcut: Shortcut, chip: HTMLElement) {
    const { left, width } = chip.getBoundingClientRect();
    const center = left + width / 2 - PREVIEW_WIDTH / 2;
    hovered = { shortcut, left: Math.max(8, Math.min(center, window.innerWidth - PREVIEW_WIDTH - 8)) };
  }

  function onPress(event: PointerEvent, shortcut: Shortcut) {
    justDragged = false;
    // Se reordena dentro del tipo: los de otros tipos no se mueven entre sí.
    if (event.button !== 0 || visible.length < 2) return;
    const chip = event.currentTarget as HTMLElement;
    pressAt = { x: event.clientX, y: event.clientY };
    hold = setTimeout(() => {
      draggingId = shortcut.id;
      draft = [...shortcuts];
      hovered = null;
      chip.setPointerCapture(event.pointerId);
    }, HOLD_MS);
  }

  function onMove(event: PointerEvent) {
    if (draggingId === undefined) {
      if (Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > MOVE_TOLERANCE_PX) clearTimeout(hold);
      return;
    }
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-atajo-barra]');
    const targetId = Number(over?.dataset.atajoBarra);
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

  const typeName = (shortcut: Shortcut) =>
    shortcut.kind === 'media' ? TYPE_NAMES[shortcut.media?.kind ?? 'image'] : TYPE_NAMES[shortcut.kind];
</script>

<header class="titlebar">
  <span class="label">Atajos</span>
  {#if shortcuts.length}
    <select
      id="barra-atajos-filtro"
      aria-label="Qué atajos mostrar"
      value={filter}
      onchange={(event) => (chosen = event.currentTarget.value as Filter)}
    >
      {#each FILTERS as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  {/if}
  <div class="chips" id="barra-atajos" role="toolbar" aria-label="Atajos">
    {#each visible as { shortcut, index } (shortcut.id)}
      <button
        class="chip"
        class:dragging={shortcut.id === draggingId}
        data-atajo-barra={shortcut.id}
        title="Mantené apretado y arrastrá para reordenar"
        onclick={() => justDragged || onUse(shortcut)}
        ondblclick={() => justDragged || onAir(shortcut)}
        onpointerdown={(event) => onPress(event, shortcut)}
        onpointermove={onMove}
        onpointerup={onRelease}
        onpointercancel={onCancel}
        onmouseenter={(event) => draggingId === undefined && show(shortcut, event.currentTarget)}
        onmouseleave={() => (hovered = null)}
        onfocus={(event) => show(shortcut, event.currentTarget)}
        onblur={() => (hovered = null)}
      >
        {#if index < 9}<kbd>{index + 1}</kbd>{/if}
        <span class="thumb">
          {#if shortcut.media && (shortcut.media.thumb || shortcut.media.kind === 'image')}
            <img
              src={shortcut.media.thumb ?? shortcut.media.url}
              alt=""
              loading="lazy"
              decoding="async"
              draggable="false"
            />
          {:else if shortcut.media}
            <video src={`${shortcut.media.url}#t=1`} preload="metadata" muted></video>
          {:else}
            <Icon name={shortcut.kind === 'song' ? 'songs' : 'bible'} />
          {/if}
        </span>
        <span class="name">{shortcut.title}</span>
      </button>
    {:else}
      {#if shortcuts.length}
        <span class="chip empty">No hay atajos de este tipo</span>
      {:else}
        <button class="chip empty" onclick={onManage}>
          <span class="thumb"><Icon name="star" /></span>
          <span class="name">Marcá ★ un versículo, canción o medio para tenerlo acá</span>
        </button>
      {/if}
    {/each}
  </div>
</header>

{#if hovered}
  <div class="peek" style:left={`${hovered.left}px`} style:width={`${PREVIEW_WIDTH}px`} role="tooltip">
    <Screen id="vista-atajo" {aspect} state={{ slide: slideOf(hovered.shortcut), mode: 'live' }} />
    <div class="peek-info">
      <strong>{hovered.shortcut.title}</strong>
      <span>{typeName(hovered.shortcut)}</span>
    </div>
    <small>
      {hovered.shortcut.kind === 'song' ? 'Clic: abrir la canción' : 'Clic: vista previa · Doble clic: al aire'}
    </small>
  </div>
{/if}

<style>
  /* Se arrastra la ventana desde la barra; los botones de Windows quedan a la derecha. */
  .titlebar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 38px;
    padding: 0 150px 0 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    -webkit-app-region: drag;
    user-select: none;
  }

  .label {
    flex: none;
    font-size: 12px;
    font-weight: 650;
    color: var(--muted);
  }

  select {
    flex: none;
    height: 28px;
    padding: 0 8px;
    font-size: 12px;
    background: var(--surface-2);
    border-color: transparent;
    border-radius: 999px;
    -webkit-app-region: no-drag;
  }

  .chips {
    display: flex;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chip {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    max-width: 210px;
    height: 28px;
    padding: 0 10px 0 4px;
    font-size: 12px;
    background: var(--button);
    border-radius: 999px;
    -webkit-app-region: no-drag;
  }

  .chip:hover {
    background: color-mix(in srgb, var(--accent) 14%, var(--button));
  }

  .chip.dragging {
    outline: 2px solid var(--accent);
    cursor: grabbing;
  }

  .chip.empty {
    max-width: none;
    color: var(--muted);
  }

  kbd {
    display: grid;
    place-items: center;
    flex: none;
    min-width: 18px;
    height: 18px;
    padding: 0;
    font: 650 11px/1 var(--font-ui);
    color: var(--on-accent);
    border: 0;
    background: var(--accent);
    border-radius: 999px;
  }

  .thumb {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 20px;
    overflow: hidden;
    color: var(--accent);
    background: var(--bg);
    border-radius: 5px;
  }

  .thumb :global(svg) {
    width: 15px;
    height: 15px;
  }

  .thumb img,
  .thumb video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .peek {
    position: fixed;
    top: 42px;
    z-index: 50;
    display: grid;
    gap: 6px;
    padding: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    pointer-events: none;
    animation: peek-in 0.14s ease-out;
  }

  .peek-info {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
  }

  .peek-info strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .peek-info span,
  .peek small {
    flex: none;
    font-size: 11px;
    color: var(--muted);
  }

  @keyframes peek-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
