import { _electron as electron, expect, test } from '@playwright/test';

test('la app abre la consola del operador con el puente seguro', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();

  await expect(window.locator('h1')).toHaveText('CEF');
  await expect(window.locator('small')).toContainText('Versión');
  await expect(window.locator('h1.logo')).toHaveCSS('mask-image', /logo-cef|svg/);
  await expect(window.locator('h1.logo')).toHaveCSS('width', '60px');

  // El renderer no debe tener acceso a Node.
  const nodeAccess = await window.evaluate(() => typeof (globalThis as any).require);
  expect(nodeAccess).toBe('undefined');

  await app.close();
});
