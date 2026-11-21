import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { DataCounts } from '@shared/api';
import { parseTheme } from '@shared/theme';
import type { Db } from './db/database';
import { hashFile, MEDIA_EXTENSIONS } from './media';

const FORMAT = 'ceflyrics-datos';
// Así la escribía la 1.1.0, antes de que el programa pasara a llamarse con y.
const OLD_FORMAT = 'ceflirics-datos';
const VERSION = 1;
const MAX_HEADER = 512 * 1024 * 1024;

// Lo que pasa de una PC a otra. De las biblias van solo las importadas: las otras vienen con el
// programa. El PIN y los celulares no viajan: cada PC vincula los suyos.
const TABLES: Record<string, string[]> = {
  songs: ['id', 'title', 'author', 'created_at', 'updated_at'],
  song_slides: ['id', 'song_id', 'position', 'label', 'text', 'return_notes'],
  media: ['id', 'sha256', 'kind', 'ext', 'original_name', 'size', 'created_at'],
  themes: ['id', 'name', 'definition_json'],
  timers: ['id', 'name', 'kind', 'seconds', 'clock', 'message'],
  shortcuts: ['id', 'ref', 'position'],
};
const SETTINGS = ['themes.assignment', 'themes.hidden'];

const FILE_NAME = /^([0-9a-f]{64})(\.thumb)?\.([a-z0-9]+)$/;

type Row = Record<string, unknown>;
type DataFile = { name: string; size: number };
type SavedBible = {
  code: string;
  name: string;
  language: string;
  versification: string;
  books: { book_no: number; name: string }[];
  verses: [number, string][];
};
type Header = {
  format: string;
  version: number;
  tables: Record<string, Row[]>;
  settings: { key: string; value_json: string }[];
  files: DataFile[];
  bibles?: SavedBible[];
};

const invalid = () => new Error('El archivo no es una copia de datos de CEFLYRICS');

function counts(tables: Record<string, Row[]>, bibles: number): DataCounts {
  return {
    songs: tables.songs.length,
    media: tables.media.length,
    themes: tables.themes.length,
    timers: tables.timers.length,
    shortcuts: tables.shortcuts.length,
    bibles,
  };
}

// El archivo viene de afuera: no se da nada por bueno.
function checkHeader(input: unknown): Header {
  const header = input as Header | null;
  if ((header?.format !== FORMAT && header?.format !== OLD_FORMAT) || header.version !== VERSION) throw invalid();
  if (!Array.isArray(header.files) || !Array.isArray(header.settings)) throw invalid();
  for (const table of Object.keys(TABLES)) {
    const rows = header.tables?.[table];
    if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'object' || row === null)) throw invalid();
  }
  for (const { name, size } of header.files) {
    const match = FILE_NAME.exec(String(name));
    if (!match || !MEDIA_EXTENSIONS.concat('jpg').includes(match[3])) throw invalid();
    if (!Number.isSafeInteger(size) || size < 0) throw invalid();
  }
  for (const { sha256, ext } of header.tables.media as { sha256?: unknown; ext?: unknown }[]) {
    if (!FILE_NAME.test(`${String(sha256)}.${String(ext)}`) || !MEDIA_EXTENSIONS.includes(String(ext))) throw invalid();
  }
  for (const { definition_json: json } of header.tables.themes as { definition_json?: unknown }[]) {
    if (typeof json !== 'string' || !parseTheme(JSON.parse(json))) throw invalid();
  }
  for (const bible of header.bibles ?? []) {
    const valid =
      /^[A-Za-z0-9-]{1,12}$/.test(bible?.code) &&
      typeof bible.name === 'string' &&
      Array.isArray(bible.books) &&
      Array.isArray(bible.verses) &&
      bible.verses.every((verse) => Number.isInteger(verse?.[0]) && typeof verse[1] === 'string');
    if (!valid) throw invalid();
  }
  return header;
}

async function readHeader(source: string) {
  const handle = await open(source, 'r');
  try {
    const chunks: Buffer[] = [];
    let position = 0;
    while (position < MAX_HEADER) {
      const buffer = Buffer.alloc(1024 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) throw invalid();
      const end = buffer.subarray(0, bytesRead).indexOf(10);
      if (end >= 0) {
        chunks.push(buffer.subarray(0, end));
        const text = Buffer.concat(chunks).toString('utf8');
        return { header: checkHeader(JSON.parse(text)), start: position + end + 1 };
      }
      chunks.push(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    throw invalid();
  } catch (error) {
    throw error instanceof SyntaxError ? invalid() : error;
  } finally {
    await handle.close();
  }
}

// Un solo archivo para pasar todo a otra PC: una línea con los datos y, detrás, las fotos y videos.
export class BackupService {
  constructor(
    private db: Db,
    private mediaFolder: string,
  ) {}

  async export(target: string): Promise<DataCounts> {
    const tables: Record<string, Row[]> = {};
    for (const [table, columns] of Object.entries(TABLES)) {
      tables[table] = this.db.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all() as Row[];
    }
    const place = SETTINGS.map(() => '?').join(', ');
    const settings = this.db.prepare(`SELECT key, value_json FROM settings WHERE key IN (${place})`).all(...SETTINGS);

    const files: DataFile[] = [];
    for (const { sha256, ext } of tables.media as { sha256: string; ext: string }[]) {
      for (const name of [`${sha256}.${ext}`, `${sha256}.thumb.jpg`]) {
        const file = join(this.mediaFolder, name);
        if (existsSync(file)) files.push({ name, size: (await stat(file)).size });
      }
    }

    const bibles = this.importedBibles();
    const output = createWriteStream(target);
    const done = new Promise<void>((resolve, reject) => output.on('finish', resolve).on('error', reject));
    output.write(`${JSON.stringify({ format: FORMAT, version: VERSION, tables, settings, files, bibles })}\n`);
    for (const { name } of files) {
      await pipeline(createReadStream(join(this.mediaFolder, name)), output, { end: false });
    }
    output.end();
    await done;
    return counts(tables, bibles.length);
  }

  // Reemplaza lo de esta PC. Primero se copian los archivos: si algo falla, los datos quedan igual.
  async import(source: string): Promise<DataCounts> {
    const { header, start } = await readHeader(source);
    const expected = header.files.reduce((total, { size }) => total + size, start);
    if ((await stat(source)).size !== expected) throw invalid();

    await mkdir(this.mediaFolder, { recursive: true });
    let position = start;
    for (const { name, size } of header.files) {
      const target = join(this.mediaFolder, name);
      if (size) {
        const slice = createReadStream(source, { start: position, end: position + size - 1 });
        await pipeline(slice, createWriteStream(target));
      }
      position += size;
      const match = FILE_NAME.exec(name)!;
      if (!match[2] && (await hashFile(target)) !== match[1]) {
        await rm(target, { force: true });
        throw invalid();
      }
    }

    this.replaceData(header);
    await this.removeUnusedFiles(header);
    return counts(header.tables, header.bibles?.length ?? 0);
  }

  private importedBibles(): SavedBible[] {
    const rows = this.db
      .prepare('SELECT id, code, name, language, versification FROM bibles WHERE imported_by_user = 1')
      .all() as (Omit<SavedBible, 'books' | 'verses'> & { id: number })[];
    return rows.map(({ id, ...bible }) => ({
      ...bible,
      books: this.db.prepare('SELECT book_no, name FROM bible_books WHERE bible_id = ?').all(id) as SavedBible['books'],
      verses: (
        this.db.prepare('SELECT vid, text FROM verses WHERE bible_id = ?').all(id) as { vid: number; text: string }[]
      ).map(({ vid, text }) => [vid, text]),
    }));
  }

  private replaceBibles(bibles: SavedBible[]) {
    this.db.prepare('DELETE FROM bibles WHERE imported_by_user = 1').run();
    const addBook = this.db.prepare('INSERT INTO bible_books (bible_id, book_no, name) VALUES (?, ?, ?)');
    const addVerse = this.db.prepare('INSERT INTO verses (bible_id, vid, text) VALUES (?, ?, ?)');
    for (const { code, name, language, versification, books, verses } of bibles) {
      // Una con la misma sigla que una de fábrica no pisa a la de fábrica.
      if (this.db.prepare('SELECT 1 FROM bibles WHERE code = ?').get(code)) continue;
      const { lastInsertRowid: id } = this.db
        .prepare(
          `INSERT INTO bibles (code, name, language, versification, license_kind, imported_by_user)
           VALUES (?, ?, ?, ?, 'user_imported', 1)`,
        )
        .run(code, name, language, versification);
      for (const book of books) addBook.run(id, book.book_no, book.name);
      for (const [vid, text] of verses) addVerse.run(id, vid, text);
    }
  }

  private replaceData({ tables, settings, bibles }: Header) {
    this.db.transaction(() => {
      this.replaceBibles(bibles ?? []);
      this.db.prepare('DELETE FROM songs_fts').run();
      for (const table of Object.keys(TABLES).reverse()) this.db.prepare(`DELETE FROM ${table}`).run();
      for (const [table, columns] of Object.entries(TABLES)) {
        const place = columns.map(() => '?').join(', ');
        const insert = this.db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${place})`);
        for (const row of tables[table]) insert.run(...columns.map((column) => row[column] ?? null));
      }
      for (const { key, value_json: value } of settings) {
        if (!SETTINGS.includes(key)) continue;
        this.db
          .prepare(
            `INSERT INTO settings (key, value_json) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json`,
          )
          .run(key, String(value));
      }
      const index = this.db.prepare('INSERT INTO songs_fts (rowid, title, lyrics) VALUES (?, ?, ?)');
      const slides = this.db.prepare('SELECT text FROM song_slides WHERE song_id = ? ORDER BY position');
      for (const { id, title } of tables.songs as { id: number; title: string }[]) {
        const lyrics = (slides.all(id) as { text: string }[]).map((slide) => slide.text).join('\n');
        index.run(id, title, lyrics);
      }
    })();
  }

  private async removeUnusedFiles({ files }: Header) {
    const kept = new Set(files.map(({ name }) => name));
    for (const name of await readdir(this.mediaFolder)) {
      if (FILE_NAME.test(name) && !kept.has(name)) await rm(join(this.mediaFolder, name), { force: true });
    }
  }
}
