import { _electron as electron, expect, test } from '@playwright/test';

test('la app abre la consola del operador con el puente seguro', async () => {
  const app = await electron.launch({ args: ['.'] });
  await app.firstWindow();
  // Con dos monitores la salida se abre sola y a veces carga primero.
  await expect.poll(() => app.windows().some((w) => w.url().includes('operator'))).toBe(true);
  const window = app.windows().find((w) => w.url().includes('operator'))!;

  await expect(window.locator('h1')).toHaveText('Ceflyrics');
  await expect(window.locator('small')).toContainText('Versión');
  await expect(window.locator('h1.logo')).toHaveCSS('mask-image', /logo-cef|svg/);
  await expect(window.locator('h1.logo')).toHaveCSS('width', '58px');

  // El renderer no debe tener acceso a Node.
  const nodeAccess = await window.evaluate(() => typeof (globalThis as any).require);
  expect(nodeAccess).toBe('undefined');

  await app.close();
});
