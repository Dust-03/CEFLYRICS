import { readFileSync } from 'node:fs';
import { expect, test as setup } from '@playwright/test';
import { TOKEN, VIDEO } from './helpers';
import { videoFrameDurationsMs } from './mp4';

// Un patrón con huecos o cadencia irregular falsea todas las mediciones: se revisa antes de medir.
setup('el patrón de prueba tiene cadencia pareja', async ({ page }) => {
  await page.goto(`/generar?token=${TOKEN}`);
  await page.locator('#duracion').fill('8');
  await page.locator('#btn-grabar').click();
  await expect(page.locator('#estado')).toContainText(`Listo: ${VIDEO}`, { timeout: 40_000 });

  // El primer y el último cuadro pueden tener una duración especial.
  const frames = videoFrameDurationsMs(readFileSync(`tests/.media/${VIDEO}`)).slice(1, -1);
  const even = frames.filter((ms) => ms > 28 && ms < 39).length;
  console.log('Patrón:', { cuadros: frames.length, parejos: even, maxMs: Math.round(Math.max(...frames)) });

  expect(frames.length).toBeGreaterThan(220);
  expect(Math.max(...frames)).toBeLessThan(100);
  expect(even / frames.length).toBeGreaterThan(0.95);
});
