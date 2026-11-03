import { expect, type Browser, type Page } from '@playwright/test';

export const TOKEN = 'test';
export const VIDEO = 'patron-prueba-8s.mp4';
export const BASE_URL = 'http://localhost:8799';

// Reloj desfasado (ms), deriva (ppm), jitter de red (ms) y latencia de salida (ms).
export type ScreenConfig = { nombre: string; skew?: number; drift?: number; jitter?: number; lat?: number };

export const SCREENS: ScreenConfig[] = [
  { nombre: 'Prueba 1' },
  { nombre: 'Prueba 2', skew: 2000, drift: 80, jitter: 20 },
  { nombre: 'Prueba 3', skew: -2000, drift: -120, jitter: 40 },
];

export type ServerState = { media: string | null; playing: boolean; anchorPos: number; duration: number; loop: boolean; black: boolean };

export class Operator {
  state: ServerState | null = null;
  displays: { name: string }[] = [];

  private constructor(private ws: WebSocket) {}

  static async connect() {
    const ws = new WebSocket(`${BASE_URL.replace('http', 'ws')}/ws`);
    const operator = new Operator(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.t === 'state') operator.state = msg.state;
      if (msg.t === 'displays') operator.displays = msg.displays;
    };
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.send(JSON.stringify({ t: 'hello', role: 'operator', token: TOKEN }));
    await expect.poll(() => operator.state).not.toBeNull();
    return operator;
  }

  cmd(action: string, extra: object = {}) {
    this.ws.send(JSON.stringify({ t: 'cmd', action, ...extra }));
  }

  close() {
    this.ws.close();
  }
}

// Cada pantalla va en su propio contexto, como un equipo aparte.
export async function openScreens(browser: Browser, configs: ScreenConfig[] = SCREENS) {
  const pages: Page[] = [];
  for (const config of configs) {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    const query = new URLSearchParams(Object.entries(config).map(([k, v]) => [k, String(v)]));
    await page.goto(`/pantalla?${query}`);
    pages.push(page);
  }
  return pages;
}

export async function closeScreens(pages: Page[]) {
  await Promise.all(pages.map((page) => page.context().close()));
}

export async function loadAndPlay(operator: Operator, pages: Page[], position = 0) {
  operator.cmd('loop', { value: true });
  operator.cmd('load', { media: VIDEO });
  await expect.poll(() => operator.state?.media).toBe(VIDEO);
  await Promise.all(pages.map((page) => page.waitForFunction(() => (window as any).__cef?.ready, null, { timeout: 30_000 })));
  operator.cmd('play', { position });
  await expect.poll(() => operator.state?.playing).toBe(true);
}

// Posición de cada pantalla en un mismo instante real, en ms y relativa a la primera.
// Todas comparten el reloj real de la PC: es la diferencia verdadera, no la que cree cada una.
export async function sampleOffsets(pages: Page[]) {
  const epoch = Date.now();
  const samples = await Promise.all(
    pages.map((page) =>
      page.evaluate((at) => {
        const cef = (window as any).__cef;
        return { position: cef.positionAtEpoch(at), duration: cef.duration, loop: cef.loop };
      }, epoch),
    ),
  );
  const { position: first, duration, loop } = samples[0];
  return samples.map((s) => {
    let diff = s.position - first;
    if (loop && duration) diff = ((((diff + duration / 2) % duration) + duration) % duration) - duration / 2;
    return diff * 1000;
  });
}

export async function measureSpread(pages: Page[], durationMs: number, sampleMs = 100) {
  const spreads: number[] = [];
  const until = Date.now() + durationMs;
  while (Date.now() < until) {
    const offsets = await sampleOffsets(pages);
    spreads.push(Math.max(...offsets) - Math.min(...offsets));
    await new Promise((resolve) => setTimeout(resolve, sampleMs));
  }
  const sorted = [...spreads].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { samples: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

export const screenStats = (page: Page) => page.evaluate(() => (window as any).__cef.stats());
