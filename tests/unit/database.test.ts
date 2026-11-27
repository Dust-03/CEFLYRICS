import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { BibleImporter } from '../../src/main/bible/import';
import { openDatabase, type Db } from '../../src/main/db/database';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { makeVid, parseVid } from '../../src/shared/vid';

let dir: string;
let file: string;
let db: Db | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-db-'));
  file = join(dir, 'prueba.db');
});

afterEach(() => {
  db?.close();
  db = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function addBible(target: Db) {
  const { lastInsertRowid } = target
    .prepare(
      `INSERT INTO bibles (code, name, language, versification, license_kind)
       VALUES ('RV1909', 'Reina-Valera 1909', 'es', 'kjv', 'public_domain')`,
    )
    .run();
  return Number(lastInsertRowid);
}

function addVerse(target: Db, bibleId: number, vid: number, text: string) {
  target.prepare('INSERT INTO verses (bible_id, vid, text) VALUES (?, ?, ?)').run(bibleId, vid, text);
}

const search = (target: Db, query: string) =>
  target
    .prepare(
      `SELECT verses.vid FROM verses_fts
       JOIN verses ON verses.id = verses_fts.rowid
       WHERE verses_fts MATCH ? ORDER BY verses.vid`,
    )
    .all(query)
    .map((row) => (row as { vid: number }).vid);

const JOHN_3_16 = makeVid({ book: 43, chapter: 3, verse: 16 });
const GENESIS_1_1 = makeVid({ book: 1, chapter: 1, verse: 1 });

test('crea la base, inserta y busca con FTS5', () => {
  db = openDatabase(file);
  const bible = addBible(db);
  addVerse(db, bible, JOHN_3_16, 'Porque de tal manera amó Dios al mundo, que haya dado á su Hijo unigénito');
  addVerse(db, bible, GENESIS_1_1, 'EN el principio crió Dios los cielos y la tierra.');

  expect(search(db, 'dios')).toEqual([GENESIS_1_1, JOHN_3_16]);
  expect(search(db, 'unigénito')).toEqual([JOHN_3_16]);
});

test('la búsqueda ignora acentos y mayúsculas, y acepta prefijos', () => {
  db = openDatabase(file);
  addVerse(db, addBible(db), JOHN_3_16, 'Porque de tal manera amó Dios al mundo');

  expect(search(db, 'amo')).toEqual([JOHN_3_16]);
  expect(search(db, 'AMÓ')).toEqual([JOHN_3_16]);
  expect(search(db, 'mun*')).toEqual([JOHN_3_16]);
  expect(search(db, 'cielos')).toEqual([]);
});

test('el índice sigue a la tabla al editar y al borrar', () => {
  db = openDatabase(file);
  const bible = addBible(db);
  addVerse(db, bible, JOHN_3_16, 'texto viejo');

  db.prepare('UPDATE verses SET text = ? WHERE vid = ?').run('texto nuevo', JOHN_3_16);
  expect(search(db, 'viejo')).toEqual([]);
  expect(search(db, 'nuevo')).toEqual([JOHN_3_16]);

  db.prepare('DELETE FROM bibles WHERE id = ?').run(bible);
  expect(search(db, 'nuevo')).toEqual([]);
});

// Falla si el índice no coincide con la tabla de versículos.
const checkIndex = (target: Db) =>
  target.prepare(`INSERT INTO verses_fts (verses_fts, rank) VALUES ('integrity-check', 1)`).run();

test('importar un versículo repetido no rompe el buscador, y vale el último', async () => {
  db = openDatabase(file);
  const usfm = join(dir, 'juan.usfm');
  writeFileSync(usfm, ['\\id JHN', '\\c 3', '\\v 16 primero', '\\v 16 segundo'].join('\n'));
  await new BibleImporter(db).import([usfm], { code: 'MIA', name: 'Mía' });

  expect(search(db, 'segundo')).toEqual([JOHN_3_16]);
  expect(search(db, 'primero')).toEqual([]);
  expect(() => checkIndex(db!)).not.toThrow();
});

test('al actualizar se arregla un buscador que había quedado roto', () => {
  db = openDatabase(file, MIGRATIONS.slice(0, 6));
  const bible = addBible(db);
  addVerse(db, bible, JOHN_3_16, 'primero');
  db.prepare('INSERT OR REPLACE INTO verses (bible_id, vid, text) VALUES (?, ?, ?)').run(bible, JOHN_3_16, 'segundo');
  expect(() => checkIndex(db!)).toThrow();
  db.close();

  db = openDatabase(file);
  expect(() => checkIndex(db!)).not.toThrow();
  expect(search(db, 'segundo')).toEqual([JOHN_3_16]);
});

test('migrar dos veces no cambia nada y los datos sobreviven', () => {
  db = openDatabase(file);
  addVerse(db, addBible(db), JOHN_3_16, 'amó');
  db.close();

  db = openDatabase(file);
  expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.at(-1)!.version);
  expect(search(db, 'amo')).toEqual([JOHN_3_16]);
});

test('una migración que falla no deja la base a medias', () => {
  const broken = [...MIGRATIONS, { version: 99, name: 'rota', sql: 'CREATE TABLE a (x); ESTO NO ES SQL;' }];
  expect(() => openDatabase(file, broken)).toThrow();

  db = openDatabase(file);
  expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.at(-1)!.version);
  expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'a'`).get()).toBeUndefined();
});

test('no abre una base de un programa más nuevo', () => {
  db = openDatabase(file);
  db.pragma('user_version = 999');
  db.close();
  db = undefined;

  expect(() => openDatabase(file)).toThrow(/hay que actualizarlo/);
});

test('el vid va y vuelve', () => {
  expect(JOHN_3_16).toBe(43003016);
  expect(parseVid(JOHN_3_16)).toEqual({ book: 43, chapter: 3, verse: 16 });
  expect(parseVid(makeVid({ book: 19, chapter: 119, verse: 176 }))).toEqual({ book: 19, chapter: 119, verse: 176 });
});
