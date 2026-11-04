import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

const PORT = 8807;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

let dir: string;
let app: ElectronApplication;
let operator: Page;
let output: Page;
let browser: Browser;

async function launch() {
  const env = { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir, CEF_LAN_PORT: String(PORT) };
  app = await electron.launch({ args: ['.'], env });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  output = app.windows().find((w) => w.url().includes('output'))!;
  await output.waitForFunction(() => (window as any).__cefOutput);
  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
  await operator.locator('#tab-transmision').click();
  await expect(operator.locator('#lan-estado')).toHaveText('Transmitiendo');
}

const currentPin = async () => (await operator.locator('#lan-pin').textContent())!;

async function openPhone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto(`${BASE}/control/`);
  return phone;
}

async function pairPhone(name = 'Celular de prueba') {
  const phone = await openPhone();
  await phone.locator('#control-nombre').fill(name);
  await phone.locator('#control-pin').fill(await currentPin());
  await phone.locator('#control-vincular').click();
  await expect(phone.locator('#control-tab-biblia')).toBeVisible();
  return phone;
}

const tryPin = (pin: string, name: unknown = 'Prueba') =>
  fetch(`${BASE}/api/vincular`, { method: 'POST', body: JSON.stringify({ pin, name }) });

test.beforeAll(async () => {
  browser = await chromium.launch({ channel: 'msedge' });
});

test.afterAll(async () => {
  await browser.close();
});

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cef-ctl-'));
  await launch();
});

test.afterEach(async () => {
  for (const context of browser.contexts()) await context.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('el celular se vincula con el PIN y manda un versículo al aire', async () => {
  await expect(operator.locator('#lan-pin')).toHaveText(/^\d{6}$/);
  await expect(operator.locator('#lan-qr-control')).toBeVisible();
  const phone = await pairPhone();

  await phone.locator('#control-buscar').fill('jn 3 16');
  await phone.getByRole('button', { name: /Juan 3:16/ }).click();
  await expect(output.locator('.cef-body')).toHaveText('');

  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-body')).toContainText('de tal manera');
  await expect(output.locator('.cef-title')).toHaveText('Juan 3:16 · RV1909');
  await expect(phone.locator('#control-aire .cef-body')).toContainText('de tal manera');
  await expect(operator.locator('#lan-celulares li')).toContainText('Celular de prueba');
  await expect(operator.locator('#lan-celulares li')).toContainText('Conectado');
});

test('el mismo versículo se puede mandar en otra versión', async () => {
  const phone = await pairPhone();
  await phone.locator('#control-buscar').fill('jn 3 16');
  await phone.getByRole('button', { name: /Juan 3:16/ }).click();
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-title')).toHaveText('Juan 3:16 · RV1909');

  await phone.getByLabel('Versión').selectOption('KJV');
  await phone.getByRole('button', { name: /For God so loved/ }).click();
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-title')).toContainText('KJV');
  await expect(output.locator('.cef-body')).toContainText('For God so loved');
});

test('se llega a un versículo por libro y capítulo', async () => {
  const phone = await pairPhone();
  await phone.getByRole('button', { name: 'Sal', exact: true }).click();
  await phone.getByRole('button', { name: '23', exact: true }).click();
  await phone.getByRole('button', { name: /Salmos 23:1/ }).click();
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-title')).toContainText('Salmos 23:1');
});

test('las canciones se pasan con Siguiente y Anterior', async () => {
  await operator.evaluate(() =>
    window.ceflirics.songs.save({ title: 'Prueba', author: '', text: 'Uno\n\nDos\n\nTres' }),
  );
  const phone = await pairPhone();
  await phone.locator('#control-tab-canciones').click();
  await phone.getByRole('button', { name: /Prueba/ }).click();
  await phone.locator('#control-siguiente').click();
  await expect(output.locator('.cef-body')).toHaveText('Uno');
  await phone.locator('#control-siguiente').click();
  await expect(output.locator('.cef-body')).toHaveText('Dos');
  await phone.locator('#control-anterior').click();
  await expect(output.locator('.cef-body')).toHaveText('Uno');
});

test('las fotos se ven y salen al aire, y los modos funcionan', async () => {
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, PNG);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, photo);
  await operator.locator('#tab-medios').click();
  await operator.locator('#medio-agregar').click();
  await expect(operator.locator('#medios .item')).toHaveCount(1);

  const phone = await pairPhone();
  await phone.locator('#control-tab-medios').click();
  await phone.locator('.photo').first().click();
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-media img')).toBeVisible();

  await phone.locator('[data-modo="black"]').click();
  await expect(output.locator('.cef-black')).toHaveClass(/cef-on/);
  await phone.locator('[data-modo="black"]').click();
  await expect(output.locator('.cef-black')).not.toHaveClass(/cef-on/);
});

test('nada se sale de la pantalla en un celular angosto', async () => {
  const fits = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  await phone.goto(`${BASE}/control/`);
  await expect(phone.locator('#control-pin')).toBeVisible();
  expect(await fits(phone), 'PIN').toBe(true);
  const box = (await phone.locator('#control-vincular').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(320);

  await phone.locator('#control-nombre').fill('Angosto');
  await phone.locator('#control-pin').fill(await currentPin());
  await phone.locator('#control-vincular').click();
  for (const tab of ['biblia', 'canciones', 'medios', 'atajos']) {
    await phone.locator(`#control-tab-${tab}`).click();
    expect(await fits(phone), tab).toBe(true);
  }
});

test('sin el PIN no se entra, y el PIN equivocado se bloquea', async () => {
  const phone = await openPhone();
  await phone.locator('#control-pin').fill('000000');
  const right = await currentPin();
  const wrong = right === '000000' ? '111111' : '000000';
  await phone.locator('#control-nombre').fill('Intruso');
  await phone.locator('#control-pin').fill(wrong);
  await phone.locator('#control-vincular').click();
  await expect(phone.locator('#control-error')).toContainText('no coincide');

  for (let attempt = 0; attempt < 3; attempt++) expect((await tryPin(wrong)).status).toBe(403);
  expect((await tryPin(wrong)).status).toBe(403);
  // Ya bloqueado, ni el PIN correcto entra.
  expect((await tryPin(right)).status).toBe(429);
});

test('el canal de control exige el token, y una página ajena no puede abrirlo', async () => {
  const phone = await openPhone();
  const closed = await phone.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const socket = new WebSocket(`ws://${location.host}/control-ws`);
        socket.onopen = () => socket.send(JSON.stringify({ t: 'auth', token: 'inventado' }));
        socket.onclose = ({ code }) => resolve(code);
      }),
  );
  expect(closed).toBe(4001);

  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto('about:blank');
  const foreign = await other.evaluate(
    (url) =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket(url);
        socket.onopen = () => resolve('abrió');
        socket.onerror = () => resolve('rechazado');
      }),
    `ws://127.0.0.1:${PORT}/control-ws`,
  );
  expect(foreign).toBe('rechazado');
});

test('desvincular pide confirmación', async () => {
  const phone = await pairPhone();
  await phone.locator('#control-salir').click();
  await expect(phone.locator('#control-confirmar')).toBeVisible();
  await expect(phone.locator('#control-tab-biblia')).toBeVisible();

  await phone.locator('#control-salir-no').click();
  await expect(phone.locator('#control-confirmar')).toHaveCount(0);
  await expect(phone.locator('#control-tab-biblia')).toBeVisible();

  await phone.locator('#control-salir').click();
  await phone.locator('#control-salir-si').click();
  await expect(phone.locator('#control-pin')).toBeVisible();
});

test('cambiar el PIN no toca a los vinculados, y el viejo ya no sirve', async () => {
  const phone = await pairPhone();
  const old = await currentPin();
  await operator.locator('#lan-pin-cambiar').click();
  await expect(operator.locator('#lan-pin')).not.toHaveText(old);
  expect((await tryPin(old)).status).toBe(403);
  await phone.reload();
  await expect(phone.locator('#control-tab-biblia')).toBeVisible();
});

test('hace falta un nombre para vincular', async () => {
  const phone = await openPhone();
  await phone.locator('#control-pin').fill(await currentPin());
  await expect(phone.locator('#control-vincular')).toBeDisabled();
  await phone.locator('#control-nombre').fill('   ');
  await expect(phone.locator('#control-vincular')).toBeDisabled();
  expect((await tryPin(await currentPin(), '   ')).status).toBe(400);
});

test('una vez vinculado no vuelve a pedir nada', async () => {
  const phone = await pairPhone();
  await phone.reload();
  await expect(phone.locator('#control-tab-biblia')).toBeVisible();
  await expect(phone.locator('#control-pin')).toHaveCount(0);
});

test('la PC ve cada celular con su nombre y desvincula uno solo', async () => {
  const first = await pairPhone('Celular del sonido');
  const second = await pairPhone('Celular del pastor');
  const rows = operator.locator('#lan-celulares li');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Celular del sonido');
  await expect(rows.nth(1)).toContainText('Celular del pastor');

  await rows.nth(0).getByRole('button', { name: 'Desvincular' }).click();
  await expect(first.locator('#control-error')).toContainText('desvinculado desde la PC');
  await expect(first.locator('#control-pin')).toBeVisible();
  await expect(rows).toHaveCount(1);

  await second.locator('[data-modo="black"]').click();
  await expect(output.locator('.cef-black')).toHaveClass(/cef-on/);

  await first.reload();
  await expect(first.locator('#control-pin')).toBeVisible();
});

test('al cerrar un celular figura sin conexión, y al desvincularse desaparece', async () => {
  const phone = await pairPhone();
  const row = operator.locator('#lan-celulares li');
  await expect(row).toContainText('Conectado');
  await phone.locator('#control-salir').click();
  await phone.locator('#control-salir-si').click();
  await expect(row).toHaveCount(0);

  const again = await pairPhone('Otro');
  await again.context().close();
  await expect(operator.locator('#lan-celulares li')).toContainText('Sin conexión');
});

test('las estrellas del celular llegan a la PC, y las de la PC al celular', async () => {
  const phone = await pairPhone();
  await phone.locator('#control-buscar').fill('jn 3 16');
  const verseStar = phone.locator('[data-estrella^="verse:RV1909"]').first();
  await verseStar.click();
  await expect(verseStar).toHaveClass(/saved/);

  await operator.locator('#tab-atajos').click();
  await expect(operator.locator('#atajos .card')).toHaveCount(1);
  await expect(operator.locator('#atajos .card').first()).toContainText('Juan 3:16');

  await phone.locator('#control-tab-atajos').click();
  await expect(phone.locator('#control-atajos li')).toHaveCount(1);

  await operator.locator('#atajos .card').first().locator('.remove').click();
  await expect(phone.locator('#control-atajos li')).toHaveCount(0);
  await phone.locator('#control-tab-biblia').click();
  await expect(phone.locator('[data-estrella^="verse:RV1909"]').first()).not.toHaveClass(/saved/);
});

test('el celular queda vinculado al reiniciar la app', async () => {
  const phone = await pairPhone();
  await app.close();
  await expect(phone.locator('#control-offline')).toBeVisible();
  await launch();
  await expect(phone.locator('#control-offline')).toHaveCount(0, { timeout: 10_000 });
  await phone.locator('[data-modo="black"]').click();
  await expect(output.locator('.cef-black')).toHaveClass(/cef-on/);
});

test('la app del celular reconoce a la PC', async () => {
  const response = await fetch(`${BASE}/api/ceflirics`);
  expect(await response.json()).toEqual({ app: 'ceflirics' });
});
