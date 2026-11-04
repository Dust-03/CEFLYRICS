import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { BackupService } from '../../src/main/backup';
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
  expect(exported).toEqual({ songs: 1, media: 1, themes: 1, timers: 1, shortcuts: 1 });

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
