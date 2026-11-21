<script lang="ts">
  import { DEFAULT_KEY_BUTTONS, FREE_KEYS, KEY_ACTIONS, MAX_LABEL, keyName, type KeyButton } from '@shared/keys';

  let { buttons }: { buttons: KeyButton[] } = $props();
  const api = window.ceflyrics;

  // Copia para editar: se guarda al salir de cada campo y vuelve corregida desde el main.
  let draft = $derived(buttons.map((button) => ({ ...button })));

  const save = () => api.keys.save($state.snapshot(draft));

  // Una tecla hace una sola cosa: si otro botón la tenía, la pierde.
  function setKey(index: number, key: string) {
    draft = draft.map((button, i) => ({ ...button, key: i === index ? key : button.key === key ? '' : button.key }));
    save();
  }

  function restore() {
    draft = DEFAULT_KEY_BUTTONS.map((button) => ({ ...button }));
    save();
  }
</script>

<div class="keys-panel">
  <header>
    <h3>Botones de salida</h3>
    <p>
      Son los cuatro botones debajo de la pantalla Al aire. Sus teclas andan con cualquier ventana de CEFLYRICS al
      frente, también la salida.
    </p>
  </header>

  <ol class="rows" aria-label="Botones de salida">
    {#each draft as button, index (index)}
      <li class="row">
        <!-- Así se ve el botón en la consola, mientras se edita. -->
        <span class="preview" aria-hidden="true">
          {button.label || 'Sin nombre'}
          {#if button.key}<kbd>{keyName(button.key)}</kbd>{/if}
        </span>
        <label>
          Nombre
          <input
            id="tecla-nombre-{index}"
            type="text"
            maxlength={MAX_LABEL}
            aria-label="Nombre del botón {index + 1}"
            bind:value={button.label}
            onchange={save}
          />
        </label>
        <label>
          Tecla
          <select
            id="tecla-tecla-{index}"
            aria-label="Tecla del botón {index + 1}"
            value={button.key}
            onchange={(event) => setKey(index, event.currentTarget.value)}
          >
            <option value="">Sin tecla</option>
            {#each FREE_KEYS as key (key)}
              <option value={key}>{keyName(key)}</option>
            {/each}
          </select>
        </label>
        <label>
          Qué hace
          <select
            id="tecla-accion-{index}"
            aria-label="Qué hace el botón {index + 1}"
            bind:value={button.action}
            onchange={save}
          >
            {#each KEY_ACTIONS as { action, label } (action)}
              <option value={action}>{label}</option>
            {/each}
          </select>
        </label>
      </li>
    {/each}
  </ol>

  <footer>
    <span>Los cambios se guardan solos.</span>
    <button id="teclas-fabrica" onclick={restore}>Volver a los de fábrica</button>
  </footer>
</div>

<style>
  .keys-panel {
    display: grid;
    gap: 18px;
    align-content: start;
    max-width: 820px;
    container-type: inline-size;
  }

  h3 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 650;
  }

  header p {
    margin: 0;
    max-width: 64ch;
    line-height: 1.45;
    color: var(--muted);
  }

  .rows {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 1.4fr);
    gap: 14px;
    align-items: end;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
  }

  /* La tapa del botón tal como queda debajo de Al aire. */
  .preview {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    align-self: center;
    min-height: 44px;
    padding: 6px 10px;
    font-weight: 600;
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom-width: 3px;
    border-radius: var(--radius);
    overflow: hidden;
    white-space: nowrap;
  }

  label {
    display: grid;
    gap: 5px;
    font-size: 13px;
    color: var(--muted);
  }

  label input,
  label select {
    width: 100%;
    min-width: 0;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    color: var(--muted);
  }

  @container (max-width: 560px) {
    .row {
      grid-template-columns: 1fr 1fr;
    }

    .preview {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>
