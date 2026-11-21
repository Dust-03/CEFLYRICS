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

test('con el celular acostado la lista queda al lado de la pantalla y se sigue mandando', async () => {
  const phone = await pairPhone();
  await phone.setViewportSize({ width: 800, height: 380 });
  const header = (await phone.locator('header').boundingBox())!;
  const list = (await phone.locator('main').boundingBox())!;
  expect(list.x).toBeGreaterThanOrEqual(header.x + header.width - 1);
  expect(list.height).toBeGreaterThan(300);
  await expect(phone.locator('#control-tab-biblia')).toBeInViewport();

  await phone.locator('#control-buscar').fill('jn 3 16');
  await phone.getByRole('button', { name: /Juan 3:16/ }).click();
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-body')).toContainText('de tal manera');
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

test('dos toques mandan directo al aire, y uno solo no', async () => {
  const phone = await pairPhone();
  await phone.locator('#control-buscar').fill('jn 3 16');
  const verse = phone.locator('.row', { hasText: 'Juan 3:16' });
  await verse.click();
  await phone.waitForTimeout(500);
  await verse.click();
  await phone.waitForTimeout(100);
  await expect(output.locator('.cef-body')).toHaveText('');

  await phone.waitForTimeout(500);
  await verse.dblclick();
  await expect(output.locator('.cef-title')).toHaveText('Juan 3:16 · RV1909');
});

test('los atajos se reordenan manteniendo apretado, y el orden llega a la PC', async () => {
  const phone = await pairPhone();
  await phone.locator('#control-buscar').fill('sal 23');
  for (const verse of [1, 2, 3])
    await phone.locator(`[data-estrella$=":19023${String(verse).padStart(3, '0')}"]`).click();
  await phone.locator('#control-tab-atajos').click();
  const titles = async () =>
    (await phone.locator('#control-atajos small').allTextContents()).map((text) => text.split(' · ')[1]);
  await expect.poll(titles).toEqual(['Salmos 23:1', 'Salmos 23:2', 'Salmos 23:3']);

  const rows = phone.locator('#control-atajos li');
  const start = (await rows.nth(2).boundingBox())!;
  const end = (await rows.nth(0).boundingBox())!;
  await phone.mouse.move(start.x + 40, start.y + start.height / 2);
  await phone.mouse.down();
  await phone.waitForTimeout(450);
  await phone.mouse.move(end.x + 40, end.y + end.height / 2, { steps: 6 });
  await phone.mouse.up();
  await expect.poll(titles).toEqual(['Salmos 23:3', 'Salmos 23:1', 'Salmos 23:2']);

  await operator.locator('#tab-atajos').click();
  await expect(operator.locator('#atajos .card').first()).toContainText('Salmos 23:3');

  // Sin mantener apretado, arrastrar no reordena.
  const quick = (await rows.nth(2).boundingBox())!;
  await phone.mouse.move(quick.x + 40, quick.y + quick.height / 2);
  await phone.mouse.down();
  await phone.mouse.move(end.x + 40, end.y + end.height / 2, { steps: 4 });
  await phone.mouse.up();
  await phone.waitForTimeout(400);
  expect(await titles()).toEqual(['Salmos 23:3', 'Salmos 23:1', 'Salmos 23:2']);
});

test('lo que se manda le gana al Logo, y se puede volver a mandar lo mismo', async () => {
  const phone = await pairPhone();
  await phone.locator('[data-modo="wallpaper"]').click();
  await expect(output.locator('.cef-wallpaper')).toHaveClass(/cef-on/);

  await phone.locator('#control-buscar').fill('jn 3 16');
  await phone.locator('.row', { hasText: 'Juan 3:16' }).click();
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-wallpaper')).not.toHaveClass(/cef-on/);
  await expect(output.locator('.cef-body')).toContainText('de tal manera');

  await phone.locator('[data-modo="black"]').click();
  await expect(output.locator('.cef-black')).toHaveClass(/cef-on/);
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-black')).not.toHaveClass(/cef-on/);

  await phone.locator('#control-quitar').click();
  await expect(output.locator('.cef-body')).toHaveText('');
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-body')).toContainText('de tal manera');
});

test('volver a tocar la pestaña lleva al inicio del menú', async () => {
  await operator.evaluate(() => window.ceflyrics.songs.save({ title: 'Prueba', author: '', text: 'Uno' }));
  const phone = await pairPhone();
  await phone.locator('#control-buscar').fill('jn 3 16');
  await expect(phone.locator('.row', { hasText: 'Juan 3:16' })).toBeVisible();
  await phone.locator('#control-tab-biblia').click();
  await expect(phone.locator('#control-buscar')).toHaveValue('');
  await expect(phone.getByRole('button', { name: 'Gn', exact: true })).toBeVisible();

  await phone.getByRole('button', { name: 'Sal', exact: true }).click();
  await phone.locator('#control-tab-biblia').click();
  await expect(phone.getByRole('button', { name: 'Gn', exact: true })).toBeVisible();

  await phone.locator('#control-tab-canciones').click();
  await phone.getByRole('button', { name: /Prueba/ }).click();
  await expect(phone.locator('#control-diapositivas')).toBeVisible();
  await phone.locator('#control-tab-canciones').click();
  await expect(phone.locator('#control-diapositivas')).toHaveCount(0);

  await phone.locator('#control-tab-tiempo').click();
  await phone.locator('#control-temporizador-nuevo').click();
  await phone.locator('#control-tab-tiempo').click();
  await expect(phone.locator('#control-temporizador-form')).toHaveCount(0);
});

test('se llega a un versículo por libro y capítulo', async () => {
  const phone = await pairPhone();
  await phone.getByRole('button', { name: 'Sal', exact: true }).click();
  await phone.getByRole('button', { name: '23', exact: true }).click();
  await phone.getByRole('button', { name: /Salmos 23:1/ }).click();
  await phone.locator('#control-aire-boton').click();
  await expect(output.locator('.cef-title')).toContainText('Salmos 23:1');
});

test('el control mueve el versículo siguiente y anterior desde una cita directa', async () => {
  const phone = await pairPhone();
  await phone.locator('#control-buscar').fill('sal 23 2');
  await expect(phone.getByRole('button', { name: /Salmos 23:2/ })).toBeVisible();
  await expect(phone.locator('#control-versiculo-anterior')).toBeEnabled();
  await phone.locator('#control-versiculo-siguiente').click();
  await expect(output.locator('.cef-title')).toContainText('Salmos 23:3');
  await phone.locator('#control-versiculo-anterior').click();
  await expect(output.locator('.cef-title')).toContainText('Salmos 23:2');
});

test('las canciones se pasan con Siguiente y Anterior', async () => {
  await operator.evaluate(() =>
    window.ceflyrics.songs.save({ title: 'Prueba', author: '', text: 'Uno\n\nDos\n\nTres' }),
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

test('desde el celular se suben fotos y videos, y nada más', async () => {
  const phone = await pairPhone('Celular del sonido');
  const token = await phone.evaluate(() => localStorage.getItem('cef-control-token'));
  const upload = (name: string, ticket = 'inventado') =>
    fetch(`${BASE}/api/medios`, {
      method: 'POST',
      headers: { 'X-Ticket': ticket, 'X-File-Name': encodeURIComponent(name) },
      body: PNG,
    });
  // Ni un ticket inventado ni el token del celular alcanzan: cada envío lo autoriza la PC.
  expect((await upload('foto.png')).status).toBe(403);
  expect((await upload('foto.png', token!)).status).toBe(403);
  expect((await upload('notas.txt')).status).toBe(415);
  expect((await upload('..\\..\\virus.exe')).status).toBe(415);

  await phone.locator('#control-tab-medios').click();
  await phone.locator('#control-subir').setInputFiles({ name: 'mi foto.png', mimeType: 'image/png', buffer: PNG });
  await expect(phone.locator('.upload-note')).toHaveText('Esperando permiso en la PC…');
  await expect(operator.locator('#pedido-titulo')).toHaveText('Celular del sonido quiere importar fotos y videos');
  await expect(operator.locator('#pedido-detalle')).toContainText('Envía 1 foto (1 MB)');
  await operator.locator('#pedido-permitir').click();
  await expect(phone.locator('.upload-note')).toHaveText('Se agregó 1 archivo.');
  await expect(phone.locator('.photo')).toHaveCount(1);
  await operator.locator('#tab-medios').click();
  await expect(operator.locator('#medios .item')).toHaveCount(1);
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
  for (const tab of ['biblia', 'canciones', 'medios', 'atajos', 'tiempo', 'datos']) {
    await phone.locator(`#control-tab-${tab}`).click();
    expect(await fits(phone), tab).toBe(true);
  }
  const clipped = await phone.$$eval('nav button', (buttons) =>
    buttons.filter((button) => button.scrollWidth > button.clientWidth).map((button) => button.id),
  );
  expect(clipped).toEqual([]);
});

test('un temporizador se crea y se maneja desde el celular', async () => {
  await operator.locator('#tab-temporizadores').click();
  const phone = await pairPhone();
  await phone.locator('#control-tab-tiempo').click();
  await phone.locator('#control-temporizador-nuevo').click();
  await phone.locator('#control-temporizador-guardar').click();
  await expect(phone.locator('.timer-error')).toContainText('nombre');

  await phone.locator('#control-temporizador-nombre').fill('Comienza el culto');
  await phone.locator('#control-temporizador-minutos').fill('5');
  await phone.locator('#control-temporizador-guardar').click();
  const row = phone.locator('#control-temporizadores li');
  await expect(row).toContainText('05:00');
  // La PC se entera sin tocar nada.
  await expect(operator.locator('#temporizadores')).toContainText('Comienza el culto');

  await row.locator('[data-iniciar]').click();
  await expect(row.locator('strong')).toHaveText(/^0[45]:\d\d$/);
  await row.locator('[data-completa]').click();
  await expect(output.locator('.cef-timer-time')).toHaveText(/^0[45]:\d\d$/);
  await expect(output.locator('.cef-timer-label')).toHaveText('Comienza el culto');
  await expect(row.locator('[data-completa]')).toHaveClass(/live/);

  await row.locator('[data-pausar]').click();
  await expect(row.locator('[data-iniciar]')).toHaveText('Seguir');
  await row.locator('[data-iniciar]').click();
  await expect(row.locator('[data-pausar]')).toBeVisible();

  await row.locator('[data-esquina]').click();
  await expect(output.locator('.cef-timer')).toHaveClass(/cef-timer-corner/);
  await row.locator('[data-detener]').click();
  await expect(output.locator('.cef-timer')).not.toHaveClass(/cef-on/);
  await expect(row.locator('strong')).toHaveText('05:00');
});

test('una cuenta atrás hasta una hora usa el reloj de la PC, aunque el del celular esté corrido', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.addInitScript(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 3_600_000;
  });
  const phone = await context.newPage();
  await phone.goto(`${BASE}/control/`);
  await phone.locator('#control-nombre').fill('Corrido');
  await phone.locator('#control-pin').fill(await currentPin());
  await phone.locator('#control-vincular').click();
  await phone.locator('#control-tab-tiempo').click();
  await phone.locator('#control-temporizador-nuevo').click();
  await phone.locator('#control-temporizador-nombre').fill('Culto');
  await phone.locator('#control-temporizador-hasta').click();
  const target = await operator.evaluate(() => {
    const date = new Date(Date.now() + 30 * 60_000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  });
  await phone.locator('#control-temporizador-hora').fill(target);
  await phone.locator('#control-temporizador-guardar').click();
  const row = phone.locator('#control-temporizadores li');
  await expect(row).toContainText(`Hasta las ${target}`);
  await row.locator('[data-iniciar]').click();
  await expect(row.locator('strong')).toHaveText(/^(29|30):\d\d$/);
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

test('el celular abre con la intro del logo, y un toque la saltea', async () => {
  const phone = await openPhone();
  await expect(phone.locator('#inicio')).toBeVisible();
  await expect(phone.locator('#inicio .letter')).toHaveCount(6);
  await expect(phone.locator('#inicio')).toHaveCount(0, { timeout: 8000 });

  await phone.reload();
  await expect(phone.locator('#inicio')).toBeVisible();
  await phone.locator('#control-nombre').click();
  await expect(phone.locator('#inicio')).toHaveCount(0, { timeout: 1000 });
  await expect(phone.locator('#control-nombre')).toBeFocused();
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
  const response = await fetch(`${BASE}/api/ceflyrics`);
  expect(await response.json()).toEqual({ app: 'ceflyrics' });
});

// Con CEF_CAPTURAS=1 deja las capturas en test-results/capturas.
const capture = async (page: Page, name: string) => {
  if (process.env.CEF_CAPTURAS)
    await page.screenshot({ path: `test-results/capturas/${name}.png`, animations: 'disabled' });
};

test('exportar e importar todo desde el celular lo autoriza la PC', async () => {
  await operator.evaluate(() =>
    (window as any).ceflyrics.songs.save({ title: 'Cuán grande es Él', author: '', text: 'Señor mi Dios' }),
  );
  const phone = await pairPhone('Celular del sonido');
  await phone.locator('#control-tab-datos').click();
  await capture(phone, '1-celular-datos');

  const download = phone.waitForEvent('download');
  await phone.locator('#control-exportar').click();
  const dialog = operator.locator('#pedido-datos');
  await expect(dialog).toContainText('Celular del sonido quiere exportar todos los datos');
  await expect(operator.locator('#pedido-denegar')).toBeFocused();
  await expect(phone.locator('#control-datos-estado')).toHaveText('Esperando permiso en la PC…');
  await capture(phone, '2-celular-esperando');
  await capture(operator, '3-pc-pedido-exportar');
  await operator.locator('#pedido-permitir').click();
  await expect(dialog).toBeHidden();
  const file = join(dir, (await download).suggestedFilename());
  await (await download).saveAs(file);
  expect(file).toMatch(/CEFLYRICS-datos-\d{4}-\d{2}-\d{2}\.ceflyrics$/);
  await expect(phone.locator('#control-datos-estado')).toContainText('Descargando la copia');

  await phone.locator('#control-importar').setInputFiles(file);
  await expect(phone.locator('#control-importar-confirmar')).toContainText('¿Reemplazar todo lo de la PC');
  await capture(phone, '4-celular-confirmar-importar');
  await phone.locator('#control-importar-si').click();
  await expect(dialog).toContainText('Celular del sonido quiere importar todos los datos');
  await capture(operator, '5-pc-pedido-importar');
  await operator.locator('#pedido-siempre').click();
  await expect(phone.locator('#control-datos-estado')).toContainText('Listo: 1 canción');
  await capture(phone, '6-celular-listo');

  await operator.locator('#tab-transmision').click();
  const row = operator.locator('#lan-celulares li');
  await expect(row).toContainText('Permiso siempre');
  await capture(operator, '7-pc-permiso-siempre');

  // Con el permiso siempre ya no pregunta; al quitarlo vuelve a preguntar, y denegar se respeta.
  await phone.locator('#control-exportar').click();
  await expect(phone.locator('#control-datos-estado')).toContainText('Descargando la copia');
  await row.locator('[data-quitar-permiso]').click();
  await expect(row).not.toContainText('Permiso siempre');
  await phone.locator('#control-exportar').click();
  await operator.locator('#pedido-denegar').click();
  await expect(phone.locator('#control-datos-estado')).toHaveText('La PC no dio permiso.');
  await capture(phone, '8-celular-denegado');

  const token = await phone.evaluate(() => localStorage.getItem('cef-control-token'));
  expect((await fetch(`${BASE}/api/datos/exportar?ticket=${token}`)).status).toBe(403);
  expect((await fetch(`${BASE}/api/datos/importar`, { method: 'POST', body: 'x' })).status).toBe(403);
});

test('fotos y videos desde la pestaña Datos, con permiso de la PC', async () => {
  const phone = await pairPhone('Celular de Ana');
  await phone.locator('#control-tab-datos').click();
  await capture(phone, '9-celular-medios');
  await phone.locator('#control-datos-medios').setInputFiles([
    { name: 'altar.png', mimeType: 'image/png', buffer: PNG },
    { name: 'coro.png', mimeType: 'image/png', buffer: PNG },
    { name: 'bautismo.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') },
  ]);
  const dialog = operator.locator('#pedido-datos');
  await expect(dialog).toContainText('Celular de Ana quiere importar fotos y videos');
  await expect(dialog).toContainText('Envía 2 fotos y 1 video (1 MB)');
  await expect(operator.locator('#pedido-denegar')).toBeFocused();
  await capture(operator, '10-pc-pedido-medios');
  await operator.locator('#pedido-denegar').click();
  await expect(phone.locator('.upload-note')).toHaveText('La PC no dio permiso.');
});
