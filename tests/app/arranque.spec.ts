import { _electron as electron, expect, test } from '@playwright/test';

test('la app abre la consola del operador con el puente seguro', async () => {
  const app = await electron.launch({ args: ['.'] });
  await app.firstWindow();
  // Con dos monitores la salida se abre sola y a veces carga primero.
  await expect.poll(() => app.windows().some((w) => w.url().includes('operator'))).toBe(true);
  const window = app.windows().find((w) => w.url().includes('operator'))!;

  await expect(window.locator('h1')).toHaveText('Ceflyrics');
  await expect(window.locator('small.version')).toContainText('Versión');
  // Sin instalar no hay de dónde actualizar, y se avisa en lugar de fallar callado.
  await window.locator('#btn-actualizar').dispatchEvent('click');
  await expect(window.locator('#estado-actualizacion')).toHaveText('Solo se actualiza la app instalada');
  await expect(window.locator('h1.logo')).toHaveCSS('mask-image', /logo-cef|svg/);
  await expect(window.locator('h1.logo')).toHaveCSS('width', '58px');

  // El renderer no debe tener acceso a Node.
  const nodeAccess = await window.evaluate(() => typeof (globalThis as any).require);
  expect(nodeAccess).toBe('undefined');

  await app.close();
});

test('la descarga de una actualización muestra su avance junto a la versión', async () => {
  const app = await electron.launch({ args: ['.'] });
  await app.firstWindow();
  await expect.poll(() => app.windows().some((w) => w.url().includes('operator'))).toBe(true);
  const window = app.windows().find((w) => w.url().includes('operator'))!;
  await expect(window.locator('#btn-actualizar')).toBeVisible();
  // Sin instalar no hay descarga real: se simula el aviso que manda el actualizador.
  const progress = (percent: number | null) =>
    app.evaluate(({ BrowserWindow }, value) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('app:update-progress', value);
    }, percent);

  await progress(42.7);
  await expect(window.locator('#descarga-actualizacion')).toHaveText('Descargando actualización… 42 %');
  await expect(window.locator('.update-bar')).toHaveAttribute('aria-valuenow', '42');
  await expect(window.locator('#btn-actualizar')).toHaveCount(0);

  await progress(null);
  await expect(window.locator('#descarga-actualizacion')).toHaveCount(0);
  await expect(window.locator('#btn-actualizar')).toBeVisible();
  await app.close();
});
