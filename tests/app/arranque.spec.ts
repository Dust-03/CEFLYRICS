import { _electron as electron, expect, test } from '@playwright/test';

test('la app abre la consola del operador con el puente seguro', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();

  await expect(window.locator('h1')).toHaveText('CEFLIRICS');
  await expect(window.locator('small')).toContainText('Versión');

  // El renderer no debe tener acceso a Node.
  const nodeAccess = await window.evaluate(() => typeof (globalThis as any).require);
  expect(nodeAccess).toBe('undefined');

  await app.close();
});
