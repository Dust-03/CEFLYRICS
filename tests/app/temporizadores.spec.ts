import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

let dir: string;
let app: ElectronApplication;
let operator: Page;
let output: Page;

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cef-tmr-'));
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  output = app.windows().find((w) => w.url().includes('output'))!;
  await output.waitForFunction(() => (window as any).__cefOutput);
  await operator.locator('#tab-temporizadores').click();
});

test.afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function addDuration(name: string, seconds: number, message = '') {
  await operator.locator('#temporizador-nuevo').click();
  await operator.locator('#temporizador-nombre').fill(name);
  await operator.locator('#temporizador-minutos').fill(String(Math.floor(seconds / 60)));
  await operator.locator('#temporizador-segundos').fill(String(seconds % 60));
  await operator.locator('#temporizador-mensaje').fill(message);
  await operator.locator('#temporizador-guardar').click();
  await expect(operator.locator('.timer', { hasText: name })).toBeVisible();
  return operator.locator('.timer', { hasText: name });
}

const shownTime = () => output.locator('.cef-timer-time');

test('un temporizador de duración arranca, se ve, se pausa y sigue', async () => {
  const timer = await addDuration('Ofrenda', 90);
  await expect(timer.locator('.time')).toHaveText('01:30');

  await timer.locator('[data-completa]').click();
  await expect(shownTime()).toHaveText(/01:(2\d|30)/);
  await expect(output.locator('.cef-timer-label')).toHaveText('Ofrenda');

  await timer.locator('[data-pausar]').click();
  const paused = await shownTime().textContent();
  await output.waitForTimeout(1300);
  await expect(shownTime()).toHaveText(paused!);

  await timer.locator('[data-iniciar]').click();
  await expect(shownTime()).not.toHaveText(paused!, { timeout: 3000 });
  await expect(timer.locator('[data-iniciar]')).toHaveCount(0);
});

test('al llegar a cero muestra el mensaje', async () => {
  const timer = await addDuration('Corto', 2, '¡Comenzamos!');
  await timer.locator('[data-completa]').click();
  await expect(shownTime()).toHaveText('00:02');
  await expect(shownTime()).toHaveText('¡Comenzamos!', { timeout: 4000 });
});

test('sin mensaje se queda en 00:00', async () => {
  const timer = await addDuration('Sin mensaje', 1);
  await timer.locator('[data-completa]').click();
  await expect(shownTime()).toHaveText('00:00', { timeout: 3000 });
});

test('la cuenta atrás hasta una hora calcula lo que falta', async () => {
  const soon = new Date(Date.now() + 90 * 60_000);
  const clock = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
  await operator.locator('#temporizador-nuevo').click();
  await operator.locator('#temporizador-nombre').fill('Comienza el culto');
  await operator.locator('#temporizador-tipo-hora').check({ force: true });
  await operator.locator('#temporizador-hora').fill(clock);
  await operator.locator('#temporizador-guardar').click();

  const timer = operator.locator('.timer', { hasText: 'Comienza el culto' });
  await expect(timer).toContainText(`Hasta las ${clock}`);
  await timer.locator('[data-completa]').click();
  // Faltan entre 1:29:00 y 1:30:00, según los segundos de este momento.
  await expect(shownTime()).toHaveText(/^1:(29:\d\d|30:00)$/);
  // Hasta una hora no se pausa: el reloj no se detiene.
  await expect(timer.locator('[data-pausar]')).toHaveCount(0);
});

test('varios corren a la vez, y uno va en la esquina sobre lo proyectado', async () => {
  const first = await addDuration('Primero', 600);
  const second = await addDuration('Segundo', 300);
  await first.locator('[data-iniciar]').click();
  await second.locator('[data-iniciar]').click();
  await expect(first.locator('.time')).toHaveText(/^(10:00|09:\d\d)$/);
  await expect(second.locator('.time')).toHaveText(/^(05:00|04:\d\d)$/);

  await operator.evaluate(() =>
    (window as any).ceflyrics.dispatch({ type: 'show-slide', slide: { body: 'Versículo', title: '' } }),
  );
  await second.locator('[data-esquina]').click();
  await expect(output.locator('.cef-timer.cef-timer-corner')).toBeVisible();
  await expect(output.locator('.cef-text.cef-on')).toHaveCount(1);

  await first.locator('[data-completa]').click();
  await expect(output.locator('.cef-timer.cef-timer-corner')).toHaveCount(0);
  await expect(output.locator('.cef-text.cef-on')).toHaveCount(0);

  await first.locator('[data-completa]').click();
  await expect(output.locator('.cef-timer.cef-on')).toHaveCount(0);
  await expect(output.locator('.cef-text.cef-on')).toHaveCount(1);
  await expect(first.locator('[data-detener]')).toBeVisible();
});

test('a pantalla completa usa el estilo de Canciones, y en la esquina no', async () => {
  await operator.locator('#tab-configuracion').click();
  await operator.locator('[data-usar-canciones="fabrica-amanecer"]').click();
  await operator.locator('#tab-temporizadores').click();
  const timer = await addDuration('Con estilo', 120);
  await timer.locator('[data-completa]').click();
  await expect(output.locator('.cef-background')).toHaveCSS('background-image', /linear-gradient/);
  await expect(output.locator('.cef-timer')).toHaveCSS('font-family', /Montserrat/);

  await timer.locator('[data-completa]').click();
  await expect(output.locator('.cef-background')).toHaveCSS('background-image', /radial-gradient/);
});

test('F10 lo tapa, y detener lo saca', async () => {
  const timer = await addDuration('Tapado', 120);
  await timer.locator('[data-completa]').click();
  await expect(output.locator('.cef-timer.cef-on')).toHaveCount(1);
  await operator.evaluate(() => (window as any).ceflyrics.dispatch({ type: 'toggle-mode', mode: 'black' }));
  await expect(output.locator('.cef-timer.cef-on')).toHaveCount(0);
  await operator.evaluate(() => (window as any).ceflyrics.dispatch({ type: 'toggle-mode', mode: 'black' }));
  await expect(output.locator('.cef-timer.cef-on')).toHaveCount(1);

  await timer.locator('[data-detener]').click();
  await expect(output.locator('.cef-timer.cef-on')).toHaveCount(0);
  await expect(timer.locator('.time')).toHaveText('02:00');
});

test('avisa si falta el nombre, se edita y se borra con confirmación', async () => {
  await operator.locator('#temporizador-nuevo').click();
  await operator.locator('#temporizador-guardar').click();
  await expect(operator.locator('#temporizador-error')).toHaveText('Falta el nombre del temporizador');
  await operator.locator('#temporizador-nombre').fill('Editar');
  await operator.locator('#temporizador-guardar').click();

  const timer = operator.locator('.timer', { hasText: 'Editar' }).first();
  await timer.locator('[data-editar]').click();
  await operator.locator('#temporizador-minutos').fill('7');
  await operator.locator('#temporizador-guardar').click();
  await expect(timer.locator('.time')).toHaveText('07:00');

  await timer.locator('[data-borrar]').click();
  await timer.locator('[data-borrar-si]').click();
  await expect(operator.locator('.timer')).toHaveCount(0);
});

test('los temporizadores se guardan al cerrar la app', async () => {
  await addDuration('Queda guardado', 60);
  await app.close();
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: dir } });
  operator = await app.firstWindow();
  await operator.locator('#tab-temporizadores').click();
  await expect(operator.locator('.timer', { hasText: 'Queda guardado' })).toBeVisible();
});

test('Configuración reúne los estilos y fuentes', async () => {
  await operator.locator('#tab-configuracion').click();
  await expect(operator.getByRole('heading', { name: 'Configuración · Estilos y fuentes' })).toBeVisible();
  await expect(operator.locator('#estilos')).toBeVisible();
  await expect(operator.locator('#tab-estilos')).toHaveCount(0);
});
