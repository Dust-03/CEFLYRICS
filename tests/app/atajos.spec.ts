import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

let dir: string;
let app: ElectronApplication;
let operator: Page;
let output: Page;

async function launch() {
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  output = app.windows().find((w) => w.url().includes('output'))!;
  await output.waitForFunction(() => (window as any).__cefOutput);
  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
}

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cef-atj-'));
  await launch();
});

test.afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const cards = () => operator.locator('#atajos .card');

async function saveVerse() {
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await operator.locator('[data-atajo="Juan 3:16"]').click();
  await expect(operator.locator('[data-atajo="Juan 3:16"]')).toHaveClass(/on/);
}

async function saveSong() {
  await operator.locator('#tab-canciones').click();
  await operator.locator('#cancion-nueva').click();
  await operator.locator('#cancion-titulo').fill('Canción guardada');
  await operator.locator('#cancion-letra').fill('Primera\n\nSegunda');
  await operator.locator('#cancion-guardar').click();
  await operator.locator('#cancion-atajo').click();
  await expect(operator.locator('#cancion-atajo')).toContainText('En atajos');
}

test('sin atajos explica cómo guardar uno', async () => {
  await operator.locator('#tab-atajos').click();
  await expect(operator.locator('#atajos')).toContainText('estrella');
});

test('un versículo guardado va a la vista previa y con doble clic al aire', async () => {
  await saveVerse();
  await operator.locator('#tab-atajos').click();
  await expect(cards()).toHaveCount(1);
  await expect(cards().first()).toContainText('Juan 3:16 · RV1909');

  await cards().first().locator('.open').click();
  await expect(operator.locator('#vista-previa .cef-body')).toContainText('de tal manera');
  await expect(output.locator('.cef-body')).toHaveText('');

  await cards().first().locator('.open').dblclick();
  await expect(output.locator('.cef-body')).toContainText('de tal manera');
  await expect(output.locator('.cef-title')).toHaveText('Juan 3:16 · RV1909');
});

test('una canción guardada se abre en su menú', async () => {
  await saveSong();
  await operator.locator('#tab-biblia').click();
  await operator.locator('#tab-atajos').click();
  await cards().first().locator('.open').click();
  await expect(operator.locator('#cancion-diapositivas')).toBeVisible();
  await expect(operator.locator('#cancion-diapositivas .slide')).toHaveCount(2);
});

test('una foto guardada se proyecta, y se filtra por tipo', async () => {
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, PNG);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, photo);
  await operator.locator('#tab-medios').click();
  await operator.locator('#medio-agregar').click();
  await operator.locator('#medios .item').first().click();
  await operator.locator('#medio-atajo').click();
  await operator.locator('#tab-biblia').click();
  await saveVerse();

  await operator.locator('#tab-atajos').click();
  await expect(cards()).toHaveCount(2);
  await operator.getByRole('button', { name: 'Fotos' }).last().click();
  await expect(cards()).toHaveCount(1);
  await cards().first().locator('.open').dblclick();
  await expect(output.locator('.cef-media img')).toBeVisible();
});

test('Ctrl y un número usa el atajo sin ir al menú', async () => {
  await saveVerse();
  await operator.locator('#biblia-buscar').fill('');
  await operator.keyboard.press('Control+1');
  await expect(operator.locator('#vista-previa .cef-body')).toContainText('de tal manera');
  await expect(output.locator('.cef-body')).toHaveText('');
});

test('se quita con la estrella o con la cruz, y sobrevive al cerrar la app', async () => {
  await saveVerse();
  await operator.locator('[data-atajo="Juan 3:16"]').click();
  await expect(operator.locator('[data-atajo="Juan 3:16"]')).not.toHaveClass(/on/);
  await operator.locator('[data-atajo="Juan 3:16"]').click();

  await app.close();
  await launch();
  await operator.locator('#tab-atajos').click();
  await expect(cards()).toHaveCount(1);
  await cards().first().locator('.remove').click();
  await expect(cards()).toHaveCount(0);
});

test('borrar la canción la saca de los atajos', async () => {
  await saveSong();
  await operator.locator('#cancion-borrar').click();
  await operator.locator('#cancion-borrar-si').click();
  await operator.locator('#tab-atajos').click();
  await expect(cards()).toHaveCount(0);
});
