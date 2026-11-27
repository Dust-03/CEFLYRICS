import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
// Fuera de Electron, el paquete devuelve la ruta del ejecutable.
import electronPath from 'electron';

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

test('abrir el programa de nuevo trae al frente el que ya está', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'cef-instancia-'));
  const env = { ...process.env, CEF_USER_DATA: folder, CEF_OUTPUT: 'window' } as Record<string, string>;
  const app = await electron.launch({ args: ['.'], env });
  await app.firstWindow();
  await expect.poll(() => app.windows().some((w) => w.url().includes('operator'))).toBe(true);
  const operator = await app.browserWindow(app.windows().find((w) => w.url().includes('operator'))!);
  await expect.poll(() => operator.evaluate((w) => w.isVisible())).toBe(true);
  await operator.evaluate((w) => w.minimize());
  await expect.poll(() => operator.evaluate((w) => w.isMinimized())).toBe(true);
  const windows = app.windows().length;

  const second = spawn(String(electronPath), ['.'], { env, stdio: 'ignore' });
  try {
    await expect.poll(() => second.exitCode, { timeout: 15_000 }).toBe(0);
    await expect.poll(() => operator.evaluate((w) => w.isMinimized())).toBe(false);
    expect(app.windows()).toHaveLength(windows);
  } finally {
    second.kill();
    await app.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('los avisos de la salida y de los botones no dejan errores en la consola', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'cef-avisos-'));
  const env = { ...process.env, CEF_USER_DATA: folder, CEF_OUTPUT: 'window' } as Record<string, string>;
  const app = await electron.launch({ args: ['.'], env });
  try {
    await app.firstWindow();
    await expect.poll(() => app.windows().some((w) => w.url().includes('operator'))).toBe(true);
    const operator = app.windows().find((w) => w.url().includes('operator'))!;
    const errors: string[] = [];
    operator.on('pageerror', (error) => errors.push(error.message));
    const toggle = operator.locator('#btn-salida');
    await expect(toggle).toHaveText('Cerrar salida');

    await toggle.click();
    await expect(toggle).toHaveText('Abrir salida');
    await operator.evaluate(async () => {
      const { keys } = (globalThis as any).ceflyrics;
      const [first, ...rest] = await keys.get();
      await keys.save([{ ...first, label: 'Prueba' }, ...rest]);
    });
    await expect(operator.getByRole('button', { name: /Prueba/ })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
  }
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
