import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { BackupService } from '../../src/main/backup';
import { BibleImporter } from '../../src/main/bible/import';
import { BibleService } from '../../src/main/bible/service';
import { openDatabase, type Db } from '../../src/main/db/database';
import { MediaService } from '../../src/main/media';
import { SongService } from '../../src/main/songs';
import { DEFAULT_THEME } from '../../src/shared/theme';
import { ThemeService } from '../../src/main/themes';
import { TimerService } from '../../src/main/timers';

type Pc = { db: Db; folder: string; backup: BackupService; songs: SongService; media: MediaService };

let dir: string;
let origin: Pc;
let target: Pc;

function newPc(name: string): Pc {
  const folder = join(dir, name);
  mkdirSync(folder);
  const db = openDatabase(join(folder, 'datos.db'));
  const mediaFolder = join(folder, 'media');
  return {
    db,
    folder: mediaFolder,
    backup: new BackupService(db, mediaFolder),
    songs: new SongService(db),
    media: new MediaService(db, mediaFolder, async () => Buffer.from('miniatura')),
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-respaldo-'));
  origin = newPc('origen');
  target = newPc('destino');
});

afterEach(() => {
  origin.db.close();
  target.db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function fillOrigin() {
  origin.songs.save({ title: 'Santo', author: 'Autor', text: 'Primera\n\nSegunda' });
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, 'imagen de prueba');
  await origin.media.add([photo]);
  await origin.media.list();
  new ThemeService(origin.db).save({ name: 'Mío', theme: DEFAULT_THEME });
  new TimerService(origin.db).save({ name: 'Culto', kind: 'duration', seconds: 60, clock: '', message: 'Ya' });
  origin.db.prepare(`INSERT INTO shortcuts (ref, position) VALUES ('song:1', 1)`).run();
  origin.db.prepare(`INSERT INTO settings (key, value_json) VALUES ('lan.pin', '"123456"')`).run();
}

test('pasa todo a otra PC, y las canciones se pueden buscar', async () => {
  await fillOrigin();
  const file = join(dir, 'copia.ceflyrics');
  const exported = await origin.backup.export(file);
  expect(exported).toEqual({ songs: 1, media: 1, themes: 1, timers: 1, shortcuts: 1, bibles: 0 });

  target.songs.save({ title: 'Se reemplaza', author: '', text: 'Vieja' });
  const imported = await target.backup.import(file);
  expect(imported).toEqual(exported);

  expect(target.songs.list('').map((song) => song.title)).toEqual(['Santo']);
  expect(target.songs.list('segunda')).toHaveLength(1);
  expect(target.songs.list('vieja')).toHaveLength(0);
  expect(target.songs.get(1)?.slides).toHaveLength(2);
  const [item] = await target.media.list();
  expect(item.name).toBe('foto.png');
  const { sha256, ext } = target.db.prepare('SELECT sha256, ext FROM media').get() as { sha256: string; ext: string };
  expect(readFileSync(join(target.folder, `${sha256}.${ext}`), 'utf8')).toBe('imagen de prueba');
  expect(existsSync(join(target.folder, `${sha256}.thumb.jpg`))).toBe(true);
});

test('una copia con un video ya convertido para la tele se puede importar', async () => {
  const converting = new MediaService(origin.db, origin.folder, undefined, {
    needsConversion: async (_file, ext) => ext !== 'mp4',
    convert: async (_file, output) => writeFileSync(output, 'convertido'),
  });
  const video = join(dir, 'clip.mov');
  writeFileSync(video, 'original');
  await converting.add([video]);
  await converting.convertVideos();

  const file = join(dir, 'copia.ceflyrics');
  await origin.backup.export(file);
  expect(await target.backup.import(file)).toMatchObject({ media: 1 });
  const { sha256, ext } = target.db.prepare('SELECT sha256, ext FROM media').get() as { sha256: string; ext: string };
  expect(readFileSync(join(target.folder, `${sha256}.${ext}`), 'utf8')).toBe('convertido');
});

test('abre las copias de la 1.1.0, que se escribían con i y no traían biblias', async () => {
  await fillOrigin();
  const file = join(dir, 'copia.ceflyrics');
  await origin.backup.export(file);
  const bytes = readFileSync(file);
  const end = bytes.indexOf(10);
  const header = JSON.parse(bytes.subarray(0, end).toString('utf8'));
  delete header.bibles;
  header.format = 'ceflirics-datos';
  writeFileSync(file, Buffer.concat([Buffer.from(JSON.stringify(header)), bytes.subarray(end)]));

  expect(await target.backup.import(file)).toMatchObject({ songs: 1, media: 1, bibles: 0 });
  expect(target.songs.list('segunda')).toHaveLength(1);
});

test('las biblias importadas viajan, y las de fábrica no se tocan', async () => {
  const factory = `INSERT INTO bibles (code, name, language, versification, license_kind) VALUES ('RV1909', 'RV', 'es', 'kjv', 'public_domain')`;
  target.db.prepare(factory).run();
  const usfm = join(dir, 'juan.usfm');
  writeFileSync(
    usfm,
    '\\\\id JHN\\n\\\\h Juan\\n\\\\c 3\\n\\\\v 16 Texto importado\\n'.replaceAll('\\\\', '\\').replaceAll('\\n', '\n'),
  );
  await new BibleImporter(origin.db).import([usfm], { code: 'MIA', name: 'Mía' });

  const file = join(dir, 'copia.ceflyrics');
  expect((await origin.backup.export(file)).bibles).toBe(1);
  await target.backup.import(file);

  const bible = new BibleService(target.db);
  expect(
    bible
      .list()
      .map(({ code }) => code)
      .sort(),
  ).toEqual(['MIA', 'RV1909']);
  expect(bible.verse('MIA', 43003016)?.text).toBe('Texto importado');
  expect(bible.search('MIA', 'importado').verses).toHaveLength(1);
});

test('el PIN y los celulares de una PC no viajan', async () => {
  await fillOrigin();
  const file = join(dir, 'copia.ceflyrics');
  await origin.backup.export(file);
  expect(readFileSync(file, 'utf8')).not.toContain('123456');
  await target.backup.import(file);
  expect(target.db.prepare(`SELECT 1 FROM settings WHERE key = 'lan.pin'`).get()).toBeUndefined();
});

test('borra los medios viejos de la PC que recibe', async () => {
  await fillOrigin();
  const file = join(dir, 'copia.ceflyrics');
  await origin.backup.export(file);
  const old = join(dir, 'vieja.png');
  writeFileSync(old, 'otra imagen');
  await target.media.add([old]);
  const { sha256 } = target.db.prepare('SELECT sha256 FROM media').get() as { sha256: string };
  await target.backup.import(file);
  expect(existsSync(join(target.folder, `${sha256}.png`))).toBe(false);
});

test('una copia dañada no toca el archivo bueno que ya estaba, ni deja restos', async () => {
  await fillOrigin();
  const file = join(dir, 'copia.ceflyrics');
  await origin.backup.export(file);
  await target.backup.import(file);
  const before = readdirSync(target.folder).sort();
  const { sha256 } = target.db.prepare('SELECT sha256 FROM media').get() as { sha256: string };

  // Mismo tamaño y otros bytes en la foto, que va antes que su miniatura.
  const damaged = readFileSync(file, 'utf8').replace('imagen de prueba', 'imagen rota!!!!!');
  writeFileSync(file, damaged);
  rmSync(join(target.folder, `${sha256}.png`));
  writeFileSync(join(target.folder, `${sha256}.png`), 'corto');
  await expect(target.backup.import(file)).rejects.toThrow('no es una copia');
  expect(readFileSync(join(target.folder, `${sha256}.png`), 'utf8')).toBe('corto');

  writeFileSync(join(target.folder, `${sha256}.png`), 'imagen de prueba');
  // El archivo bueno ya está: no se vuelve a escribir.
  await target.backup.import(file);
  expect(readFileSync(join(target.folder, `${sha256}.png`), 'utf8')).toBe('imagen de prueba');
  expect(readdirSync(target.folder).sort()).toEqual(before);
});

test('un video convertido dañado se rechaza; las copias viejas, sin su huella, se aceptan', async () => {
  const converting = new MediaService(origin.db, origin.folder, undefined, {
    needsConversion: async (_file, ext) => ext !== 'mp4',
    convert: async (_file, output) => writeFileSync(output, 'convertido'),
  });
  const video = join(dir, 'clip.mov');
  writeFileSync(video, 'original');
  await converting.add([video]);
  await converting.convertVideos();
  const file = join(dir, 'copia.ceflyrics');
  await origin.backup.export(file);
  const text = readFileSync(file, 'utf8');

  writeFileSync(file, text.replace(/convertido$/, 'estropeado'));
  await expect(target.backup.import(file)).rejects.toThrow('no es una copia');
  expect(readdirSync(target.folder)).toEqual([]);

  writeFileSync(file, text.replace(/,"sha256":"[0-9a-f]{64}"\}\]/, '}]'));
  expect(await target.backup.import(file)).toMatchObject({ media: 1 });
});

test('si falla la exportación, la copia anterior queda como estaba', async () => {
  await fillOrigin();
  const file = join(dir, 'copia.ceflyrics');
  await origin.backup.export(file);
  const good = readFileSync(file);
  // Un archivo que no se puede leer: en su lugar hay una carpeta.
  const { sha256 } = origin.db.prepare('SELECT sha256 FROM media').get() as { sha256: string };
  rmSync(join(origin.folder, `${sha256}.png`));
  mkdirSync(join(origin.folder, `${sha256}.png`));

  await expect(origin.backup.export(file)).rejects.toThrow();
  expect(readFileSync(file)).toEqual(good);
  expect(existsSync(`${file}.parcial`)).toBe(false);
});

const header = (changes: object) => ({
  format: 'ceflyrics-datos',
  version: 1,
  tables: { songs: [], song_slides: [], media: [], themes: [], timers: [], shortcuts: [] },
  settings: [],
  files: [],
  ...changes,
});

test('rechaza lo que no es una copia, y los datos quedan como estaban', async () => {
  target.songs.save({ title: 'Sigue acá', author: '', text: 'Letra' });
  const bad = join(dir, 'malo.ceflyrics');
  const contents = [
    'cualquier cosa\n',
    'sin salto de línea',
    `${JSON.stringify(header({ format: 'otro' }))}\n`,
    `${JSON.stringify(header({ version: 99 }))}\n`,
    `${JSON.stringify(header({ tables: {} }))}\n`,
    // Un nombre que se sale de la carpeta de medios.
    `${JSON.stringify(header({ files: [{ name: '../../malicioso.exe', size: 1 }] }))}x`,
    // Declara más bytes de los que trae.
    `${JSON.stringify(header({ files: [{ name: `${'a'.repeat(64)}.png`, size: 100 }] }))}\nx`,
    // El contenido no coincide con su huella.
    `${JSON.stringify(header({ files: [{ name: `${'a'.repeat(64)}.png`, size: 1 }] }))}\nx`,
  ];
  for (const content of contents) {
    writeFileSync(bad, content);
    await expect(target.backup.import(bad), content.slice(0, 40)).rejects.toThrow('no es una copia');
  }
  expect(target.songs.list('').map((song) => song.title)).toEqual(['Sigue acá']);
  expect(existsSync(join(dir, 'malicioso.exe'))).toBe(false);
});
