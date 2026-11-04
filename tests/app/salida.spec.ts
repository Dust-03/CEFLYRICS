import { createReadStream, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { _electron as electron, chromium, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const SLIDE = {
  body: 'Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito',
  title: 'Juan 3:16 · RV1909',
};

let app: ElectronApplication;
let operator: Page;
let output: Page;

const dispatch = (page: Page, action: object) => page.evaluate((a) => (window as any).ceflyrics.dispatch(a), action);
const layerOn = (name: string) => output.locator(`.cef-${name}.cef-on`);

// Teclas por el camino nativo de Electron: keyboard.press de Playwright entra directo a Chromium
// y no pasa por before-input-event, donde se atienden los atajos.
const pressKey = (page: 'operator' | 'output', keyCode: string) =>
  app.evaluate(
    ({ BrowserWindow }, [target, key]) => {
      const window = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes(target))!;
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    },
    [page, keyCode],
  );

test.beforeEach(async () => {
  // CEF_OUTPUT=window: la salida abre en ventana aunque la PC tenga dos monitores.
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window' } });
  operator = await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  const windows = app.windows();
  output = windows.find((w) => w.url().includes('output'))!;
  operator = windows.find((w) => w.url().includes('operator'))!;
  await output.waitForFunction(() => (window as any).__cefOutput);
});

test.afterEach(async () => {
  await app.close();
});

test('un cambio del operador llega a la salida en menos de 50 ms', async () => {
  const samples: number[] = [];
  for (let i = 0; i < 30; i++) {
    const sentAt = await operator.evaluate(
      (slide) => {
        const at = performance.timeOrigin + performance.now();
        (window as any).ceflyrics.dispatch({ type: 'show-slide', slide });
        return at;
      },
      { ...SLIDE, body: `${SLIDE.body} ${i}` },
    );
    await expect(output.locator('.cef-body')).toHaveText(`${SLIDE.body} ${i}`);
    const receivedAt = await output.evaluate(() => (window as any).__cefOutput.at);
    samples.push(receivedAt - sentAt);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)];
  console.log('Latencia operador → salida:', { p50: samples[15], p95, max: samples.at(-1) });
  expect(p95).toBeLessThan(50);
});

test('el texto de la consola se proyecta y también se ve en la vista al aire', async () => {
  await operator.locator('#tab-texto').click();
  await operator.locator('#cuerpo').fill(SLIDE.body);
  await operator.locator('#titulo').fill(SLIDE.title);
  await operator.locator('#btn-mostrar').click();
  await expect(output.locator('.cef-body')).toHaveText('');
  await operator.locator('#btn-aire').click();

  await expect(output.locator('.cef-body')).toHaveText(SLIDE.body);
  await expect(output.locator('.cef-title')).toHaveText(SLIDE.title);
  await expect(operator.locator('#vista-aire .cef-body')).toHaveText(SLIDE.body);
});

test('F8, F9, F10 y ESC funcionan desde la consola y desde la salida', async () => {
  await dispatch(operator, { type: 'show-slide', slide: SLIDE });
  await expect(layerOn('text')).toHaveCount(1);

  // Con el foco en un campo de texto también tienen que funcionar.
  await operator.locator('#biblia-buscar').focus();
  await pressKey('operator', 'F10');
  await expect(layerOn('black')).toHaveCount(1);
  await pressKey('operator', 'F10');
  await expect(layerOn('black')).toHaveCount(0);
  await expect(layerOn('text')).toHaveCount(1);

  await pressKey('operator', 'F9');
  await expect(layerOn('text')).toHaveCount(0);
  await expect(layerOn('background')).toHaveCount(1);

  await pressKey('operator', 'F8');
  await expect(layerOn('wallpaper')).toHaveCount(1);
  await expect(output.locator('.cef-logo svg path')).toHaveCount(7);
  await expect(output.locator('.cef-logo')).toHaveCSS('mask-image', 'none');

  await pressKey('output', 'Escape');
  await expect(layerOn('wallpaper')).toHaveCount(0);
  await expect(layerOn('text')).toHaveCount(0);
  await expect(output.locator('.cef-body')).toHaveText('');
});

test('la salida no tiene acceso a Node y rechaza acciones inválidas', async () => {
  expect(await output.evaluate(() => typeof (globalThis as any).require)).toBe('undefined');
  await dispatch(output, { type: 'borrar-todo' });
  await dispatch(operator, { type: 'show-slide', slide: { body: 123 } });
  await expect.poll(() => operator.evaluate(() => (window as any).ceflyrics.getState())).toMatchObject({ rev: 0 });
});

test('cerrar la salida no cierra la app, y se puede volver a abrir', async () => {
  await operator.locator('#btn-salida').click();
  await expect(operator.locator('#estado-salida')).toHaveText('Salida cerrada');
  await expect.poll(() => app.windows().length).toBe(1);
  await operator.locator('#btn-salida').click();
  await expect.poll(() => app.windows().length).toBe(2);
  await expect(operator.locator('#estado-salida')).toContainText('Salida en');
});

test('la salida se ve igual en Electron y en un navegador', async () => {
  await dispatch(operator, { type: 'show-slide', slide: SLIDE });
  await expect(layerOn('text')).toHaveCount(1);
  await output.waitForTimeout(500); // que termine la transición
  const size = await output.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scale: devicePixelRatio,
  }));
  const inElectron = await output.screenshot();

  const server = await serveBuiltRenderer();
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:${(server.address() as AddressInfo).port}/output/index.html`);
  await page.evaluate((slide) => (window as any).__cefApply({ rev: 1, slide, mode: 'live' }), SLIDE);
  await page.waitForTimeout(500);
  const inBrowser = await page.screenshot();

  const same = await pixelDiff(page, inElectron, inBrowser);
  console.log('Electron vs navegador:', size, same);

  // Control: si la comparación no ve un cambio de texto, un 0 % no significa nada.
  await page.evaluate((slide) => (window as any).__cefApply({ rev: 2, slide, mode: 'live' }), {
    ...SLIDE,
    body: 'Otro texto distinto',
  });
  await page.waitForTimeout(500);
  const control = await pixelDiff(page, inElectron, await page.screenshot());
  console.log('Control con otro texto:', control);

  await browser.close();
  server.close();
  expect(same.sameSize).toBe(true);
  expect(same.ratio).toBeLessThan(0.01);
  expect(control.ratio).toBeGreaterThan(0.01);
});

function pixelDiff(page: Page, first: Buffer, second: Buffer) {
  return page.evaluate(
    async ([a, b]) => {
      const load = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [imageA, imageB] = [await load(a), await load(b)];
      if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
        return { sameSize: false, ratio: 1 };
      }
      let different = 0;
      for (let i = 0; i < imageA.data.length; i += 4) {
        const delta =
          Math.abs(imageA.data[i] - imageB.data[i]) +
          Math.abs(imageA.data[i + 1] - imageB.data[i + 1]) +
          Math.abs(imageA.data[i + 2] - imageB.data[i + 2]);
        if (delta > 30) different++;
      }
      return { sameSize: true, ratio: different / (imageA.width * imageA.height) };
    },
    [first.toString('base64'), second.toString('base64')],
  );
}

function serveBuiltRenderer() {
  const root = join(process.cwd(), 'out/renderer');
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return new Promise<Server>((resolve) => {
    const server = createServer((req, res) => {
      const file = join(root, normalize(new URL(req.url!, 'http://x').pathname));
      try {
        statSync(file);
      } catch {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, () => resolve(server));
  });
}
