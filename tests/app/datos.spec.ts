import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

let dir: string;
let app: ElectronApplication;
let operator: Page;

async function launch(folder: string) {
  app = await electron.launch({ args: ['.'], env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: folder } });
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(2);
  operator = app.windows().find((w) => w.url().includes('operator'))!;
  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
}

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-dat-'));
});

test.afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('los datos se exportan de una PC y se importan en otra', async () => {
  const file = join(dir, 'copia.ceflyrics');
  await launch(join(dir, 'origen'));
  await operator.evaluate(() => window.ceflyrics.songs.save({ title: 'Santo', author: '', text: 'Letra' }));
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, file);
  await operator.locator('#tab-configuracion').click();
  await operator.locator('#config-datos').click();
  await operator.locator('#datos-exportar').click();
  await expect(operator.locator('#datos-mensaje')).toContainText('1 canciones');
  await app.close();

  await launch(join(dir, 'destino'));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, file);
  await operator.locator('#tab-configuracion').click();
  await operator.locator('#config-datos').click();
  await operator.locator('#datos-importar').click();
  await expect(operator.locator('#datos-confirmar')).toContainText('reemplaza');
  await operator.locator('#datos-importar-si').click();

  await expect(operator.locator('button[data-book="43"]')).toBeVisible();
  await operator.locator('#tab-canciones').click();
  await expect(operator.getByText('Santo')).toBeVisible();
});

test('un archivo equivocado avisa y no toca nada', async () => {
  await launch(join(dir, 'pc'));
  await operator.evaluate(() => window.ceflyrics.songs.save({ title: 'Sigue', author: '', text: 'Letra' }));
  await app.evaluate(
    ({ dialog }, path) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
    },
    join(process.cwd(), 'package.json'),
  );
  await operator.locator('#tab-configuracion').click();
  await operator.locator('#config-datos').click();
  await operator.locator('#datos-importar').click();
  await operator.locator('#datos-importar-si').click();
  await expect(operator.locator('#datos-mensaje')).toContainText('no es una copia');
  await operator.locator('#tab-canciones').click();
  await expect(operator.getByText('Sigue')).toBeVisible();
});

const pick = (files: string[]) =>
  app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as typeof dialog.showOpenDialog;
  }, files);

test('las canciones se importan de TXT y OpenLyrics, y se exportan', async () => {
  await launch(join(dir, 'pc'));
  const txt = join(dir, 'Cuán grande es Él.txt');
  writeFileSync(txt, Buffer.from('C\nCuán grande\n\nV2\nMi corazón', 'latin1'));
  const xml = join(dir, 'abierta.xml');
  writeFileSync(
    xml,
    '<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>Himno &amp; gloria</title></titles></properties><lyrics><verse name="v1"><lines>Línea uno<br/>Línea dos</lines></verse></lyrics></song>',
  );
  const empty = join(dir, 'vacia.txt');
  writeFileSync(empty, '   ');
  await pick([txt, xml, empty]);

  await operator.locator('#tab-configuracion').click();
  await operator.locator('#config-datos').click();
  await operator.locator('#canciones-importar').click();
  await expect(operator.locator('#datos-mensaje')).toContainText('Entraron 2 canciones');
  await expect(operator.locator('#datos-rechazados')).toContainText('vacia.txt');

  await operator.locator('#tab-canciones').click();
  await operator.getByText('Cuán grande es Él').click();
  await expect(operator.locator('#cancion-diapositivas .slide')).toHaveCount(2);
  await expect(operator.locator('#cancion-diapositivas .slide').first()).toContainText('Coro');
  await expect(operator.locator('#cancion-diapositivas .slide').first()).not.toContainText(/^C\b/);

  const folder = join(dir, 'exportadas');
  mkdirSync(folder);
  await pick([folder]);
  await operator.locator('#tab-configuracion').click();
  await operator.locator('#canciones-exportar').click();
  await expect(operator.locator('#datos-mensaje')).toContainText('Se guardaron 2 canciones');
  expect(readdirSync(folder).sort()).toEqual(['Cuán grande es Él.txt', 'Himno & gloria.txt']);
  expect(readFileSync(join(folder, 'Himno & gloria.txt'), 'utf8')).toContain('Línea dos');
});

test('una Biblia en USFM se importa con aviso, se usa y se borra', async () => {
  await launch(join(dir, 'pc'));
  const john = join(dir, '43JHN.usfm');
  writeFileSync(john, '\\id JHN\n\\h Juan\n\\c 3\n\\p\n\\v 16 Texto de prueba importado.\n');
  const bad = join(dir, 'malo.usfm');
  writeFileSync(bad, '\\id XXX\n\\c 1\n\\v 1 Algo\n');
  await pick([john, bad]);

  await operator.locator('#tab-configuracion').click();
  await operator.locator('#config-datos').click();
  await operator.locator('#biblia-nombre').fill('Versión de prueba');
  await operator.locator('#biblia-sigla').fill('prueba');
  await expect(operator.locator('#biblia-importar')).toBeDisabled();
  await operator.locator('#biblia-acepto').check();
  await operator.locator('#biblia-importar').click();
  await expect(operator.locator('#datos-mensaje')).toContainText('Entraron 1 libros');
  await expect(operator.locator('#datos-rechazados')).toContainText('malo.usfm');
  await expect(operator.locator('#biblias-importadas')).toContainText('PRUEBA');

  await operator.locator('#tab-biblia').click();
  await operator.locator('#biblia-version').selectOption('PRUEBA');
  await operator.locator('#biblia-buscar').fill('jn 3 16');
  await expect(operator.locator('[data-atajo="Juan 3:16"]').locator('xpath=..')).toContainText(
    'Texto de prueba importado',
  );

  await operator.locator('#tab-configuracion').click();
  await operator.locator('[data-borrar-biblia]').click();
  await operator.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(operator.locator('#biblias-importadas')).toHaveCount(0);
  await operator.locator('#tab-biblia').click();
  await expect(operator.locator('#biblia-version option')).toHaveCount(4);
});
