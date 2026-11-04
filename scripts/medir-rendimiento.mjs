// Mide arranque, memoria, CPU, búsqueda y video de la app compilada. Para comparar antes y después.
// Uso: npm run build && node scripts/medir-rendimiento.mjs [video.mp4]
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from '@playwright/test';

const VIDEO = resolve(process.argv[2] ?? 'tests/.media/patron-prueba-8s.mp4');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'cef-perf-'));
if (existsSync('userdata/ceflirics.db')) {
  for (const name of ['ceflirics.db', 'media']) cpSync(join('userdata', name), join(dir, name), { recursive: true });
}

const started = performance.now();
const app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
await app.firstWindow();
while (app.windows().length < 2) await wait(20);
const op = app.windows().find((w) => w.url().includes('operator'));
const output = app.windows().find((w) => w.url().includes('output'));
await op.locator('button[data-book="43"]').waitFor();
const startup = performance.now() - started;

// Memoria y CPU de todos los procesos de la app, promediando una ventana de tiempo.
async function sample(seconds) {
  await app.evaluate(({ app: a }) => a.getAppMetrics());
  await wait(seconds * 1000);
  const metrics = await app.evaluate(({ app: a }) => a.getAppMetrics());
  return {
    memoriaMB: Math.round(metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024),
    cpu: Number(metrics.reduce((sum, m) => sum + m.cpu.percentCPUUsage, 0).toFixed(1)),
    procesos: metrics.length,
  };
}

const results = { arranqueMs: Math.round(startup) };
await wait(2000);
results.reposo = await sample(5);

await op.locator('#tab-configuracion').click();
await wait(1000);
results.configuracion = await sample(3);

await op.locator('#tab-medios').click();
await wait(1000);
results.medios = await sample(3);

// Búsqueda como un operador: letra por letra, con la CPU frenada para simular una PC modesta.
await op.locator('#tab-biblia').click();
const cdp = await op
  .context()
  .newCDPSession(op)
  .catch(() => null);
async function typeSearch(text) {
  const box = op.locator('#biblia-buscar');
  await box.fill('');
  await wait(300);
  const start = performance.now();
  await box.pressSequentially(text);
  await op.locator('#biblia-versos .verse').first().waitFor();
  await op.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))));
  return Math.round(performance.now() - start);
}
results.busquedaMs = await typeSearch('jehova');
if (cdp) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  results.busquedaCpuLentaMs = await typeSearch('jehova');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
}
await op.locator('#biblia-buscar').fill('');

if (existsSync(VIDEO)) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, VIDEO);
  await op.locator('#tab-medios').click();
  await op.locator('#medio-agregar').click();
  await wait(800);
  await op.locator('#medios .item').first().click();
  await op.locator('#btn-aire').click();
  await wait(2000);
  results.videoAlAire = await sample(6);
  results.videosDecodificando = await Promise.all(
    [op, output].map((page) =>
      page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length),
    ),
  );
  results.videoCuadros = await output.evaluate(() => {
    const q = document.querySelector('.cef-media video')?.getVideoPlaybackQuality();
    return q ? { total: q.totalVideoFrames, perdidos: q.droppedVideoFrames } : null;
  });
}

await app.close();
rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify(results, null, 1));
