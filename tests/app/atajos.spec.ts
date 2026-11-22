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

  // La barra de arriba muestra un tipo por vez (sin "Todo"), y cada atajo conserva su número de Ctrl.
  const bar = operator.locator('#barra-atajos [data-atajo-barra]');
  await expect(operator.locator('#barra-atajos-filtro option')).toHaveText([
    'Canciones',
    'Versículos',
    'Fotos',
    'Videos',
  ]);
  await expect(operator.locator('#barra-atajos-filtro')).toHaveValue('verse');
  await expect(bar).toHaveCount(1);
  await expect(bar.first()).toContainText('Juan 3:16');
  // La barra no lleva los números de Ctrl+1…9: no hay lugar.
  await expect(bar.first().locator('kbd')).toHaveCount(0);
  await operator.locator('#barra-atajos-filtro').selectOption({ label: 'Fotos' });
  await expect(bar).toHaveCount(1);
  await operator.locator('#barra-atajos-filtro').selectOption({ label: 'Videos' });
  await expect(operator.locator('#barra-atajos')).toContainText('No hay atajos de este tipo');
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

async function saveVerses() {
  await operator.locator('#biblia-buscar').fill('sal 23');
  for (const verse of [1, 2, 3]) await operator.locator(`[data-atajo="Salmos 23:${verse}"]`).click();
  await expect(operator.locator('[data-atajo="Salmos 23:3"]')).toHaveClass(/on/);
  await operator.locator('#tab-atajos').click();
  await expect(cards()).toHaveCount(3);
}

const titles = async () =>
  (await operator.locator('#atajos .foot strong').allTextContents()).map((text) => text.replace(/ · .*/, ''));

async function drag(from: number, to: number, holdMs: number) {
  const start = (await cards().nth(from).boundingBox())!;
  const end = (await cards().nth(to).boundingBox())!;
  await operator.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await operator.mouse.down();
  await operator.waitForTimeout(holdMs);
  await operator.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
  await operator.mouse.up();
}

test('manteniendo apretado se arrastra, y el orden queda guardado', async () => {
  await saveVerses();
  expect(await titles()).toEqual(['Salmos 23:1', 'Salmos 23:2', 'Salmos 23:3']);

  await drag(2, 0, 350);
  await expect.poll(titles).toEqual(['Salmos 23:3', 'Salmos 23:1', 'Salmos 23:2']);
  await expect(cards().first().locator('kbd')).toHaveText('1');
  // Soltar no cuenta como clic: no manda nada a la vista previa.
  await expect(operator.locator('#vista-previa .cef-body')).toHaveText('');

  await operator.keyboard.press('Control+1');
  await expect(operator.locator('#vista-previa .cef-title')).toContainText('Salmos 23:3');

  await app.close();
  await launch();
  await operator.locator('#tab-atajos').click();
  await expect.poll(titles).toEqual(['Salmos 23:3', 'Salmos 23:1', 'Salmos 23:2']);
});

test('sin mantener apretado no se mueve, y el clic sigue andando', async () => {
  await saveVerses();
  await drag(2, 0, 0);
  await operator.waitForTimeout(400);
  expect(await titles()).toEqual(['Salmos 23:1', 'Salmos 23:2', 'Salmos 23:3']);

  await cards().nth(1).locator('.open').click();
  await expect(operator.locator('#vista-previa .cef-title')).toContainText('Salmos 23:2');
  await cards().nth(2).locator('.open').dblclick();
  await expect(output.locator('.cef-title')).toContainText('Salmos 23:3');
});

test('con un filtro no se reordena', async () => {
  await saveVerses();
  await operator.getByRole('button', { name: 'Versículos' }).click();
  await drag(2, 0, 350);
  await operator.waitForTimeout(300);
  expect(await titles()).toEqual(['Salmos 23:1', 'Salmos 23:2', 'Salmos 23:3']);
  await expect(operator.locator('.hint')).toContainText('elegí Todo');
});

test('en la barra de arriba también se arrastra, dentro del tipo elegido', async () => {
  await saveVerses();
  const chips = operator.locator('#barra-atajos [data-atajo-barra]');
  const chipTitles = async () =>
    (await chips.locator('.name').allTextContents()).map((text) => text.replace(/ · .*/, ''));
  const dragChip = async (from: number, to: number) => {
    const start = (await chips.nth(from).boundingBox())!;
    const end = (await chips.nth(to).boundingBox())!;
    await operator.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await operator.mouse.down();
    await operator.waitForTimeout(350);
    await operator.mouse.move(end.x + 4, end.y + end.height / 2, { steps: 8 });
    await operator.mouse.up();
  };

  await dragChip(2, 0);
  await expect.poll(chipTitles).toEqual(['Salmos 23:3', 'Salmos 23:1', 'Salmos 23:2']);
  await expect.poll(titles).toEqual(['Salmos 23:3', 'Salmos 23:1', 'Salmos 23:2']);
  // Soltar no cuenta como clic: no manda nada a la vista previa.
  await expect(operator.locator('#vista-previa .cef-body')).toHaveText('');
  await operator.keyboard.press('Control+1');
  await expect(operator.locator('#vista-previa .cef-title')).toContainText('Salmos 23:3');
});

test('borrar la canción la saca de los atajos', async () => {
  await saveSong();
  await operator.locator('#cancion-borrar').click();
  await operator.locator('#cancion-borrar-si').click();
  await operator.locator('#tab-atajos').click();
  await expect(cards()).toHaveCount(0);
});
