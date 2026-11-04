import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  chromium,
  expect,
  test,
  type Browser,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { parse } from 'acorn';

const PORT = 8802;
const OTHER_PORT = 8803;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);
// Un versículo largo de verdad no entra a tamaño normal en ninguna pantalla.
const LONG_TEXT = 'Por tanto, de la manera que el hombre justo camina por la senda antigua, '.repeat(9);

let dir: string;
let app: ElectronApplication;
let operator: Page;
let browser: Browser;

async function launch(port: number | null = PORT) {
  const env = { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } as Record<string, string>;
  delete env.CEF_LAN_PORT;
  if (port) env.CEF_LAN_PORT = String(port);
  app = await electron.launch({ args: ['.'], env });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
}

async function openTv(viewport = { width: 1920, height: 1080 }, port = PORT) {
  const context = await browser.newContext({ viewport });
  const tv = await context.newPage();
  await tv.goto(`http://127.0.0.1:${port}/`);
  return tv;
}

function showText(body: string, title = '') {
  return operator.evaluate(
    ([text, reference]) => window.ceflyrics.dispatch({ type: 'show-slide', slide: { body: text, title: reference } }),
    [body, title],
  );
}

test.beforeAll(async () => {
  browser = await chromium.launch({ channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
});

test.afterAll(async () => {
  await browser.close();
});

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cef-lan-'));
});

test.afterEach(async () => {
  // Una tele abierta sigue buscando la app: en la prueba siguiente se conectaría al mismo puerto.
  for (const context of browser.contexts()) await context.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('el menú muestra lo que hay que escribir en la tele', async () => {
  await launch();
  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-estado')).toHaveText('Transmitiendo');
  await expect(operator.locator('#lan-direccion')).toHaveText(new RegExp(`^\\d+\\.\\d+\\.\\d+\\.\\d+:${PORT}$`));
  await expect(operator.locator('#lan-qr')).toBeVisible();
  await expect(operator.locator('#lan-mac')).toHaveText(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);

  // La dirección que muestra tiene que funcionar: es lo que va a escribir el operador.
  const address = await operator.locator('#lan-direccion').textContent();
  const response = await fetch(`http://${address}/`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('/pantalla.js');
});

test('la tele muestra lo que está al aire y aparece en el menú con su resolución', async () => {
  await launch();
  await showText('Jehová es mi pastor', 'Salmos 23:1');
  const tv = await openTv({ width: 1280, height: 720 });
  await expect(tv.locator('.cef-body')).toHaveText('Jehová es mi pastor');
  await expect(tv.locator('.cef-title')).toHaveText('Salmos 23:1');

  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-pantallas li')).toHaveCount(1);
  await expect(operator.locator('#lan-pantallas li')).toContainText('1280 × 720');

  await showText('Nada me faltará');
  await expect(tv.locator('.cef-body')).toHaveText('Nada me faltará');
  await operator.evaluate(() => window.ceflyrics.dispatch({ type: 'toggle-mode', mode: 'wallpaper' }));
  await expect(tv.locator('.cef-wallpaper')).toHaveClass(/cef-on/);
  await expect(tv.locator('.cef-logo svg')).toBeVisible();
  await expect(tv.locator('.cef-logo')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await operator.evaluate(() => window.ceflyrics.dispatch({ type: 'toggle-mode', mode: 'wallpaper' }));
  await operator.keyboard.press('Escape');
  await operator.evaluate(() => window.ceflyrics.dispatch({ type: 'toggle-mode', mode: 'black' }));
  await expect(tv.locator('.cef-black')).toHaveClass(/cef-on/);

  await tv.context().close();
  await expect(operator.locator('#lan-pantallas li')).toHaveCount(0);
});

test('las fotos llegan a la tele, y los archivos se piden por partes', async () => {
  await launch();
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, PNG);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, photo);
  await operator.locator('#tab-medios').click();
  await operator.locator('#medio-agregar').click();
  await operator.locator('#medios .item').first().dblclick();

  const tv = await openTv();
  const image = tv.locator('.cef-media img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  const src = (await image.getAttribute('src'))!;
  expect(src).toMatch(/^\/media\/[0-9a-f]{64}\.png$/);
  const part = await fetch(`http://127.0.0.1:${PORT}${src}`, { headers: { Range: 'bytes=0-3' } });
  expect(part.status).toBe(206);
  expect(part.headers.get('content-range')).toBe(`bytes 0-3/${PNG.length}`);
  expect((await part.arrayBuffer()).byteLength).toBe(4);
});

test('la tele va muda salvo que se pida sonido, y el pedido queda guardado', async () => {
  await launch();
  const file = join(dir, 'video.mp4');
  copyFileSync('tests/.media/patron-prueba-8s.mp4', file);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, file);
  await operator.locator('#tab-medios').click();
  await operator.locator('#medio-agregar').click();
  await operator.locator('#medios .item').first().dblclick();

  const tv = await openTv();
  const muted = () => tv.locator('.cef-media video').evaluate((video: HTMLVideoElement) => video.muted);
  await expect.poll(muted).toBe(true);

  await operator.locator('#tab-transmision').click();
  await operator.locator('#lan-sonido').check();
  await expect.poll(muted).toBe(false);

  // Una tele que entra después, con el video ya al aire, también suena.
  const other = await openTv();
  await expect
    .poll(() => other.locator('.cef-media video').evaluate((video: HTMLVideoElement) => video.muted))
    .toBe(false);

  await app.close();
  await launch();
  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-sonido')).toBeChecked();
});

test('desde la red no se llega a otros archivos', async () => {
  await launch();
  for (const path of ['/media/../ceflyrics.db', '/media/..%2Fceflyrics.db', '/ceflyrics.db', '/index.js']) {
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
    expect(response.status, path).toBe(404);
  }
  const post = await fetch(`http://127.0.0.1:${PORT}/`, { method: 'POST' });
  expect(post.status).toBe(405);
});

test('un temporizador marca lo mismo aunque el reloj de la tele esté corrido', async () => {
  await launch();
  await operator.evaluate(() => {
    const run = { id: 't', label: 'Inicio', message: '', endsAt: Date.now() + 300_000, remainingMs: 0 };
    window.ceflyrics.dispatch({ type: 'timer-run', run });
    window.ceflyrics.dispatch({ type: 'timer-show', id: 't', layout: 'full' });
  });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 3_600_000;
  });
  const tv = await context.newPage();
  await tv.goto(`http://127.0.0.1:${PORT}/`);
  await expect(tv.locator('.cef-timer-time')).toHaveText(/^0[45]:\d\d$/);
});

test('si se corta, la tele conserva lo proyectado y vuelve sola', async () => {
  await launch();
  await showText('Lo que estaba al aire');
  const tv = await openTv();
  await expect(tv.locator('.cef-body')).toHaveText('Lo que estaba al aire');

  await app.close();
  await expect(tv.locator('#aviso')).toHaveText('Buscando CEFLYRICS…');
  await expect(tv.locator('.cef-body')).toHaveText('Lo que estaba al aire');

  await launch();
  await showText('Volvió');
  await expect(tv.locator('.cef-body')).toHaveText('Volvió');
  await expect(tv.locator('#aviso')).toBeEmpty();
});

test('el puerto elegido queda reservado al cerrar y abrir', async () => {
  await launch(null);
  await operator.locator('#tab-transmision').click();
  await operator.locator('#lan-puerto').fill('80');
  await expect(operator.locator('#lan-puerto-guardar')).toBeDisabled();
  await expect(operator.locator('#transmision')).toContainText('entre 1024 y 65535');

  await operator.locator('#lan-puerto').fill(String(OTHER_PORT));
  await operator.locator('#lan-puerto-guardar').click();
  await expect(operator.locator('#lan-direccion')).toHaveText(new RegExp(`:${OTHER_PORT}$`));
  await expect(operator.locator('#lan-estado')).toHaveText('Transmitiendo');

  await app.close();
  await launch(null);
  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-direccion')).toHaveText(new RegExp(`:${OTHER_PORT}$`));
  const tv = await openTv(undefined, OTHER_PORT);
  await expect(tv.locator('#stage')).toHaveClass(/cef-stage/);
});

test('si el puerto está ocupado avisa, no se muda a otro, y lo toma cuando se libera', async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(PORT, '0.0.0.0', resolve));
  await launch();
  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-estado')).toHaveText('Puerto ocupado');
  await expect(operator.locator('#lan-ocupado')).toContainText(String(PORT));

  await new Promise((resolve) => blocker.close(resolve));
  await expect(operator.locator('#lan-estado')).toHaveText('Transmitiendo', { timeout: 12_000 });
  await expect(operator.locator('#lan-direccion')).toHaveText(new RegExp(`:${PORT}$`));
});

test('se puede apagar, y sigue apagada al volver a abrir', async () => {
  await launch();
  await operator.locator('#tab-transmision').click();
  await operator.locator('#lan-encender').click();
  await expect(operator.locator('#lan-estado')).toHaveText('Apagada');
  await expect(fetch(`http://127.0.0.1:${PORT}/`)).rejects.toThrow();

  await app.close();
  await launch();
  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-estado')).toHaveText('Apagada');
  await operator.locator('#lan-encender').click();
  await expect(operator.locator('#lan-estado')).toHaveText('Transmitiendo');
  expect((await fetch(`http://127.0.0.1:${PORT}/`)).status).toBe(200);
});

const SCREENS = [
  { name: 'HD', width: 1280, height: 720 },
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: '4K', width: 3840, height: 2160 },
  { name: 'tele vieja 4:3', width: 1024, height: 768 },
  { name: 'ultra ancha', width: 2560, height: 1080 },
  { name: 'vertical', width: 1080, height: 1920 },
  { name: 'tele chica', width: 960, height: 540 },
];

test('el texto entra entero en cualquier resolución', async () => {
  await launch();
  await showText(LONG_TEXT, 'Job 39:30');
  for (const viewport of SCREENS) {
    const tv = await openTv(viewport);
    await expect(tv.locator('.cef-body')).toHaveText(LONG_TEXT.trim());
    const fit = await tv.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const body = rect('.cef-body');
      const title = rect('.cef-title');
      return {
        top: body.top,
        bottom: title.bottom,
        left: body.left,
        right: body.right,
        font: parseFloat(getComputedStyle(document.querySelector('.cef-body')!).fontSize),
      };
    });
    expect(fit.top, viewport.name).toBeGreaterThanOrEqual(0);
    expect(fit.bottom, viewport.name).toBeLessThanOrEqual(viewport.height);
    expect(fit.left, viewport.name).toBeGreaterThanOrEqual(0);
    expect(fit.right, viewport.name).toBeLessThanOrEqual(viewport.width);
    // Que entre no alcanza: tiene que seguir leyéndose desde lejos.
    expect(fit.font / viewport.height, viewport.name).toBeGreaterThan(0.012);
    await tv.context().close();
  }
});

test('un texto corto se ve igual de grande en proporción en 720p y en 4K', async () => {
  await launch();
  await showText('Dios es amor');
  const sizes: number[] = [];
  for (const viewport of [SCREENS[0], SCREENS[2]]) {
    const tv = await openTv(viewport);
    await expect(tv.locator('.cef-body')).toHaveText('Dios es amor');
    sizes.push(await tv.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.cef-body')!).fontSize)));
    await tv.context().close();
  }
  expect(sizes[0]).toBeCloseTo(64, 0);
  expect(sizes[1]).toBeCloseTo(192, 0);
});

test('si la ventana de la tele cambia de tamaño, el texto se vuelve a acomodar', async () => {
  await launch();
  await showText(LONG_TEXT);
  const tv = await openTv({ width: 1920, height: 1080 });
  await expect(tv.locator('.cef-body')).toHaveText(LONG_TEXT.trim());
  await tv.setViewportSize({ width: 800, height: 800 });
  await expect
    .poll(() => tv.evaluate(() => document.querySelector('.cef-body')!.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(800);
  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-pantallas li')).toContainText('800 × 800');
});

test('la consola ve la misma forma que tiene la salida', async () => {
  await launch();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('output'))!
      .setContentSize(800, 600);
  });
  await expect(operator.locator('#salida-resolucion')).toHaveText(/800 × 600/);
  const shape = await operator.locator('#vista-aire').evaluate((stage) => stage.clientWidth / stage.clientHeight);
  expect(shape).toBeCloseTo(4 / 3, 1);
});

test('la página de las teles se puede leer con un navegador de 2017', () => {
  const code = readFileSync('out/lan/pantalla.js', 'utf8');
  expect(() => parse(code, { ecmaVersion: 2017 })).not.toThrow();
  expect(code).not.toContain('replaceChildren');
  // Una tele vieja sin máscaras mostraba un rectángulo blanco en vez del logo.
  expect(code).not.toMatch(/-webkit-mask|[^-]mask:/);
  expect(code).not.toMatch(/\d(cqw|cqh)\b/);
  // Sin pasar por launch: este archivo sale del build, no de la app.
  app = { close: async () => {} } as unknown as ElectronApplication;
});
