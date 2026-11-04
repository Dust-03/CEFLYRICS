<script lang="ts">
  import QRCode from 'qrcode';
  import { lanAddress, parsePort, type LanInfo } from '@shared/lan';

  const api = window.ceflirics.lan;

  let info = $state<LanInfo | null>(null);
  let portText = $state('');
  let qr = $state('');
  let copied = $state(false);

  function update(value: LanInfo) {
    // Cada pantalla que entra avisa: eso no tiene que borrar lo que se está escribiendo.
    if (value.port !== info?.port) portText = String(value.port);
    info = value;
  }
  api.info().then(update);
  api.onInfo(update);

  const main = $derived(info?.addresses[0]);
  const others = $derived(info?.addresses.slice(1) ?? []);
  const address = $derived(info && main ? lanAddress(main.ip, info.port) : '');
  const newPort = $derived(parsePort(portText));
  const canSavePort = $derived(!!newPort && newPort !== info?.port);

  $effect(() => {
    const url = `http://${address}`;
    if (!address) qr = '';
    else QRCode.toDataURL(url, { margin: 1, width: 280 }).then((value) => (qr = value));
  });

  async function copy() {
    await navigator.clipboard.writeText(address);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function savePort(event: SubmitEvent) {
    event.preventDefault();
    if (newPort) api.setPort(newPort);
  }
</script>

{#if info}
  <div class="panel" id="transmision">
    <header>
      <h2>Transmisión</h2>
      <span id="lan-estado" class="pill {info.status}">
        {#if info.status === 'on'}Transmitiendo{:else if info.status === 'busy'}Puerto ocupado{:else}Apagada{/if}
      </span>
      <button id="lan-encender" onclick={() => api.setEnabled(info?.status === 'off')}>
        {info.status === 'off' ? 'Encender' : 'Apagar'}
      </button>
    </header>

    {#if info.status === 'busy'}
      <p class="alert" id="lan-ocupado">
        Otro programa está usando el puerto {info.port}. Se vuelve a probar solo cada 5 segundos; si sigue así, cerrá
        ese programa o elegí otro puerto abajo.
      </p>
    {/if}
    {#if info.previousIp}
      <p class="alert" id="lan-cambio">
        La dirección de esta PC cambió: antes era {info.previousIp}. En la tele hay que escribir la nueva.
      </p>
    {/if}

    {#if !main}
      <p class="alert" id="lan-sin-red">Esta PC no está conectada a ninguna red. Conectala al router o al Wi-Fi.</p>
    {:else if info.status !== 'off'}
      <section class="hero">
        <div class="address">
          <span class="label">En el navegador de la tele escribí</span>
          <strong id="lan-direccion">{address}</strong>
          <button id="lan-copiar" onclick={copy}>{copied ? 'Copiada' : 'Copiar'}</button>
        </div>
        {#if qr}
          <figure>
            <img id="lan-qr" src={qr} alt={`Código QR de ${address}`} />
            <figcaption>O escaneá con el celular</figcaption>
          </figure>
        {/if}
      </section>

      <ol>
        <li>Conectá la tele al mismo router o Wi-Fi que esta PC.</li>
        <li>Abrí el navegador de la tele y escribí la dirección tal cual, con los dos puntos.</li>
        <li>Apretá OK en el control para pantalla completa. La tele se adapta sola a su resolución.</li>
      </ol>

      {#if others.length}
        <p class="note" id="lan-otras">
          Si no conecta, probá con
          {#each others as other, index (other.ip)}
            {index ? ' o ' : ''}<b>{lanAddress(other.ip, info.port)}</b> ({other.adapter}){/each}.
        </p>
      {/if}
      <p class="note">
        Si Windows pregunta por el firewall, elegí Permitir en redes privadas. Sin eso la tele no llega a esta PC.
      </p>
    {/if}

    <section>
      <h3>Pantallas conectadas ({info.screens.length})</h3>
      {#if info.screens.length}
        <ul id="lan-pantallas">
          {#each info.screens as screen (screen.id)}
            <li>
              <b>{screen.device}</b>
              <span>{screen.ip}</span>
              {#if screen.width}<span>{screen.width} × {screen.height}</span>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="note">Todavía no hay ninguna. Aparecen acá apenas abren la dirección.</p>
      {/if}
    </section>

    <div class="columns">
      <section>
        <h3>Puerto reservado</h3>
        <form onsubmit={savePort}>
          <input id="lan-puerto" inputmode="numeric" aria-label="Puerto" bind:value={portText} />
          <button id="lan-puerto-guardar" disabled={!canSavePort}>Guardar</button>
        </form>
        <p class="note">
          {#if portText && !newPort}
            Tiene que ser un número entre 1024 y 65535.
          {:else}
            Es siempre este, todos los días. Cambialo solo si otro programa lo usa.
          {/if}
        </p>
      </section>
      {#if main}
        <section>
          <h3>Para que la IP tampoco cambie</h3>
          <p class="note">
            La IP la asigna el router y puede cambiar. En su configuración, buscá "reserva de DHCP" y reservá {main.ip} para
            esta dirección física: <b id="lan-mac">{main.mac}</b>
          </p>
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel {
    display: grid;
    align-content: start;
    gap: 12px;
    height: 100%;
    overflow-y: auto;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  header h2 {
    margin-right: auto;
  }

  header button {
    padding: 4px 12px;
    font-size: 13px;
  }

  .pill {
    padding: 3px 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 999px;
  }

  .pill.on {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }

  .pill.busy {
    color: #fff;
    background: #b3372f;
    border-color: #b3372f;
  }

  .hero {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
  }

  .address {
    display: grid;
    justify-items: start;
    gap: 8px;
    min-width: 0;
  }

  .label {
    font-size: 15px;
    color: var(--muted);
  }

  #lan-direccion {
    font-size: clamp(30px, 4.6vw, 54px);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  .address button {
    padding: 4px 12px;
    font-size: 13px;
  }

  figure {
    display: grid;
    flex: none;
    justify-items: center;
    gap: 4px;
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  /* El QR necesita fondo claro también en modo oscuro. */
  img {
    width: 132px;
    height: 132px;
    background: #fff;
    border-radius: 6px;
  }

  ol {
    display: grid;
    gap: 4px;
    padding-left: 22px;
    margin: 0;
    font-size: 14px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }

  ul {
    display: grid;
    gap: 4px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  ul li {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 6px 10px;
    font-size: 13px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  ul span {
    color: var(--muted);
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 16px;
  }

  form {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }

  form input {
    width: 100px;
  }

  form button {
    padding: 4px 12px;
    font-size: 13px;
  }

  .note {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  .alert {
    padding: 8px 12px;
    margin: 0;
    font-size: 14px;
    border: 1px solid #b3372f;
    border-radius: 8px;
  }
</style>
