<script lang="ts">
  import type { DataAnswer, DataAction, MediaDetail } from '@shared/lan';

  type Request = { id: number; device: string; action: DataAction; media?: MediaDetail };

  // Los pedidos de los celulares esperan en fila: se contesta uno por vez.
  let queue = $state<Request[]>([]);
  const current = $derived(queue[0]);

  $effect(() =>
    window.ceflyrics.lan.onDataRequest((request) => {
      if ('cancelled' in request) queue = queue.filter(({ id }) => id !== request.id);
      else queue = [...queue, request];
    }),
  );

  function answer(choice: DataAnswer) {
    if (!current) return;
    window.ceflyrics.lan.answerDataRequest(current.id, choice);
    queue = queue.slice(1);
  }

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  function mediaSummary({ images, videos, bytes }: MediaDetail) {
    const parts = [images && count(images, 'foto', 'fotos'), videos && count(videos, 'video', 'videos')].filter(
      Boolean,
    );
    const size =
      bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
    return `${parts.join(' y ')} (${size})`;
  }

  const titles: Record<DataAction, string> = {
    export: 'exportar todos los datos',
    import: 'importar todos los datos',
    media: 'importar fotos y videos',
  };

  // Al aparecer, el foco queda en Denegar: un Enter sin mirar no entrega ni pisa nada.
  function focusDeny(node: HTMLButtonElement) {
    node.focus();
  }
</script>

{#if current}
  {@const importing = current.action === 'import'}
  <div class="backdrop">
    <div
      id="pedido-datos"
      class="request"
      class:import={importing}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pedido-titulo"
      aria-describedby="pedido-detalle"
    >
      <p class="from">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 18h2" stroke-linecap="round" />
        </svg>
        Pedido desde el celular
      </p>
      <h2 id="pedido-titulo">
        {current.device} quiere {titles[current.action]}
      </h2>
      <p id="pedido-detalle" class="detail">
        {#if current.media}
          Envía {mediaSummary(current.media)} a los medios de esta PC. Se suman a los que ya hay: no se borra nada.
        {:else if importing}
          Envía una copia que <strong>reemplaza</strong> las canciones, medios, estilos, cuentas regresivas, atajos y biblias
          importadas de esta PC. Lo que hay ahora se pierde.
        {:else}
          Se lleva una copia de las canciones, medios, estilos, cuentas regresivas, atajos y biblias importadas de esta
          PC. El PIN y los celulares vinculados no salen.
        {/if}
      </p>
      <div class="actions">
        <button id="pedido-permitir" class="primary" onclick={() => answer('once')}>Permitir</button>
        <button id="pedido-siempre" onclick={() => answer('always')}>
          Permitir siempre de este dispositivo ({current.device})
        </button>
        <button id="pedido-denegar" class="deny" use:focusDeny onclick={() => answer('deny')}>Denegar</button>
      </div>
      {#if queue.length > 1}
        <p class="more">{queue.length - 1} pedido{queue.length > 2 ? 's' : ''} más esperando</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, var(--bg) 72%, transparent);
    backdrop-filter: blur(3px);
  }

  /* Como la luz de tally: oro si se lleva algo, rojo si pisa lo de esta PC. */
  .request {
    --tone: var(--accent);
    width: min(460px, 100%);
    padding: 18px 20px 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-top: 4px solid var(--tone);
    border-radius: var(--radius-lg);
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.35);
    animation: arrive 0.22s var(--ease);
  }

  .request.import {
    --tone: var(--live);
  }

  .from {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--tone);
  }

  h2 {
    margin: 0 0 8px;
    font-size: 19px;
    font-weight: 650;
    line-height: 1.3;
    text-wrap: balance;
  }

  .detail {
    margin: 0 0 16px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--muted);
  }

  .detail strong {
    color: var(--text);
  }

  .actions {
    display: grid;
    gap: 6px;
  }

  .actions button {
    padding: 9px 12px;
    text-align: center;
  }

  .deny:hover:enabled {
    border-color: var(--live);
    color: var(--live);
  }

  .more {
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .request {
      animation: none;
    }
  }
</style>
