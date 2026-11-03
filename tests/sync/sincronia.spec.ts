import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  Operator,
  SCREENS,
  TOKEN,
  closeScreens,
  loadAndPlay,
  measureSpread,
  openScreens,
  screenStats,
} from './helpers';

const WARMUP_MS = 3000;
// Objetivo de CLAUDE.md: un cuadro de diferencia a 30 fps.
const MAX_SPREAD_MS = 34;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let operator: Operator;

test.beforeEach(async () => {
  operator = await Operator.connect();
});

test.afterEach(async () => {
  operator.cmd('load', { media: null });
  operator.close();
});

test('tres pantallas con relojes desfasados van juntas, incluso en los loops', async ({ browser }) => {
  const pages = await openScreens(browser);
  await loadAndPlay(operator, pages);
  await sleep(WARMUP_MS);

  const result = await measureSpread(pages, 20_000);
  const stats = await Promise.all(pages.map(screenStats));
  console.log('Dispersión:', result, 'loops:', stats.map((s) => s.loops), 'saltos:', stats.map((s) => s.seeks));

  expect(Math.min(...stats.map((s) => s.loops))).toBeGreaterThanOrEqual(2);
  expect(result.p95).toBeLessThanOrEqual(MAX_SPREAD_MS);
  await closeScreens(pages);
});

// Control de la medición: si una pantalla va corrida de verdad, la prueba tiene que verlo.
test('la medición detecta una pantalla corrida 150 ms', async ({ browser }) => {
  const pages = await openScreens(browser, [SCREENS[0], { nombre: 'Corrida', lat: 150 }]);
  await loadAndPlay(operator, pages);
  await sleep(WARMUP_MS);

  const result = await measureSpread(pages, 4000);
  console.log('Pantalla corrida:', result);

  expect(result.p50).toBeGreaterThan(110);
  expect(result.p50).toBeLessThan(190);
  await closeScreens(pages);
});

test('una pantalla que pierde la conexión vuelve en menos de 2 s y no se desincroniza', async ({ browser }) => {
  const pages = await openScreens(browser);
  await loadAndPlay(operator, pages);
  await sleep(WARMUP_MS);

  const cutAt = Date.now();
  await pages[1].evaluate(() => (window as any).__cef.dropConnection());
  await expect.poll(() => operator.displays.length, { intervals: [50] }).toBeLessThan(pages.length);
  await expect.poll(() => operator.displays.length, { timeout: 2000, intervals: [50] }).toBe(pages.length);
  const reconnectMs = Date.now() - cutAt;

  const result = await measureSpread(pages, 3000);
  console.log('Reconexión:', reconnectMs, 'ms', result);

  expect(reconnectMs).toBeLessThan(2000);
  expect(result.p95).toBeLessThanOrEqual(MAX_SPREAD_MS);
  await closeScreens(pages);
});

test('la pausa deja todas las pantallas en la posición del servidor y se puede reanudar', async ({ browser }) => {
  const pages = await openScreens(browser);
  await loadAndPlay(operator, pages);
  await sleep(WARMUP_MS);

  operator.cmd('pause');
  await expect.poll(() => operator.state?.playing).toBe(false);
  await sleep(700);

  const anchor = operator.state!.anchorPos;
  const epoch = Date.now();
  const positions = await Promise.all(
    pages.map((page) => page.evaluate((at) => (window as any).__cef.positionAtEpoch(at), epoch)),
  );
  console.log('Pausa en', anchor, 'posiciones:', positions);
  expect(anchor).toBeGreaterThan(1);
  for (const position of positions) expect(Math.abs(position - anchor)).toBeLessThan(0.05);

  operator.cmd('play');
  await sleep(WARMUP_MS);
  const result = await measureSpread(pages, 3000);
  console.log('Después de reanudar:', result);
  expect(result.p95).toBeLessThanOrEqual(MAX_SPREAD_MS);
  await closeScreens(pages);
});

test('con repetir apagado el video frena al terminar', async ({ browser }) => {
  const pages = await openScreens(browser);
  await loadAndPlay(operator, pages);
  operator.cmd('loop', { value: false });
  await expect.poll(() => operator.state?.loop).toBe(false);
  await expect.poll(() => operator.state?.duration).toBeGreaterThan(0);
  operator.cmd('seek', { position: operator.state!.duration - 1 });
  await sleep(2500);

  const stats = await Promise.all(pages.map(screenStats));
  const ended = await Promise.all(pages.map((page) => page.evaluate(() => document.querySelector<HTMLVideoElement>('video:not(.atras)')!.ended)));
  expect(ended).toEqual(pages.map(() => true));
  expect(stats.map((s) => s.loops)).toEqual(pages.map(() => 0));
  await closeScreens(pages);
});

test('sin el token no se puede operar ni subir archivos', async ({ request }) => {
  const upload = await request.put(`${BASE_URL}/api/media/intruso.mp4`, { data: 'x', headers: { 'x-token': 'malo' } });
  expect(upload.status()).toBe(401);

  const messages: { t: string }[] = [];
  const ws = new WebSocket(`${BASE_URL.replace('http', 'ws')}/ws`);
  ws.onmessage = (ev) => messages.push(JSON.parse(String(ev.data)));
  await new Promise((resolve) => (ws.onopen = resolve));
  ws.send(JSON.stringify({ t: 'hello', role: 'operator', token: `${TOKEN}-malo` }));
  await expect.poll(() => messages.map((m) => m.t)).toContain('error');
  await expect.poll(() => ws.readyState).toBe(WebSocket.CLOSED);

  // Una pantalla tampoco puede mandar comandos.
  const display = new WebSocket(`${BASE_URL.replace('http', 'ws')}/ws`);
  const replies: { t: string }[] = [];
  display.onmessage = (ev) => replies.push(JSON.parse(String(ev.data)));
  await new Promise((resolve) => (display.onopen = resolve));
  display.send(JSON.stringify({ t: 'hello', role: 'display', name: 'Intruso' }));
  display.send(JSON.stringify({ t: 'cmd', action: 'black', value: true }));
  await expect.poll(() => replies.map((m) => m.t)).toContain('error');
  expect(operator.state?.black ?? false).toBe(false);
  display.close();
});

