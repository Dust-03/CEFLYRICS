import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { BibleService } from '../../src/main/bible/service';
import { openDatabase, type Db } from '../../src/main/db/database';
import { MediaService } from '../../src/main/media';
import { ShortcutService } from '../../src/main/shortcuts';
import { SongService } from '../../src/main/songs';

let dir: string;
let db: Db;
let songs: SongService;
let media: MediaService;
let shortcuts: ShortcutService;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-atajos-'));
  db = openDatabase(join(dir, 'prueba.db'));
  songs = new SongService(db);
  media = new MediaService(db, join(dir, 'media'));
  const bible = new BibleService(db);
  shortcuts = new ShortcutService(db, bible, songs, media);

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO bibles (code, name, language, versification, license_kind) VALUES ('RV1909', 'RV', 'es', 'kjv', 'public_domain')`,
    )
    .run();
  db.prepare('INSERT INTO bible_books (bible_id, book_no, name) VALUES (?, 43, ?)').run(lastInsertRowid, 'Juan');
  db.prepare('INSERT INTO verses (bible_id, vid, text) VALUES (?, 43003016, ?)').run(
    lastInsertRowid,
    'Porque de tal manera',
  );
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('guarda versículos, canciones y medios, en orden y sin repetir', async () => {
  const songId = songs.save({ title: 'Mi canción', author: '', text: 'Primera línea' });
  const photo = join(dir, 'foto.png');
  writeFileSync(photo, 'x');
  await media.add([photo]);
  const [file] = await media.list();

  shortcuts.add('verse:RV1909:43003016');
  shortcuts.add(`song:${songId}`);
  shortcuts.add(`media:${file.id}`);
  shortcuts.add('verse:RV1909:43003016');

  const list = await shortcuts.list();
  expect(list.map((s) => s.kind)).toEqual(['verse', 'song', 'media']);
  expect(list[0]).toMatchObject({ title: 'Juan 3:16 · RV1909', text: 'Porque de tal manera' });
  expect(list[1]).toMatchObject({ title: 'Mi canción', songId });
  expect(list[2].media?.name).toBe('foto.png');
});

test('un atajo sigue a la canción editada', async () => {
  const id = songs.save({ title: 'Antes', author: '', text: 'Letra' });
  shortcuts.add(`song:${id}`);
  songs.save({ id, title: 'Después', author: '', text: 'Letra nueva' });
  expect((await shortcuts.list())[0]).toMatchObject({ title: 'Después', text: 'Letra nueva' });
});

test('al borrar lo guardado, el atajo desaparece', async () => {
  const id = songs.save({ title: 'Se borra', author: '', text: 'Letra' });
  shortcuts.add(`song:${id}`);
  shortcuts.add('verse:RV1909:99999999');
  songs.remove(id);
  expect(await shortcuts.list()).toEqual([]);
  expect(db.prepare('SELECT COUNT(*) AS n FROM shortcuts').get()).toEqual({ n: 0 });
});

test('rechaza referencias inválidas y se puede quitar', async () => {
  expect(() => shortcuts.add('archivo:c:/secreto')).toThrow();
  shortcuts.add('verse:RV1909:43003016');
  const [saved] = await shortcuts.list();
  shortcuts.remove(saved.id);
  expect(await shortcuts.list()).toEqual([]);
});
