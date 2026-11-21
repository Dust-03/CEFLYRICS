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
  };
  let { shortcuts, aspect, slideOf, onUse, onAir, onManage }: Props = $props();

  const TYPE_NAMES = { verse: 'Versículo', song: 'Canción', image: 'Foto', video: 'Video' };
  const PREVIEW_WIDTH = 280;

  let hovered = $state<{ shortcut: Shortcut; left: number } | null>(null);

  function show(shortcut: Shortcut, chip: HTMLElement) {
    const { left, width } = chip.getBoundingClientRect();
    const center = left + width / 2 - PREVIEW_WIDTH / 2;
    hovered = { shortcut, left: Math.max(8, Math.min(center, window.innerWidth - PREVIEW_WIDTH - 8)) };
  }

  const typeName = (shortcut: Shortcut) =>
    shortcut.kind === 'media' ? TYPE_NAMES[shortcut.media?.kind ?? 'image'] : TYPE_NAMES[shortcut.kind];
</script>

<header class="titlebar">
  <span class="label">Atajos</span>
  <div class="chips" id="barra-atajos" role="toolbar" aria-label="Atajos">
    {#each shortcuts as shortcut, index (shortcut.id)}
      <button
        class="chip"
        data-atajo-barra={shortcut.id}
        onclick={() => onUse(shortcut)}
        ondblclick={() => onAir(shortcut)}
        onmouseenter={(event) => show(shortcut, event.currentTarget)}
        onmouseleave={() => (hovered = null)}
        onfocus={(event) => show(shortcut, event.currentTarget)}
        onblur={() => (hovered = null)}
      >
        {#if index < 9}<kbd>{index + 1}</kbd>{/if}
        <span class="thumb">
          {#if shortcut.media && (shortcut.media.thumb || shortcut.media.kind === 'image')}
            <img src={shortcut.media.thumb ?? shortcut.media.url} alt="" loading="lazy" decoding="async" />
          {:else if shortcut.media}
            <video src={`${shortcut.media.url}#t=1`} preload="metadata" muted></video>
          {:else}
            <Icon name={shortcut.kind === 'song' ? 'songs' : 'bible'} />
          {/if}
        </span>
        <span class="name">{shortcut.title}</span>
      </button>
    {:else}
      <button class="chip empty" onclick={onManage}>
        <span class="thumb"><Icon name="star" /></span>
        <span class="name">Marcá ★ un versículo, canción o medio para tenerlo acá</span>
      </button>
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
    background: var(--surface-2);
    border-radius: 999px;
    -webkit-app-region: no-drag;
  }

  .chip:hover {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
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
