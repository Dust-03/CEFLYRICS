import { _electron as electron, expect, test } from '@playwright/test';

// Abre la salida de verdad: en una PC con dos monitores se ve unos segundos en el segundo.
test('con dos monitores la salida va a pantalla completa en el que no es el principal', async () => {
  const env = { ...process.env } as Record<string, string>;
  delete env.CEF_OUTPUT;
  const app = await electron.launch({ args: ['.'], env });
  const operator = await app.firstWindow();

  const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().length);
  if (displays < 2) {
    await app.close();
    test.skip(true, 'Hace falta un segundo monitor');
  }

  await expect.poll(() => app.windows().length).toBe(2);
  await expect(operator.locator('#estado-salida')).toHaveText('Salida en el segundo monitor');
  // Entrar en pantalla completa lleva un momento, más en una PC cargada.
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('output'))!
          .isFullScreen(),
      ),
    )
    .toBe(true);

  const placement = await app.evaluate(({ BrowserWindow, screen }) => {
    const windows = BrowserWindow.getAllWindows();
    const output = windows.find((w) => w.webContents.getURL().includes('output'))!;
    const operator = windows.find((w) => w.webContents.getURL().includes('operator'))!;
    const primary = screen.getPrimaryDisplay();
    return {
      fullscreen: output.isFullScreen(),
      outputDisplay: screen.getDisplayMatching(output.getBounds()).id,
      outputBounds: output.getBounds(),
      displayBounds: screen.getDisplayMatching(output.getBounds()).bounds,
      operatorDisplay: screen.getDisplayMatching(operator.getBounds()).id,
      primary: primary.id,
    };
  });
  console.log('Ubicación:', placement);

  expect(placement.fullscreen).toBe(true);
  expect(placement.outputDisplay).not.toBe(placement.primary);
  expect(placement.operatorDisplay).toBe(placement.primary);
  expect(placement.outputBounds).toEqual(placement.displayBounds);

  await app.close();
});
