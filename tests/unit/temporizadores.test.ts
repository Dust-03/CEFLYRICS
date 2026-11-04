import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { openDatabase, type Db } from '../../src/main/db/database';
import { TimerService } from '../../src/main/timers';
import { initialState, parseAction, reduce } from '../../src/shared/state';
import { formatRemaining, nextClockTarget, remainingMs, type TimerRun } from '../../src/shared/timers';

const run = (id: string, endsAt: number | null = 10_000): TimerRun => ({
  id,
  label: 'Culto',
  message: '',
  endsAt,
  remainingMs: 5000,
});

test.each([
  [0, '00:00'],
  [1, '00:01'],
  [999, '00:01'],
  [1000, '00:01'],
  [1001, '00:02'],
  [59_500, '01:00'],
  [300_000, '05:00'],
  [3_600_000, '1:00:00'],
  [3_725_000, '1:02:05'],
])('%i ms se ve como %s', (ms, text) => {
  expect(formatRemaining(ms)).toBe(text);
});

test('lo que falta sale de la hora real, y en pausa queda fijo', () => {
  expect(remainingMs(run('a', 10_000), 4000)).toBe(6000);
  expect(remainingMs(run('a', 10_000), 12_000)).toBe(0);
  expect(remainingMs(run('a', null), 999_999)).toBe(5000);
});

test('la hora objetivo es hoy si no pasó, y mañana si ya pasó', () => {
  const now = new Date(2026, 10, 3, 18, 30, 0).getTime();
  expect(nextClockTarget('19:00', now)).toBe(new Date(2026, 10, 3, 19, 0, 0).getTime());
  expect(nextClockTarget('18:30', now)).toBe(new Date(2026, 10, 4, 18, 30, 0).getTime());
  expect(nextClockTarget('08:00', now)).toBe(new Date(2026, 10, 4, 8, 0, 0).getTime());
  expect(nextClockTarget('25:00', now)).toBeNull();
  expect(nextClockTarget('', now)).toBeNull();
});

test('varios temporizadores corren a la vez y solo uno se ve', () => {
  let state = reduce(initialState, { type: 'timer-run', run: run('a') });
  state = reduce(state, { type: 'timer-run', run: run('b') });
  expect(state.timers.map((item) => item.id)).toEqual(['a', 'b']);

  state = reduce(state, { type: 'timer-show', id: 'a', layout: 'full' });
  state = reduce(state, { type: 'timer-show', id: 'b', layout: 'corner' });
  expect(state.shownTimer).toEqual({ id: 'b', layout: 'corner' });

  state = reduce(state, { type: 'timer-run', run: run('a', null) });
  expect(state.timers).toHaveLength(2);
  expect(state.timers.find((item) => item.id === 'a')?.endsAt).toBeNull();
});

test('no se muestra un temporizador que no existe, y detener el visible lo saca', () => {
  expect(reduce(initialState, { type: 'timer-show', id: 'x', layout: 'full' })).toBe(initialState);
  let state = reduce(initialState, { type: 'timer-run', run: run('a') });
  state = reduce(state, { type: 'timer-show', id: 'a', layout: 'full' });
  state = reduce(state, { type: 'timer-stop', id: 'a' });
  expect(state).toMatchObject({ timers: [], shownTimer: null });
});

test('ESC saca el temporizador de pantalla pero sigue corriendo', () => {
  let state = reduce(initialState, { type: 'timer-run', run: run('a') });
  state = reduce(state, { type: 'timer-show', id: 'a', layout: 'corner' });
  state = reduce(state, { type: 'clear' });
  expect(state.shownTimer).toBeNull();
  expect(state.timers).toHaveLength(1);
});

test('las acciones de temporizador inválidas se rechazan', () => {
  expect(parseAction({ type: 'timer-run', run: { id: 'a' } })).toBeNull();
  expect(parseAction({ type: 'timer-run', run: { ...run('a'), remainingMs: -1 } })).toBeNull();
  expect(parseAction({ type: 'timer-show', id: 'a', layout: 'gigante' })).toBeNull();
  expect(parseAction({ type: 'timer-run', run: run('a') })).toEqual({ type: 'timer-run', run: run('a') });
});

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-timers-'));
  db = openDatabase(join(dir, 'prueba.db'));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('guarda, edita y borra temporizadores', () => {
  const timers = new TimerService(db);
  const base = { name: 'Culto', kind: 'clock' as const, seconds: 0, clock: '19:00', message: 'Comenzamos' };
  const id = timers.save(base);
  timers.save({ name: 'Ofrenda', kind: 'duration', seconds: 90, clock: '', message: '' });
  expect(timers.list().map((t) => t.name)).toEqual(['Culto', 'Ofrenda']);

  timers.save({ ...base, id, clock: '20:30' });
  expect(timers.list()[0]).toMatchObject({ id, clock: '20:30' });

  timers.remove(id);
  expect(timers.list()).toHaveLength(1);
});

test('no guarda un temporizador incompleto', () => {
  const timers = new TimerService(db);
  const base = { name: 'Culto', kind: 'duration' as const, seconds: 60, clock: '', message: '' };
  expect(() => timers.save({ ...base, name: ' ' })).toThrow(/nombre/);
  expect(() => timers.save({ ...base, seconds: 0 })).toThrow(/duración/);
  expect(() => timers.save({ ...base, kind: 'clock', clock: '99:99' })).toThrow(/hora/);
});
