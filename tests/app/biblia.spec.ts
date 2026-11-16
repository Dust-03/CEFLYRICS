import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

let app: ElectronApplication;
let operator: Page;
let output: Page;

test.beforeEach(async () => {
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window' } });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  output = app.windows().find((w) => w.url().includes('output'))!;
  await output.waitForFunction(() => (window as any).__cefOutput);
  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
});

test.afterEach(async () => {
  await app.close();
});

const verses = () => operator.locator('#biblia-versos .verse');
const onOutput = () => output.locator('.cef-body');

test('los libros se separan por testamento, con el color de su grupo', async () => {
  const titles = await operator.locator('.books h3').allTextContents();
  expect(titles).toEqual(['Antiguo Testamento', 'Nuevo Testamento']);
  await expect(operator.locator('button.book')).toHaveCount(66);
  await expect(operator.locator('.books section').nth(0).locator('button.book')).toHaveCount(39);
  await expect(operator.locator('.books section').nth(1).locator('button.book')).toHaveCount(27);
  await expect(operator.locator('button[data-book="1"]')).toHaveAttribute('title', 'Génesis · Pentateuco');

  // Todos los libros tienen que entrar sin mover la barra.
  const scroll = await operator.locator('.books').evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(scroll).toBeLessThanOrEqual(0);

  const color = (book: number) =>
    operator.locator(`button[data-book="${book}"]`).evaluate((el) => getComputedStyle(el).color);
  expect(await color(1)).toBe(await color(5));
  expect(await color(1)).not.toBe(await color(40));
});

test('un versículo imprevisto llega al aire solo con el teclado, y no antes de confirmarlo', async () => {
  const start = Date.now();
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await expect(verses()).toHaveCount(1);
  await operator.locator('#biblia-buscar').press('Enter');

  // Enter lleva a la vista previa: al público todavía no llegó nada.
  await expect(operator.locator('#vista-previa .cef-body')).toContainText('de tal manera amó Dios');
  await expect(onOutput()).toHaveText('');

  await operator.locator('#biblia-versos').press('Enter');
  await expect(onOutput()).toContainText('de tal manera amó Dios');
  await expect(output.locator('.cef-title')).toHaveText('Juan 3:16 · RV1909');
  console.log('Cita al aire en', Date.now() - start, 'ms');
});

test('elegir libro y capítulo muestra los versículos, y las flechas siguen al aire', async () => {
  await operator.locator('button[data-book="19"]').click();
  await operator.locator('button[data-chapter="23"]').click();
  await expect(verses()).toHaveCount(6);
  await verses().first().click();
  await operator.locator('#btn-aire').click();
  await expect(onOutput()).toHaveText('JEHOVÁ es mi pastor; nada me faltará.');

  await operator.locator('#biblia-versos').press('ArrowDown');
  await expect(onOutput()).toContainText('En lugares de delicados pastos');
  await expect(output.locator('.cef-title')).toHaveText('Salmos 23:2 · RV1909');
});

test('el selector de versículo carga solo el elegido y lo deja en vista previa', async () => {
  await operator.locator('button[data-book="19"]').click();
  await operator.locator('button[data-chapter="23"]').click();
  await expect(operator.locator('[data-verse-number]')).toHaveCount(6);
  await operator.locator('[data-verse-number="2"]').click();
  await expect(verses()).toHaveCount(1);
  await expect(verses().first()).toContainText('En lugares de delicados pastos');
  await expect(operator.locator('#vista-previa .cef-title')).toHaveText('Salmos 23:2 · RV1909');
  await expect(onOutput()).toHaveText('');
  await expect(operator.locator('[data-verse-number="2"]')).toHaveAttribute('aria-pressed', 'true');
});

test('las flechas anterior y siguiente recorren también una cita de un solo versículo', async () => {
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await expect(verses()).toHaveCount(1);
  await expect(operator.locator('#biblia-anterior')).toBeEnabled();
  await operator.locator('#biblia-anterior').click();
  await expect(verses().first()).toContainText('Juan 3:15');
  await expect(onOutput()).toHaveText('');
  await operator.locator('#biblia-versos').press('ArrowRight');
  await expect(verses().first()).toContainText('Juan 3:16');
  await operator.locator('#biblia-siguiente').click();
  await expect(verses().first()).toContainText('Juan 3:17');
});

test('las flechas no tocan el aire si lo elegido no está al aire', async () => {
  await operator.locator('#biblia-buscar').fill('sal 23');
  await expect(verses()).toHaveCount(6);
  await verses().first().click();
  await operator.locator('#biblia-versos').press('ArrowDown');
  await expect(operator.locator('#vista-previa .cef-body')).toContainText('En lugares de delicados pastos');
  await expect(onOutput()).toHaveText('');
});

test('busca por palabra sin importar los acentos, y avisa si no hay nada', async () => {
  await operator.locator('#biblia-buscar').fill('unigenito');
  await expect(verses().first()).toContainText('unigénito');
  await operator.locator('#biblia-buscar').fill('xyzzy');
  await expect(operator.locator('#biblia-versos')).toContainText('No se encontró');
  await operator.locator('#biblia-buscar').fill('juan 99:1');
  await expect(operator.locator('#biblia-versos')).toContainText('No se encontró');
});

test('cambiar de versión mantiene el pasaje', async () => {
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await expect(verses().first()).toContainText('de tal manera amó');
  await operator.locator('#biblia-version').selectOption('KJV');
  await expect(verses().first()).toContainText('For God so loved the world');
  await expect(verses().first()).toContainText('John 3:16');
});

test('el modo claro y oscuro cambia la consola, se recuerda y no toca la salida', async () => {
  const background = () => operator.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await operator.evaluate(() => localStorage.removeItem('cef-theme'));
  await operator.reload();
  await expect(operator.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await background();
  const outputBefore = await output.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await operator.locator('#btn-tema').click();
  await expect(operator.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await background()).not.toBe(dark);
  expect(await output.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(outputBefore);

  await operator.reload();
  await expect(operator.locator('html')).toHaveAttribute('data-theme', 'light');
  await operator.evaluate(() => localStorage.removeItem('cef-theme'));
});
