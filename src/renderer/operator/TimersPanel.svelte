<script lang="ts">
  import type { OnAirState } from '@shared/state';
  import type { Theme } from '@shared/theme';
  import {
    createTimerRun,
    formatRemaining,
    remainingMs,
    type TimerConfig,
    type TimerLayout,
    type TimerRun,
  } from '@shared/timers';

  type Props = { onAir: OnAirState; theme: Theme | undefined; active: boolean };
  let { onAir, theme, active }: Props = $props();

  const api = window.ceflirics;
  const EMPTY = {
    id: undefined as number | undefined,
    name: '',
    kind: 'duration',
    minutes: 5,
    secs: 0,
    clock: '19:00',
    message: '',
  };

  let timers = $state<TimerConfig[]>([]);
  let form = $state<typeof EMPTY | null>(null);
  let error = $state('');
  let confirmDelete = $state<number>();
  let now = $state(Date.now());

  async function refresh() {
    timers = await api.timers.list();
  }
  refresh();
  api.timers.onChange(refresh);

  $effect(() => {
    if (!active || !onAir.timers.length) return;
    now = Date.now();
    const ticker = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(ticker);
  });

  const runOf = (timer: TimerConfig) => onAir.timers.find((run) => run.id === String(timer.id));
  const isShown = (timer: TimerConfig, layout: TimerLayout) =>
    onAir.shownTimer?.id === String(timer.id) && onAir.shownTimer.layout === layout;

  function idleLabel(timer: TimerConfig) {
    return timer.kind === 'clock' ? `Hasta las ${timer.clock}` : formatRemaining(timer.seconds * 1000);
  }

  function start(timer: TimerConfig) {
    const paused = runOf(timer);
    if (paused && paused.endsAt === null) {
      const run = { ...$state.snapshot(paused), endsAt: Date.now() + paused.remainingMs };
      api.dispatch({ type: 'timer-run', run });
      return;
    }
    const run = createTimerRun($state.snapshot(timer), Date.now(), $state.snapshot(theme));
    if (run) api.dispatch({ type: 'timer-run', run });
  }

  function pause(run: TimerRun) {
    api.dispatch({
      type: 'timer-run',
      run: { ...$state.snapshot(run), endsAt: null, remainingMs: remainingMs(run, Date.now()) },
    });
  }

  function toggleShow(timer: TimerConfig, layout: TimerLayout) {
    if (isShown(timer, layout)) {
      api.dispatch({ type: 'timer-hide' });
      return;
    }
    if (!runOf(timer)) start(timer);
    api.dispatch({ type: 'timer-show', id: String(timer.id), layout });
  }

  function edit(timer: TimerConfig) {
    form = {
      id: timer.id,
      name: timer.name,
      kind: timer.kind,
      minutes: Math.floor(timer.seconds / 60),
      secs: timer.seconds % 60,
      clock: timer.clock || '19:00',
      message: timer.message,
    };
    error = '';
  }

  async function save() {
    if (!form) return;
    try {
      await api.timers.save({
        id: form.id,
        name: form.name,
        kind: form.kind as TimerConfig['kind'],
        seconds: Math.max(0, Number(form.minutes) || 0) * 60 + Math.max(0, Number(form.secs) || 0),
        clock: form.clock,
        message: form.message,
      });
      form = null;
      await refresh();
    } catch (err) {
      error = (err as Error).message.replace(/^.*Error: /, '');
    }
  }

  async function remove(timer: TimerConfig) {
    api.dispatch({ type: 'timer-stop', id: String(timer.id) });
    await api.timers.remove(timer.id);
    confirmDelete = undefined;
    await refresh();
  }
</script>

<div class="panel">
  <div>
    <button
      id="temporizador-nuevo"
      class="primary"
      onclick={() => {
        form = { ...EMPTY };
        error = '';
      }}
    >
      + Nuevo temporizador
    </button>
  </div>

  {#if form}
    <div class="form" id="temporizador-form">
      <input
        id="temporizador-nombre"
        type="text"
        placeholder="Nombre, por ejemplo: Comienza el culto"
        bind:value={form.name}
      />
      <div class="kinds" role="radiogroup" aria-label="Tipo">
        <label class:active={form.kind === 'duration'}>
          <input type="radio" name="tipo" value="duration" bind:group={form.kind} />
          <strong>Duración</strong>
          <small>Ponés un tiempo y arranca</small>
        </label>
        <label class:active={form.kind === 'clock'}>
          <input id="temporizador-tipo-hora" type="radio" name="tipo" value="clock" bind:group={form.kind} />
          <strong>Hasta una hora</strong>
          <small>Cuenta atrás hasta esa hora</small>
        </label>
      </div>
      {#if form.kind === 'duration'}
        <div class="row">
          <label>Minutos <input id="temporizador-minutos" type="number" min="0" bind:value={form.minutes} /></label>
          <label
            >Segundos <input id="temporizador-segundos" type="number" min="0" max="59" bind:value={form.secs} /></label
          >
        </div>
      {:else}
        <div class="row">
          <label>Hora <input id="temporizador-hora" type="time" bind:value={form.clock} /></label>
        </div>
      {/if}
      <input
        id="temporizador-mensaje"
        type="text"
        placeholder="Mensaje al llegar a cero (opcional): ¡Comenzamos!"
        bind:value={form.message}
      />
      {#if error}<p id="temporizador-error" class="error">{error}</p>{/if}
      <div class="actions">
        <button id="temporizador-guardar" class="primary" onclick={save}>Guardar</button>
        <button onclick={() => (form = null)}>Cancelar</button>
      </div>
    </div>
  {/if}

  <ul id="temporizadores">
    {#each timers as timer (timer.id)}
      {@const run = runOf(timer)}
      {@const left = run ? remainingMs(run, now) : 0}
      <li class="timer" class:running={run?.endsAt} class:on-air={onAir.shownTimer?.id === String(timer.id)}>
        <div class="info">
          <strong>{timer.name}</strong>
          <small>{timer.kind === 'clock' ? `Hasta las ${timer.clock}` : 'Duración'}</small>
        </div>
        <div class="time">{run ? formatRemaining(left) : idleLabel(timer)}</div>
        <div class="controls">
          {#if run?.endsAt && timer.kind === 'duration'}
            <button data-pausar onclick={() => pause(run)}>Pausa</button>
          {:else if !run?.endsAt}
            <button data-iniciar class="primary" onclick={() => start(timer)}>{run ? 'Seguir' : 'Iniciar'}</button>
          {/if}
          {#if run}
            <button data-detener onclick={() => api.dispatch({ type: 'timer-stop', id: String(timer.id) })}
              >Detener</button
            >
          {/if}
          <button data-completa class:live={isShown(timer, 'full')} onclick={() => toggleShow(timer, 'full')}>
            Pantalla completa
          </button>
          <button data-esquina class:live={isShown(timer, 'corner')} onclick={() => toggleShow(timer, 'corner')}>
            En la esquina
          </button>
          <button data-editar onclick={() => edit(timer)}>Editar</button>
          {#if confirmDelete === timer.id}
            <button data-borrar-si class="live" onclick={() => remove(timer)}>Sí, borrar</button>
            <button onclick={() => (confirmDelete = undefined)}>No</button>
          {:else}
            <button data-borrar onclick={() => (confirmDelete = timer.id)}>Borrar</button>
          {/if}
        </div>
      </li>
    {:else}
      {#if !form}
        <li class="empty">Creá un temporizador: por duración, o hasta una hora del culto.</li>
      {/if}
    {/each}
  </ul>
</div>

<style>
  .panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
  }

  .form {
    display: grid;
    gap: 8px;
    padding: 12px;
    background: var(--surface-2);
    border-radius: 10px;
  }

  .kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .kinds label {
    display: grid;
    gap: 1px;
    padding: 8px 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: pointer;
  }

  .kinds label.active {
    border-color: var(--accent);
  }

  .kinds input {
    position: absolute;
    opacity: 0;
  }

  small {
    color: var(--muted);
  }

  .row {
    display: flex;
    gap: 12px;
  }

  .row label {
    display: grid;
    gap: 3px;
    font-size: 13px;
    color: var(--muted);
  }

  .row input {
    width: 110px;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .error {
    margin: 0;
    color: var(--live);
  }

  ul {
    display: grid;
    align-content: start;
    gap: 8px;
    margin: 0;
    padding: 2px;
    overflow-y: auto;
    list-style: none;
  }

  .timer {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) auto;
    align-items: center;
    gap: 6px 12px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
  }

  .timer.running {
    border-color: var(--accent);
  }

  .timer.on-air {
    border-color: var(--live);
  }

  .info {
    display: grid;
  }

  .time {
    font-size: 26px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    grid-column: 1 / -1;
    gap: 5px;
  }

  .controls button {
    padding: 4px 9px;
    font-size: 13px;
  }

  .empty {
    padding: 32px 12px;
    color: var(--muted);
    text-align: center;
  }
</style>
