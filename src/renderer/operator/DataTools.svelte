<script lang="ts">
  import type { DataCounts, DataResult } from '@shared/api';

  const api = window.ceflyrics.data;

  let confirming = $state(false);
  let busy = $state(false);
  let message = $state('');

  const summary = ({ songs, media, themes, timers, shortcuts }: DataCounts) =>
    `${songs} canciones, ${media} medios, ${themes} estilos, ${timers} temporizadores y ${shortcuts} atajos`;

  async function run(action: () => Promise<DataResult>, done: (counts: DataCounts) => void) {
    busy = true;
    message = '';
    const result = await action();
    busy = false;
    if ('error' in result) message = result.error;
    else if ('counts' in result) done(result.counts);
  }

  const exportData = () => run(api.export, (counts) => (message = `Se guardaron ${summary(counts)}.`));

  function importData() {
    confirming = false;
    // La consola se vuelve a abrir para mostrar los datos nuevos.
    run(api.import, () => location.reload());
  }
</script>

<div class="tools">
  {#if confirming}
    <span id="datos-confirmar">Esto reemplaza las canciones, medios, estilos, temporizadores y atajos de esta PC.</span>
    <button id="datos-importar-si" class="live" onclick={importData}>Elegir archivo y reemplazar</button>
    <button onclick={() => (confirming = false)}>Cancelar</button>
  {:else}
    {#if message}<span id="datos-mensaje">{message}</span>{/if}
    <button id="datos-exportar" disabled={busy} onclick={exportData}>Exportar datos</button>
    <button id="datos-importar" disabled={busy} onclick={() => (confirming = true)}>Importar datos</button>
  {/if}
</div>

<style>
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: flex-end;
    font-size: 13px;
    color: var(--muted);
  }

  button {
    padding: 4px 10px;
    font-size: 13px;
  }
</style>
