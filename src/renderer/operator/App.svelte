<script lang="ts">
  import type { AppInfo } from '@shared/api';

  let info = $state<AppInfo | null>(null);

  window.ceflirics.getAppInfo().then((value) => (info = value));
</script>

<main>
  <h1>CEFLIRICS</h1>
  <p>Consola del operador</p>
  {#if info}
    <small>Versión {info.version} · Electron {info.electron}</small>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0e1320;
    color: #e7ebf3;
    font-family: system-ui, 'Segoe UI', sans-serif;
  }

  main {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    min-height: 100vh;
  }

  h1 {
    margin: 0;
    letter-spacing: 0.08em;
  }

  p {
    margin: 0;
    color: #f2b544;
  }

  small {
    color: #8d97ab;
  }
</style>
