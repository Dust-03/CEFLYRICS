<script lang="ts">
  import type { BibleInfo, DataCounts, DataResult, ImportResult } from '@shared/api';

  type Props = { onChange: () => void };
  let { onChange }: Props = $props();

  const api = window.ceflyrics;

  let bibles = $state<BibleInfo[]>([]);
  let bibleName = $state('');
  let bibleCode = $state('');
  let accepted = $state(false);
  let confirmImport = $state(false);
  let confirmRemove = $state('');
  let busy = $state(false);
  let message = $state('');
  let rejected = $state<ImportResult['rejected']>([]);

  const imported = $derived(bibles.filter((bible) => bible.imported));
  const canImportBible = $derived(accepted && !!bibleName.trim() && !!bibleCode.trim());

  async function loadBibles() {
    bibles = await api.bible.list();
  }
  loadBibles();

  const summary = ({ songs, media, themes, timers, shortcuts, bibles: count }: DataCounts) =>
    `${songs} canciones, ${media} medios, ${themes} estilos, ${timers} temporizadores, ${shortcuts} atajos y ${count} biblias importadas`;

  async function run<T>(action: () => Promise<T | { canceled: true } | { error: string }>, done: (value: T) => void) {
    busy = true;
    message = '';
    rejected = [];
    const result = await action();
    busy = false;
    if (typeof result === 'object' && result !== null && 'error' in result) message = result.error;
    else if (typeof result !== 'object' || result === null || !('canceled' in result)) done(result as T);
  }

  function showImport(result: ImportResult, what: string) {
    message = `Entraron ${result.added} ${what}.`;
    rejected = result.rejected;
    onChange();
  }

  const importSongs = () => run<ImportResult>(api.data.importSongs, (result) => showImport(result, 'canciones'));

  const exportSongs = () =>
    run<{ count: number }>(api.data.exportSongs, ({ count }) => (message = `Se guardaron ${count} canciones.`));

  function importBible() {
    const input = { name: bibleName, code: bibleCode };
    run<ImportResult>(
      () => api.data.importBible(input),
      async (result) => {
        showImport(result, 'libros');
        if (!result.added) return;
        bibleName = '';
        bibleCode = '';
        accepted = false;
        await loadBibles();
      },
    );
  }

  async function removeBible(code: string) {
    await api.data.removeBible(code);
    confirmRemove = '';
    await loadBibles();
    onChange();
  }

  const exportAll = () =>
    run<Extract<DataResult, { counts: DataCounts }>>(
      api.data.export,
      ({ counts }) => (message = `Se guardaron ${summary(counts)}.`),
    );

  function importAll() {
    confirmImport = false;
    // La consola se vuelve a abrir para mostrar los datos nuevos.
    run<Extract<DataResult, { counts: DataCounts }>>(api.data.import, () => location.reload());
  }
</script>

<div class="panel" id="transferir">
  {#if message}
    <div class="result" id="datos-mensaje">
      <p>{message}</p>
      {#if rejected.length}
        <ul id="datos-rechazados">
          {#each rejected as item (item.name)}
            <li><b>{item.name}:</b> {item.reason}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <section>
    <h3>Canciones</h3>
    <p>
      Importá archivos TXT, con una línea en blanco entre diapositivas, u OpenLyrics (.xml). El nombre del TXT es el
      título.
    </p>
    <div class="actions">
      <button id="canciones-importar" class="primary" disabled={busy} onclick={importSongs}>Importar canciones</button>
      <button id="canciones-exportar" disabled={busy} onclick={exportSongs}>Exportar canciones</button>
    </div>
    <p class="note">Las canciones de Holyrics se suman cuando tengamos un archivo exportado de ejemplo.</p>
  </section>

  <section>
    <h3>Biblias</h3>
    <p>Importá una versión en formato USFM, con un archivo por libro. Podés elegir todos los archivos juntos.</p>
    <div class="fields">
      <input id="biblia-nombre" maxlength="60" placeholder="Nombre: Reina-Valera 1960" bind:value={bibleName} />
      <input id="biblia-sigla" maxlength="12" placeholder="Sigla: RVR1960" bind:value={bibleCode} />
    </div>
    <label class="legal">
      <input id="biblia-acepto" type="checkbox" bind:checked={accepted} />
      Tengo derecho a usar esta versión. Muchas traducciones tienen derechos de autor y cargarlas es mi responsabilidad.
    </label>
    <div class="actions">
      <button id="biblia-importar" class="primary" disabled={busy || !canImportBible} onclick={importBible}>
        Elegir archivos e importar
      </button>
    </div>
    {#if imported.length}
      <ul id="biblias-importadas">
        {#each imported as bible (bible.code)}
          <li>
            <span><b>{bible.code}</b> {bible.name}</span>
            {#if confirmRemove === bible.code}
              <button class="live" onclick={() => removeBible(bible.code)}>Sí, borrar</button>
              <button onclick={() => (confirmRemove = '')}>No</button>
            {:else}
              <button data-borrar-biblia onclick={() => (confirmRemove = bible.code)}>Borrar</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Todo</h3>
    <p>
      Un solo archivo con canciones, medios, estilos, temporizadores, atajos y biblias importadas, para pasarlo a otra
      PC.
    </p>
    {#if confirmImport}
      <p class="warning" id="datos-confirmar">
        Esto reemplaza todo eso en esta PC. Las biblias de fábrica no se tocan.
      </p>
      <div class="actions">
        <button id="datos-importar-si" class="live" onclick={importAll}>Elegir archivo y reemplazar</button>
        <button onclick={() => (confirmImport = false)}>Cancelar</button>
      </div>
    {:else}
      <div class="actions">
        <button id="datos-exportar" disabled={busy} onclick={exportAll}>Exportar todo</button>
        <button id="datos-importar" disabled={busy} onclick={() => (confirmImport = true)}>Importar todo</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .panel {
    display: grid;
    align-content: start;
    gap: 12px;
    height: 100%;
    overflow-y: auto;
  }

  section {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 15px;
  }

  p,
  .legal {
    font-size: 13px;
    color: var(--muted);
  }

  .note {
    font-size: 12px;
  }

  .warning {
    color: var(--live);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .actions button {
    padding: 6px 12px;
    font-size: 13px;
  }

  .fields {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 6px;
  }

  .legal {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .legal input {
    flex: none;
    margin-top: 2px;
  }

  ul {
    display: grid;
    gap: 4px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  section ul li {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 4px 8px;
    font-size: 13px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  section ul li span {
    margin-right: auto;
  }

  section ul button {
    padding: 2px 10px;
    font-size: 12px;
  }

  .result {
    padding: 8px 12px;
    font-size: 13px;
    border: 1px solid var(--accent);
    border-radius: 8px;
  }

  .result p {
    color: var(--text);
  }

  .result ul {
    margin-top: 6px;
    color: var(--muted);
  }
</style>
