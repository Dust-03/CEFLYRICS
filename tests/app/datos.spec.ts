import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

let dir: string;
let app: ElectronApplication;
let operator: Page;

async function launch(folder: string) {
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: folder } });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
}

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-dat-'));
});

test.afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('los datos se exportan de una PC y se importan en otra', async () => {
  const file = join(dir, 'copia.ceflirics');
  await launch(join(dir, 'origen'));
  await operator.evaluate(() => window.ceflirics.songs.save({ title: 'Santo', author: '', text: 'Letra' }));
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, file);
  await operator.locator('#tab-configuracion').click();
  await operator.locator('#datos-exportar').click();
  await expect(operator.locator('#datos-mensaje')).toContainText('1 canciones');
  await app.close();

  await launch(join(dir, 'destino'));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, file);
  await operator.locator('#tab-configuracion').click();
  await operator.locator('#datos-importar').click();
  await expect(operator.locator('#datos-confirmar')).toContainText('reemplaza');
  await operator.locator('#datos-importar-si').click();

  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
  await operator.locator('#tab-canciones').click();
  await expect(operator.getByText('Santo')).toBeVisible();
});

test('un archivo equivocado avisa y no toca nada', async () => {
  await launch(join(dir, 'pc'));
  await operator.evaluate(() => window.ceflirics.songs.save({ title: 'Sigue', author: '', text: 'Letra' }));
  await app.evaluate(
    ({ dialog }, path) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
    },
    join(process.cwd(), 'package.json'),
  );
  await operator.locator('#tab-configuracion').click();
  await operator.locator('#datos-importar').click();
  await operator.locator('#datos-importar-si').click();
  await expect(operator.locator('#datos-mensaje')).toContainText('no es una copia');
  await operator.locator('#tab-canciones').click();
  await expect(operator.getByText('Sigue')).toBeVisible();
});
