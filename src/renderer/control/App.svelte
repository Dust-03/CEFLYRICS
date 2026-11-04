<script lang="ts">
  import { forgetToken, pair, savedToken, type Connection } from './connection';
  import Remote from './Remote.svelte';

  const startToken = savedToken();
  const linkPin = new URLSearchParams(location.search).get('pin') ?? '';
  const nativeApp = (window as Window & { CefApp?: { reset: () => void } }).CefApp;

  let token = $state(startToken);
  let pin = $state(linkPin);
  let error = $state('');
  let busy = $state(false);
  let connection = $state<Connection | null>(null);

  const MESSAGES = {
    pin: 'El PIN no coincide. Miralo en Transmisión, en la PC.',
    locked: 'Demasiados intentos. Esperá un minuto.',
    offline: 'No se pudo llegar a la PC.',
  };

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    busy = true;
    error = '';
    const result = await pair(pin.trim());
    busy = false;
    if (result === 'ok') token = savedToken();
    else error = MESSAGES[result];
  }

  function leave() {
    connection?.stop();
    connection = null;
    forgetToken();
    token = null;
    pin = '';
  }

  // Sale de la pantalla el PIN que vino en el enlace, para que no quede en el historial.
  if (linkPin && !startToken) {
    history.replaceState(null, '', location.pathname);
    submit();
  }
</script>

{#if token}
  <Remote
    {token}
    onConnection={(value) => (connection = value)}
    onRejected={() => {
      leave();
      error = 'Se cambió el PIN en la PC. Volvé a vincular este celular.';
    }}
    onLeave={leave}
  />
{:else}
  <form class="pair" onsubmit={submit}>
    <h1>Control de CEFLIRICS</h1>
    <p>Escribí el PIN que aparece en la PC, en el menú Transmisión.</p>
    <input
      id="control-pin"
      inputmode="numeric"
      autocomplete="off"
      maxlength="6"
      placeholder="000000"
      aria-label="PIN"
      bind:value={pin}
    />
    <button id="control-vincular" class="primary" disabled={busy || pin.trim().length !== 6}>Vincular</button>
    {#if error}<p id="control-error" class="error">{error}</p>{/if}
    {#if nativeApp}<button type="button" onclick={() => nativeApp.reset()}>Elegir otra PC</button>{/if}
  </form>
{/if}

<style>
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    max-width: 340px;
    padding: 48px 20px;
    margin: 0 auto;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  input {
    box-sizing: border-box;
    width: 100%;
    font-size: 34px;
    text-align: center;
    letter-spacing: 0.2em;
  }

  button {
    padding: 12px;
    font-size: 17px;
  }

  .error {
    color: var(--live);
  }
</style>
