<script lang="ts">
  import { untrack } from 'svelte';
  import type { MediaItem, ThemeAssignment } from '@shared/api';
  import {
    BACKGROUNDS,
    DEFAULT_THEME,
    FONTS,
    WEIGHTS,
    type Background,
    type Theme,
    type ThemeEntry,
  } from '@shared/theme';
  import Screen from './Screen.svelte';

  type Props = {
    home: number;
    themes: ThemeEntry[];
    assignment: ThemeAssignment;
    media: MediaItem[];
    onChange: () => void;
  };
  let { home, themes, assignment, media, onChange }: Props = $props();

  const api = window.ceflyrics.themes;
  const SAMPLE = 'Jehová es mi pastor;\nnada me faltará.';

  let current = $state<ThemeEntry | null>(null);
  let draft = $state<Theme | null>(null);
  let name = $state('');
  let error = $state('');
  let targetKind = $state<'song' | 'bible'>('bible');

  $effect(() => {
    if (home) untrack(goHome);
  });

  function goHome() {
    current = null;
    draft = null;
    error = '';
  }

  function choose(entry: ThemeEntry) {
    current = entry;
    draft = structuredClone($state.snapshot(entry.theme));
    name = entry.factory ? `${entry.name} (mío)` : entry.name;
    error = '';
  }

  // Un estilo en blanco: siempre se puede empezar de cero, aunque no quede ninguno.
  function create() {
    current = null;
    draft = structuredClone(DEFAULT_THEME);
    name = 'Estilo nuevo';
    error = '';
  }

  async function assign(kind: 'song' | 'bible', id: string) {
    await api.assign({ ...$state.snapshot(assignment), [kind]: id });
    onChange();
  }

  async function save() {
    if (!draft) return;
    try {
      const otherKind = targetKind === 'bible' ? 'song' : 'bible';
      const makeIndependent = current?.factory || (current && assignment[otherKind] === current.id);
      const id = await api.save({
        id: makeIndependent ? undefined : current?.id,
        name,
        theme: $state.snapshot(draft),
      });
      await api.assign({ ...assignment, [targetKind]: id });
      onChange();
      current = { id, name, factory: false, theme: $state.snapshot(draft) };
      error = '';
    } catch (err) {
      error = (err as Error).message.replace(/^.*Error: /, '');
    }
  }

  async function remove() {
    if (!current) return;
    await api.remove(current.id);
    current = null;
    draft = null;
    onChange();
  }

  const isBackground = (background: Background) => {
    const value = draft?.background;
    if (!value || value.kind !== background.kind) return false;
    return value.kind === 'css'
      ? value.value === (background as { value: string }).value
      : value.url === (background as { url: string }).url;
  };

  function toggleOutline(enabled: boolean) {
    if (draft) draft.outlineColor = enabled ? '#000000' : null;
  }
</script>

<div class="panel">
  <div class="themes" id="estilos">
    {#each themes as entry (entry.id)}
      <div class="theme" class:active={entry.id === current?.id}>
        <button class="pick" aria-label={`Editar ${entry.name}`} onclick={() => choose(entry)}>
          <Screen
            id={`estilo-${entry.id}`}
            state={{ slide: { body: SAMPLE, title: entry.name, theme: entry.theme }, mode: 'live' }}
          />
        </button>
        <div class="uses">
          <button
            class:primary={assignment.song === entry.id}
            data-usar-canciones={entry.id}
            aria-pressed={assignment.song === entry.id}
            onclick={() => assign('song', entry.id)}
          >
            {assignment.song === entry.id ? '✓ ' : ''}Canciones
          </button>
          <button
            class:primary={assignment.bible === entry.id}
            data-usar-biblia={entry.id}
            aria-pressed={assignment.bible === entry.id}
            onclick={() => assign('bible', entry.id)}
          >
            {assignment.bible === entry.id ? '✓ ' : ''}Biblia
          </button>
        </div>
      </div>
    {/each}
    <button id="estilo-nuevo" class="new" onclick={create}>
      <span aria-hidden="true">+</span>
      Nuevo estilo
    </button>
    {#if !themes.length}
      <p class="hint empty">
        No queda ningún estilo: lo proyectado sale con letra blanca sobre el fondo Noche hasta que crees uno.
      </p>
    {/if}
  </div>

  <div class="editor">
    <label>
      Editar estilo para
      <select id="estilo-destino" bind:value={targetKind}>
        <option value="bible">Biblia</option>
        <option value="song">Canciones</option>
      </select>
    </label>
    <p class="hint">Al guardar, el estilo se aplica sólo a {targetKind === 'bible' ? 'la Biblia' : 'las canciones'}.</p>
    {#if draft}
      <h2>Personalizar</h2>
      <Screen
        id="estilo-muestra"
        state={{ slide: { body: SAMPLE, title: 'Salmos 23:1', theme: draft }, mode: 'live' }}
      />

      <label>
        Fuente
        <select id="estilo-fuente" bind:value={draft.font}>
          {#each FONTS as font (font.id)}
            <option value={font.id} style:font-family={font.css}>{font.name}</option>
          {/each}
        </select>
      </label>
      <div class="row">
        <label class="grow">
          Grosor
          <select id="estilo-grosor" bind:value={draft.weight}>
            {#each WEIGHTS as weight (weight.value)}
              <option value={weight.value}>{weight.name}</option>
            {/each}
          </select>
        </label>
        <label class="check"><input id="estilo-cursiva" type="checkbox" bind:checked={draft.italic} /> Cursiva</label>
      </div>
      <label>
        Tamaño · {Math.round(draft.scale * 100)} %
        <input id="estilo-tamano" type="range" min="0.5" max="2" step="0.05" bind:value={draft.scale} />
      </label>
      <label>
        Margen · {Math.round(draft.margin * 100)} % de la pantalla
        <input id="estilo-margen" type="range" min="0" max="0.2" step="0.01" bind:value={draft.margin} />
      </label>
      <p class="hint">Es una proporción: el mismo margen en una tele de 32" que en una de 70" o en el proyector.</p>
      <label>
        Interlineado · {draft.lineHeight.toFixed(2)}
        <input id="estilo-interlineado" type="range" min="0.9" max="2" step="0.05" bind:value={draft.lineHeight} />
      </label>
      <div class="row">
        <label class="color">Color de letra <input id="estilo-color" type="color" bind:value={draft.color} /></label>
        <label class="color">Título <input type="color" bind:value={draft.titleColor} /></label>
        <label class="check"><input type="checkbox" bind:checked={draft.uppercase} /> Mayúsculas</label>
        <label class="check"><input type="checkbox" bind:checked={draft.shadow} /> Sombra</label>
        <label class="check">
          <input
            id="estilo-contorno"
            type="checkbox"
            checked={!!draft.outlineColor}
            onchange={(event) => toggleOutline(event.currentTarget.checked)}
          />
          Contorno
        </label>
        <label class="color">
          Color del contorno
          <input
            id="estilo-color-contorno"
            type="color"
            value={draft.outlineColor ?? '#000000'}
            disabled={!draft.outlineColor}
            oninput={(event) => (draft!.outlineColor = event.currentTarget.value)}
          />
        </label>
      </div>
      {#if draft.outlineColor}
        <label>
          Grosor del contorno · {Math.round(draft.outlineWidth * 1000) / 10} %
          <input
            id="estilo-grosor-contorno"
            type="range"
            min="0.01"
            max="0.15"
            step="0.005"
            bind:value={draft.outlineWidth}
          />
        </label>
      {/if}

      <span class="legend">Fondo</span>
      <div class="swatches">
        {#each BACKGROUNDS as item (item.name)}
          {@const background = { kind: 'css', value: item.value } as Background}
          <button
            class="swatch"
            class:active={isBackground(background)}
            style:background={item.value}
            title={item.name}
            aria-label={`Fondo ${item.name}`}
            onclick={() => (draft!.background = background)}
          ></button>
        {/each}
        {#each media as item (item.id)}
          {@const background = { kind: item.kind, url: item.url, thumb: item.thumb } as Background}
          <button
            class="swatch file"
            class:active={isBackground(background)}
            title={item.name}
            aria-label={`Fondo ${item.name}`}
            data-fondo-medio={item.id}
            onclick={() => (draft!.background = background)}
          >
            {#if item.thumb || item.kind === 'image'}
              <img src={item.thumb ?? item.url} alt="" loading="lazy" decoding="async" />
            {:else}
              <video src={`${item.url}#t=1`} preload="metadata" muted></video>
            {/if}
          </button>
        {/each}
      </div>
      {#if !media.length}<p class="hint">Las fotos y videos del menú Medios también aparecen acá como fondo.</p>{/if}

      <input id="estilo-nombre" type="text" placeholder="Nombre del estilo" bind:value={name} />
      {#if error}<p class="error">{error}</p>{/if}
      <div class="actions">
        <button id="estilo-guardar" class="primary" onclick={save}>
          {current?.factory ? 'Guardar como nuevo' : 'Guardar'}
        </button>
        {#if current}
          <button id="estilo-borrar" onclick={remove}>Borrar</button>
        {/if}
      </div>
    {:else}
      <p class="hint center">Tocá un estilo para cambiar su fuente, colores o fondo.</p>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 270px;
    gap: 14px;
    height: 100%;
    min-height: 0;
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    align-content: start;
    gap: 10px;
    overflow-y: auto;
    padding: 2px;
  }

  .theme {
    display: grid;
    gap: 6px;
    padding: 6px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
  }

  .theme.active {
    border-color: var(--accent);
  }

  /* Ocupa el lugar de una tarjeta más, con borde punteado: es un hueco para llenar. */
  .new {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 4px;
    min-height: 120px;
    color: var(--muted);
    background: transparent;
    border: 1px dashed var(--line);
    border-radius: 10px;
  }

  .new span {
    font-size: 26px;
    line-height: 1;
    color: var(--accent);
  }

  .empty {
    grid-column: 1 / -1;
  }

  .pick {
    padding: 0;
    background: transparent;
    border: 0;
  }

  .uses {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .uses button {
    padding: 3px 4px;
    font-size: 12px;
    white-space: nowrap;
  }

  .editor {
    display: grid;
    align-content: start;
    gap: 8px;
    overflow-y: auto;
    padding-right: 4px;
  }

  label {
    display: grid;
    gap: 3px;
    font-size: 13px;
    color: var(--muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .grow {
    flex: 1;
  }

  .color {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color input {
    width: 30px;
    height: 26px;
    padding: 1px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .legend {
    font-size: 13px;
    color: var(--muted);
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 5px;
  }

  .swatch {
    aspect-ratio: 16 / 10;
    padding: 0;
    overflow: hidden;
    border: 2px solid var(--line);
  }

  .swatch.active {
    border-color: var(--accent);
  }

  .swatch img,
  .swatch video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .center {
    padding: 32px 8px;
    text-align: center;
  }

  .error {
    margin: 0;
    color: var(--live);
  }

  .actions {
    display: flex;
    gap: 6px;
  }
</style>
