import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const VIDEO = 'tests/.media/patron-prueba-8s.mp4';
// PNG de 1×1 rojo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

let dir: string;
let app: ElectronApplication;
let operator: Page;
let output: Page;

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cef-app-'));
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  output = app.windows().find((w) => w.url().includes('output'))!;
  await output.waitForFunction(() => (window as any).__cefOutput);
});

test.afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function addSong() {
  await operator.locator('#tab-canciones').click();
  await operator.locator('#cancion-nueva').click();
  await operator.locator('#cancion-titulo').fill('Canción de prueba');
  await operator.locator('#cancion-letra').fill('Primera estrofa\n\nCoro\nEl coro\n// Sube la batería');
  await operator.locator('#cancion-guardar').click();
  await expect(operator.locator('#cancion-diapositivas .slide')).toHaveCount(2);
}

// El diálogo de archivos se reemplaza: en la prueba nadie puede elegir a mano.
async function addFiles(files: string[]) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as typeof dialog.showOpenDialog;
  }, files);
  await operator.locator('#tab-medios').click();
  await operator.locator('#medio-agregar').click();
}

test('el menú muestra una sección por vez', async () => {
  for (const [tab, visible] of [
    ['canciones', '#cancion-nueva'],
    ['medios', '#medio-agregar'],
    ['configuracion', '#estilos'],
    ['texto', '#cuerpo'],
    ['biblia', '#biblia-buscar'],
  ]) {
    await operator.locator(`#tab-${tab}`).click();
    await expect(operator.locator(visible)).toBeVisible();
  }
  await expect(operator.locator('#cancion-nueva')).toBeHidden();
});

test('una canción se escribe, se proyecta y las líneas // no llegan al público', async () => {
  await addSong();
  await operator.locator('#cancion-diapositivas .slide').nth(1).click();
  await expect(output.locator('.cef-body')).toHaveText('');
  await operator.locator('#cancion-diapositivas').press('Enter');
  await expect(output.locator('.cef-body')).toHaveText('El coro');

  await operator.locator('#cancion-diapositivas').press('ArrowUp');
  await expect(output.locator('.cef-body')).toHaveText('Primera estrofa');
});

test('las flechas anterior y siguiente recorren las diapositivas de la canción', async () => {
  await addSong();
  await operator.locator('#cancion-diapositivas .slide').first().click();
  await operator.locator('#btn-aire').click();
  await expect(output.locator('.cef-body')).toHaveText('Primera estrofa');

  await operator.locator('#cancion-siguiente').click();
  await expect(output.locator('.cef-body')).toHaveText('El coro');
  await operator.locator('#cancion-anterior').click();
  await expect(output.locator('.cef-body')).toHaveText('Primera estrofa');
  await expect(operator.locator('#cancion-anterior')).toBeDisabled();
});

test('una canción se edita y se borra, con confirmación', async () => {
  await addSong();
  await operator.locator('#cancion-editar').click();
  await expect(operator.locator('#cancion-letra')).toHaveValue(/Sube la batería/);
  await operator.locator('#cancion-titulo').fill('Título nuevo');
  await operator.locator('#cancion-guardar').click();
  await expect(operator.locator('.song')).toContainText('Título nuevo');

  await operator.locator('#cancion-borrar').click();
  await expect(operator.locator('.song')).toHaveCount(1);
  await operator.locator('#cancion-borrar-si').click();
  await expect(operator.locator('.song')).toHaveCount(0);
});

test('guardar sin título avisa y no pierde lo escrito', async () => {
  await operator.locator('#tab-canciones').click();
  await operator.locator('#cancion-nueva').click();
  await operator.locator('#cancion-letra').fill('Letra sin título');
  await operator.locator('#cancion-guardar').click();
  await expect(operator.locator('#cancion-error')).toHaveText('Falta el título de la canción');
  await expect(operator.locator('#cancion-letra')).toHaveValue('Letra sin título');
});

test('una foto se sube y se proyecta', async () => {
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, PNG);
  await addFiles([photo]);
  await expect(operator.locator('#medios .item')).toHaveCount(1);
  await operator.locator('#medios .item').click();
  await operator.locator('#btn-aire').click();

  const image = output.locator('.cef-media img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
});

test('un formato que no sirve se informa', async () => {
  const file = join(dir, 'documento.pdf');
  writeFileSync(file, 'x');
  await addFiles([file]);
  await expect(operator.locator('#medio-mensaje')).toContainText('documento.pdf');
});

test('un video se reproduce de verdad en la salida', async () => {
  test.skip(!existsSync(VIDEO), 'Hace falta correr antes las pruebas de sincronía, que generan el patrón');
  const video = join(dir, 'video.mp4');
  copyFileSync(VIDEO, video);
  await addFiles([video]);
  await operator.locator('#medios .item').click();
  await operator.locator('#btn-aire').click();

  const player = output.locator('.cef-media video');
  await expect(player).toBeVisible();
  const time = () => player.evaluate((el: HTMLVideoElement) => el.currentTime);
  await expect.poll(time, { timeout: 5000 }).toBeGreaterThan(0.3);
  const first = await time();
  await expect.poll(time).toBeGreaterThan(first);
  expect(await player.evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);
  // Las vistas de la consola no decodifican: solo el proyector reproduce.
  const playing = await operator.evaluate(
    () => [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
  );
  expect(playing).toBe(0);

  // Saltar exige que el protocolo de medios sirva rangos.
  await player.evaluate((el: HTMLVideoElement) => {
    el.currentTime = 6;
  });
  await expect.poll(time).toBeGreaterThan(5.9);

  await operator.locator('#btn-limpiar').click();
  await expect(output.locator('.cef-media video')).toHaveCount(0);
});

test('el estilo elegido cambia la fuente y el fondo de las canciones, no de la Biblia', async () => {
  await addSong();
  await operator.locator('#tab-configuracion').click();
  await operator.locator('[data-usar-canciones="fabrica-bosque"]').click();

  await operator.locator('#tab-canciones').click();
  await operator.locator('#cancion-diapositivas .slide').first().click();
  await operator.locator('#btn-aire').click();
  await expect(output.locator('.cef-body')).toHaveText('Primera estrofa');
  await expect(output.locator('.cef-text')).toHaveCSS('font-family', /Lora/);
  await expect(output.locator('.cef-background')).toHaveCSS('background-image', /linear-gradient/);
  await expect.poll(() => output.evaluate(() => document.fonts.check("600 40px 'Lora'"))).toBe(true);

  await operator.locator('#tab-biblia').click();
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await operator.locator('#biblia-buscar').press('Enter');
  await operator.locator('#biblia-versos').press('Enter');
  await expect(output.locator('.cef-body')).toContainText('de tal manera');
  await expect(output.locator('.cef-text')).not.toHaveCSS('font-family', /Lora/);
});

test('se puede crear un estilo con otra fuente y una foto de fondo', async () => {
  const photo = join(dir, 'fondo.png');
  writeFileSync(photo, PNG);
  await addFiles([photo]);
  await operator.locator('#tab-configuracion').click();
  await operator.locator('[aria-label="Editar Noche"]').click();
  await operator.locator('#estilo-fuente').selectOption('oswald');
  await operator.locator('[data-fondo-medio]').first().click();
  await operator.locator('#estilo-nombre').fill('Con foto');
  await operator.locator('#estilo-guardar').click();
  await expect(operator.locator('#estilos .theme')).toHaveCount(8);

  const entry = operator.locator('#estilos .theme').last();
  await entry.locator('[data-usar-canciones]').click();
  await operator.locator('#tab-texto').click();
  await operator.locator('#cuerpo').fill('Prueba de estilo');
  await operator.locator('#btn-mostrar').click();
  await operator.locator('#btn-aire').click();

  await expect(output.locator('.cef-body')).toHaveText('Prueba de estilo');
  await expect(output.locator('.cef-text')).toHaveCSS('font-family', /Oswald/);
  await expect(output.locator('.cef-background img')).toHaveCount(1);
});

test('se borran todos los estilos, también los de fábrica, y se crea uno de cero', async () => {
  await operator.locator('#tab-configuracion').click();
  const cards = operator.locator('#estilos .theme');
  const total = await cards.count();
  for (let left = total; left > 0; left--) {
    await cards.first().locator('.pick').click();
    await operator.locator('#estilo-borrar').click();
    await expect(cards).toHaveCount(left - 1);
  }
  await expect(operator.locator('#estilos .empty')).toBeVisible();

  await operator.locator('#estilo-nuevo').click();
  await operator.locator('#estilo-nombre').fill('Desde cero');
  await operator.locator('#estilo-guardar').click();
  await expect(cards).toHaveCount(1);
  await expect(operator.locator('[aria-label="Editar Desde cero"]')).toBeVisible();
  await expect(operator.locator('#estilos .empty')).toHaveCount(0);
});

test('la biblioteca sobrevive al cerrar y abrir la app', async () => {
  await addSong();
  await operator.locator('#tab-configuracion').click();
  await operator.locator('[data-usar-biblia="fabrica-mar"]').click();
  await expect(operator.locator('[data-usar-biblia="fabrica-mar"]')).toHaveClass(/primary/);
  await app.close();

  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
  await app.firstWindow();
  await expect.poll(() => app.windows().some((w) => w.url().includes('operator'))).toBe(true);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  await operator.locator('#tab-canciones').click();
  await expect(operator.locator('.song')).toContainText('Canción de prueba');
  await operator.locator('#tab-configuracion').click();
  await expect(operator.locator('[data-usar-biblia="fabrica-mar"]')).toHaveClass(/primary/);
});
