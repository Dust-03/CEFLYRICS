import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { openDatabase, type Db } from '../../src/main/db/database';
import { MediaService } from '../../src/main/media';
import { SongService } from '../../src/main/songs';
import { ThemeService } from '../../src/main/themes';
import { labelName, parseSongText, toSongText } from '../../src/shared/song-text';
import { parseAction } from '../../src/shared/state';
import { DEFAULT_THEME, FACTORY_THEMES, parseTheme } from '../../src/shared/theme';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-lib-'));
  db = openDatabase(join(dir, 'prueba.db'));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const LYRICS =
  'Primera estrofa\nsegunda línea\n\nCoro\nEl coro\n// entra la batería\n\n[Verso 2]\nOtra estrofa\n\nPuente:\nEl puente';

test('la letra se separa en diapositivas con etiqueta', () => {
  expect(parseSongText(LYRICS)).toEqual([
    { label: 'V1', text: 'Primera estrofa\nsegunda línea', returnNotes: '' },
    { label: 'C', text: 'El coro', returnNotes: 'entra la batería' },
    { label: 'V2', text: 'Otra estrofa', returnNotes: '' },
    { label: 'P', text: 'El puente', returnNotes: '' },
  ]);
});

test('sin etiquetas numera los versos, y acepta saltos de línea de Windows', () => {
  expect(parseSongText('Uno\r\n\r\nDos\r\n\r\n\r\nTres').map((s) => s.label)).toEqual(['V1', 'V2', 'V3']);
  expect(parseSongText('   \n\n')).toEqual([]);
});

test('una línea que solo se parece a una etiqueta sigue siendo letra', () => {
  expect(parseSongText('Coro de ángeles canta')[0]).toMatchObject({ label: 'V1', text: 'Coro de ángeles canta' });
});

test('la letra va y vuelve del editor sin perder nada', () => {
  const slides = parseSongText(LYRICS);
  expect(parseSongText(toSongText(slides))).toEqual(slides);
  expect(labelName('V2')).toBe('Verso 2');
  expect(labelName('C')).toBe('Coro');
});

test('guarda, busca sin acentos, edita y borra una canción', () => {
  const songs = new SongService(db);
  const id = songs.save({ title: 'Canción de prueba', author: 'Autor', text: LYRICS });

  expect(songs.get(id)?.slides).toHaveLength(4);
  expect(songs.list('cancion').map((s) => s.id)).toEqual([id]);
  expect(songs.list('linea').map((s) => s.id)).toEqual([id]);
  expect(songs.list('nada que ver')).toEqual([]);

  songs.save({ id, title: 'Otro título', author: '', text: 'Letra nueva' });
  expect(songs.get(id)).toMatchObject({ title: 'Otro título', slides: [{ text: 'Letra nueva' }] });
  expect(songs.list('estrofa')).toEqual([]);
  expect(songs.list('nueva').map((s) => s.id)).toEqual([id]);

  songs.remove(id);
  expect(songs.get(id)).toBeNull();
  expect(songs.list('nueva')).toEqual([]);
  expect(db.prepare('SELECT COUNT(*) AS n FROM song_slides').get()).toEqual({ n: 0 });
});

test('no guarda una canción sin título o sin letra', () => {
  const songs = new SongService(db);
  expect(() => songs.save({ title: ' ', author: '', text: 'Letra' })).toThrow(/título/);
  expect(() => songs.save({ title: 'Título', author: '', text: ' ' })).toThrow(/letra/);
});

test('con 5.000 canciones la búsqueda responde en menos de 100 ms', () => {
  const songs = new SongService(db);
  db.transaction(() => {
    for (let i = 0; i < 5000; i++) {
      songs.save({ title: `Canción ${i}`, author: '', text: `Letra número ${i}\n\nCoro de la canción ${i % 50}` });
    }
  })();
  for (const query of ['coro', 'cancion 49', '']) {
    const start = performance.now();
    songs.list(query);
    expect(performance.now() - start, query).toBeLessThan(100);
  }
});

test('un archivo importado dos veces ocupa lugar una sola vez, y se rechaza lo que no sirve', async () => {
  const folder = join(dir, 'media');
  const media = new MediaService(db, folder);
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, 'contenido');
  writeFileSync(join(dir, 'copia.png'), 'contenido');
  writeFileSync(join(dir, 'virus.exe'), 'x');

  const result = await media.add([photo, join(dir, 'copia.png'), join(dir, 'virus.exe')]);
  expect(result).toEqual({ added: 1, rejected: ['virus.exe'] });
  expect(await media.list()).toHaveLength(1);
  expect(readdirSync(folder)).toHaveLength(1);

  await media.remove((await media.list())[0].id);
  expect(await media.list()).toEqual([]);
  expect(readdirSync(folder)).toEqual([]);
});

test('el protocolo de medios sirve rangos y no sale de su carpeta', async () => {
  const media = new MediaService(db, join(dir, 'media'));
  const video = join(dir, 'video.mp4');
  writeFileSync(video, '0123456789');
  await media.add([video]);
  const [{ url }] = await media.list();

  const whole = await media.serve(new Request(url.replace('cef-media:', 'http:')));
  expect(await whole.text()).toBe('0123456789');

  const part = await media.serve(new Request(url.replace('cef-media:', 'http:'), { headers: { range: 'bytes=2-5' } }));
  expect(part.status).toBe(206);
  expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
  expect(await part.text()).toBe('2345');

  const escape = await media.serve(new Request('http://media/..%2F..%2Fprueba.db'));
  expect(escape.status).toBe(404);
});

test('la miniatura se hace una vez, se sirve y se borra con el archivo', async () => {
  const folder = join(dir, 'media');
  let made = 0;
  const media = new MediaService(db, folder, async () => {
    made++;
    return Buffer.from('jpeg');
  });
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, 'contenido');
  await media.add([photo]);

  const [item] = await media.list();
  await media.list();
  expect(made).toBe(1);
  expect(item.thumb).toMatch(/\.thumb\.jpg$/);
  const response = await media.serve(new Request(item.thumb!.replace('cef-media:', 'http:')));
  expect(await response.text()).toBe('jpeg');

  await media.remove(item.id);
  expect(readdirSync(folder)).toEqual([]);
});

test('sin miniatura el medio sigue funcionando', async () => {
  const media = new MediaService(db, join(dir, 'media'), async () => {
    throw new Error('no se pudo');
  });
  const video = join(dir, 'video.mp4');
  writeFileSync(video, 'contenido');
  await media.add([video]);
  const [item] = await media.list();
  expect(item.thumb).toBeUndefined();
});

test('los estilos propios se guardan y al borrarlos vuelve el de fábrica', () => {
  const themes = new ThemeService(db);
  expect(themes.list()).toHaveLength(FACTORY_THEMES.length);

  const id = themes.save({ name: 'Mío', theme: { ...DEFAULT_THEME, font: 'lora' } });
  themes.assign({ song: id, bible: FACTORY_THEMES[1].id });
  expect(themes.assignment()).toEqual({ song: id, bible: FACTORY_THEMES[1].id });
  expect(themes.list().at(-1)).toMatchObject({ name: 'Mío', factory: false, theme: { font: 'lora' } });

  themes.remove(id);
  expect(themes.assignment().song).toBe(FACTORY_THEMES[0].id);
  expect(themes.assignment().bible).toBe(FACTORY_THEMES[1].id);
  expect(() => themes.save({ name: ' ', theme: DEFAULT_THEME })).toThrow();
});

test('los estilos y medios inválidos se rechazan', () => {
  expect(parseTheme({ ...DEFAULT_THEME, font: 'comic' })).toBeNull();
  expect(parseTheme({ ...DEFAULT_THEME, color: 'red; background: url(x)' })).toBeNull();
  expect(parseTheme({ ...DEFAULT_THEME, background: { kind: 'css', value: 'url(http://x/y.png)' } })).toBeNull();
  expect(parseTheme({ ...DEFAULT_THEME, background: { kind: 'image', url: 'file:///c:/secreto.png' } })).toBeNull();
  expect(parseTheme({ ...DEFAULT_THEME, scale: 99 })?.scale).toBe(1.6);
  for (const entry of FACTORY_THEMES) expect(parseTheme(entry.theme), entry.name).toEqual(entry.theme);

  const slide = { body: '', title: '', media: { kind: 'image', url: 'file:///c:/secreto.png', loop: false } };
  expect(parseAction({ type: 'show-slide', slide })).toBeNull();
});
