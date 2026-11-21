import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { LanDataRequest } from '@shared/lan';
import { openDatabase, type Db } from '../../src/main/db/database';
import { LanControl } from '../../src/main/lan-control';

// Un celular de mentira: lo que manda la PC queda en sent.
class FakeSocket extends EventEmitter {
  sent: Record<string, unknown>[] = [];
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.emit('close');
  }
  terminate() {
    this.emit('close');
  }
}

let db: Db;
let asked: LanDataRequest[];
let control: LanControl;

beforeEach(() => {
  db = openDatabase(':memory:');
  asked = [];
  control = new LanControl({
    db,
    getState: () => ({}) as never,
    dispatch: () => {},
    methods: {},
    onChange: () => {},
    askPermission: (request) => asked.push(request),
  });
});

afterEach(() => {
  vi.useRealTimers();
  db.close();
});

function connectPhone() {
  const result = control.pair('10.0.0.5', control.pin, 'Celu de Ana');
  if (!('token' in result)) throw new Error('no se vinculó');
  const socket = new FakeSocket();
  control.accept(socket as unknown as WebSocket, '10.0.0.5');
  socket.emit('message', JSON.stringify({ t: 'auth', token: result.token }));
  return socket;
}

// Pide exportar o importar y devuelve lo que contestó la PC.
async function request(socket: FakeSocket, action: string, answer?: () => void, detail?: unknown) {
  const before = socket.sent.length;
  socket.emit('message', JSON.stringify({ id: 7, m: 'data.request', a: [action, detail] }));
  await Promise.resolve();
  answer?.();
  await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(before));
  return socket.sent.at(-1)!.r as { ticket?: string; denied?: true };
}

const lastId = () => asked.at(-1)!.id;

test('muestra en la PC quién pide y qué quiere hacer', async () => {
  const phone = connectPhone();
  await request(phone, 'import', () => control.answer(lastId(), 'deny'));
  expect(asked[0]).toMatchObject({ device: 'Celu de Ana', action: 'import' });
});

test('denegar no da boleto', async () => {
  const phone = connectPhone();
  expect(await request(phone, 'export', () => control.answer(lastId(), 'deny'))).toEqual({ denied: true });
});

test('permitir da un boleto de un solo uso, solo para lo que se pidió', async () => {
  const phone = connectPhone();
  const { ticket } = await request(phone, 'export', () => control.answer(lastId(), 'once'));
  expect(control.useTicket(ticket, 'import')).toBe(false);

  const second = await request(phone, 'export', () => control.answer(lastId(), 'once'));
  expect(control.useTicket(second.ticket, 'export')).toBe(true);
  expect(control.useTicket(second.ticket, 'export')).toBe(false);
  expect(control.list[0].alwaysAllowData).toBe(false);
});

test('permitir siempre ya no pregunta, hasta que se quita el permiso', async () => {
  const phone = connectPhone();
  await request(phone, 'import', () => control.answer(lastId(), 'always'));
  expect(control.list[0].alwaysAllowData).toBe(true);

  const { ticket } = await request(phone, 'import');
  expect(asked).toHaveLength(1);
  expect(control.useTicket(ticket, 'import')).toBe(true);

  control.revokeAlways(control.list[0].id);
  await request(phone, 'export', () => control.answer(lastId(), 'deny'));
  expect(asked).toHaveLength(2);
});

test('si nadie contesta o el celular se va, se cierra el cartel', async () => {
  vi.useFakeTimers();
  const phone = connectPhone();
  const waited = request(phone, 'export', () => vi.advanceTimersByTime(60_000));
  expect(await waited).toEqual({ denied: true });
  expect(asked.at(-1)).toEqual({ id: asked[0].id, cancelled: true });
  vi.useRealTimers();

  const other = connectPhone();
  other.emit('message', JSON.stringify({ id: 8, m: 'data.request', a: ['import'] }));
  await Promise.resolve();
  other.close();
  expect(asked.at(-1)).toMatchObject({ cancelled: true });
});

test('el boleto vence a los dos minutos, y no sirve si se desvinculó el celular', async () => {
  const phone = connectPhone();
  const first = await request(phone, 'export', () => control.answer(lastId(), 'once'));
  vi.useFakeTimers({ now: Date.now() + 121_000 });
  expect(control.useTicket(first.ticket, 'export')).toBe(false);
  vi.useRealTimers();

  const second = await request(phone, 'export', () => control.answer(lastId(), 'once'));

  control.unlink(control.list[0].id);
  expect(control.useTicket(second.ticket, 'export')).toBe(false);
});

test('rechaza acciones que no existen', async () => {
  const phone = connectPhone();
  expect(await request(phone, 'borrar')).toEqual({ denied: true });
  expect(asked).toHaveLength(0);
});

test('las fotos y videos: la PC ve cuántos son, y el boleto sirve uno por archivo', async () => {
  const phone = connectPhone();
  const media = { images: 2, videos: 1, bytes: 5_000_000 };
  const { ticket } = await request(phone, 'media', () => control.answer(lastId(), 'once'), media);
  expect(asked[0]).toMatchObject({ device: 'Celu de Ana', action: 'media', media });
  expect(control.useTicket(ticket, 'export')).toBe(false);

  const second = await request(phone, 'media', () => control.answer(lastId(), 'once'), media);
  expect([1, 2, 3, 4].map(() => control.useTicket(second.ticket, 'media'))).toEqual([true, true, true, false]);
});

test('el boleto de medios dura media hora', async () => {
  const phone = connectPhone();
  const detail = { images: 1, videos: 0, bytes: 1 };
  const first = await request(phone, 'media', () => control.answer(lastId(), 'once'), detail);
  const second = await request(phone, 'media', () => control.answer(lastId(), 'once'), detail);
  vi.useFakeTimers({ now: Date.now() + 29 * 60_000 });
  expect(control.useTicket(first.ticket, 'media')).toBe(true);
  vi.useFakeTimers({ now: Date.now() + 2 * 60_000 });
  expect(control.useTicket(second.ticket, 'media')).toBe(false);
});

test('no pregunta por medios sin archivos, con números raros o con más de 100', async () => {
  const phone = connectPhone();
  for (const detail of [
    undefined,
    { images: 0, videos: 0, bytes: 0 },
    { images: -1, videos: 3, bytes: 1 },
    { images: 1.5, videos: 0, bytes: 1 },
    { images: 101, videos: 0, bytes: 1 },
  ]) {
    expect(await request(phone, 'media', undefined, detail)).toEqual({ denied: true });
  }
  expect(asked).toHaveLength(0);
});
