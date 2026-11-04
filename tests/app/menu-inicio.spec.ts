import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

let dir: string;
let app: ElectronApplication;
let operator: Page;

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cef-men-'));
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
});

test.afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('volver a tocar Biblia limpia la búsqueda y el libro, y conserva la versión', async () => {
  await operator.locator('#biblia-version').selectOption('KJV');
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await expect(operator.locator('[data-atajo="John 3:16"]')).toBeVisible();

  await operator.locator('#tab-biblia').click();
  await expect(operator.locator('#biblia-buscar')).toHaveValue('');
  await expect(operator.locator('[data-atajo="John 3:16"]')).toHaveCount(0);
  await expect(operator.locator('#biblia-version')).toHaveValue('KJV');
  await expect(operator.locator('#biblia-buscar')).toBeFocused();
});

test('volver a tocar Canciones vuelve a la lista, salvo que se esté escribiendo', async () => {
  await operator.locator('#tab-canciones').click();
  await operator.locator('#cancion-nueva').click();
  await operator.locator('#cancion-titulo').fill('Mi canción');
  await operator.locator('#cancion-letra').fill('Una letra');

  await operator.locator('#tab-canciones').click();
  await expect(operator.locator('#cancion-letra')).toHaveValue('Una letra');

  await operator.locator('#cancion-guardar').click();
  await expect(operator.locator('#cancion-diapositivas')).toBeVisible();
  await operator.locator('#tab-canciones').click();
  await expect(operator.locator('#cancion-diapositivas')).toHaveCount(0);
});

test('entrar a otro menú y volver no borra lo que había', async () => {
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await operator.locator('#tab-canciones').click();
  await operator.locator('#tab-biblia').click();
  await expect(operator.locator('#biblia-buscar')).toHaveValue('jn 3 16');
});

test('volver a tocar Temporizadores cierra el formulario, y Configuración el editor', async () => {
  await operator.locator('#tab-temporizadores').click();
  await operator.locator('#temporizador-nuevo').click();
  await operator.locator('#tab-temporizadores').click();
  await expect(operator.locator('#temporizador-form')).toHaveCount(0);

  await operator.locator('#tab-configuracion').click();
  await operator.locator('#estilos button').first().click();
  await expect(operator.locator('#estilo-fuente')).toBeVisible();
  await operator.locator('#tab-configuracion').click();
  await expect(operator.locator('#estilo-fuente')).toHaveCount(0);
});

test('con Negro puesto, mandar al aire desde la PC lo saca', async () => {
  const output = app.windows().find((w) => w.url().includes('output'))!;
  await operator.evaluate(() => window.ceflyrics.dispatch({ type: 'toggle-mode', mode: 'black' }));
  await expect(output.locator('.cef-black')).toHaveClass(/cef-on/);
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await operator.locator('[data-atajo="Juan 3:16"]').locator('xpath=..').locator('button').first().dblclick();
  await expect(output.locator('.cef-black')).not.toHaveClass(/cef-on/);
  await expect(output.locator('.cef-body')).toContainText('de tal manera');
});
