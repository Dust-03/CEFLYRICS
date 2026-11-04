import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

let dir: string;
let app: ElectronApplication;
let operator: Page;

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cef-ini-'));
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
  operator = await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
});

test.afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('al abrir se anima el logo, con todas sus partes, y después se va solo', async () => {
  const splash = operator.locator('#inicio');
  await expect(splash).toBeVisible();
  await expect(splash.locator('.letter')).toHaveCount(6);
  await expect(splash.locator('.orbit path')).toHaveCount(1);
  const flapping = await operator.evaluate(() =>
    document.getAnimations().some((animation) => (animation.effect as KeyframeEffect).getKeyframes()[0]?.d),
  );
  expect(flapping).toBe(true);
  await expect(splash).toHaveCount(0, { timeout: 8000 });
});

test('la animación no aparece en la salida', async () => {
  const output = app.windows().find((w) => w.url().includes('output'))!;
  await output.waitForFunction(() => (window as any).__cefOutput);
  await expect(output.locator('#inicio')).toHaveCount(0);
});

test('una tecla la saltea', async () => {
  await expect(operator.locator('#inicio')).toBeVisible();
  await operator.locator('#biblia-buscar').focus();
  await operator.keyboard.press('j');
  await expect(operator.locator('#inicio')).toHaveCount(0, { timeout: 1000 });
  // Lo que se escribió durante la animación no se pierde.
  await expect(operator.locator('#biblia-buscar')).toHaveValue('j');
});

test('un clic la saltea y llega a lo que hay abajo', async () => {
  await expect(operator.locator('#inicio')).toBeVisible();
  await operator.locator('#tab-canciones').click();
  await expect(operator.locator('#inicio')).toHaveCount(0, { timeout: 1000 });
  await expect(operator.locator('#tab-canciones')).toHaveClass(/active/);
});
