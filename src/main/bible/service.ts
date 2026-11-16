import type { BibleBook, BibleInfo, BibleSearchResult, BibleVerse } from '@shared/api';
import { parseReference, referenceRange } from '@shared/reference';
import { parseVid } from '@shared/vid';
import type { Db } from '../db/database';

const MAX_TEXT_RESULTS = 200;

// Cada palabra va entre comillas para que el usuario no pueda escribir sintaxis de FTS5 sin querer.
function ftsQuery(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((word) => `"${word.replaceAll('"', '""')}"`).join(' ') : null;
}

export class BibleService {
  // Solo se conserva la versión consultada más recientemente; las biblias importadas pueden ser muchas.
  private bookCache: { code: string; books: BibleBook[] } | undefined;

  constructor(private db: Db) {}

  list(): BibleInfo[] {
    const rows = this.db
      .prepare('SELECT code, name, language, imported_by_user FROM bibles ORDER BY language DESC, id')
      .all() as (BibleInfo & { imported_by_user: number })[];
    return rows.map(({ imported_by_user: imported, ...bible }) => ({ ...bible, imported: !!imported }));
  }

  books(code: string): BibleBook[] {
    if (this.bookCache?.code === code) return this.bookCache.books;
    const books = this.db
      .prepare(
        `SELECT bk.book_no AS book, bk.name,
                (SELECT MAX((v.vid / 1000) % 1000) FROM verses v
                 WHERE v.bible_id = b.id AND v.vid BETWEEN bk.book_no * 1000000 AND bk.book_no * 1000000 + 999999) AS chapters
         FROM bible_books bk JOIN bibles b ON b.id = bk.bible_id
         WHERE b.code = ? ORDER BY bk.book_no`,
      )
      .all(code) as BibleBook[];
    this.bookCache = { code, books };
    return books;
  }

  chapter(code: string, book: number, chapter: number) {
    const from = book * 1_000_000 + chapter * 1_000;
    return this.range(code, from, from + 999);
  }

  chapterVerseIds(code: string, book: number, chapter: number) {
    const from = book * 1_000_000 + chapter * 1_000;
    return (
      this.db
        .prepare(
          `SELECT v.vid FROM verses v JOIN bibles b ON b.id = v.bible_id
           WHERE b.code = ? AND v.vid BETWEEN ? AND ? ORDER BY v.vid`,
        )
        .all(code, from, from + 999) as { vid: number }[]
    ).map(({ vid }) => vid);
  }

  verse(code: string, vid: number): BibleVerse | undefined {
    return this.range(code, vid, vid)[0];
  }

  search(code: string, query: string): BibleSearchResult {
    const reference = parseReference(query);
    if (reference?.chapter !== undefined) {
      const { from, to } = referenceRange(reference);
      return {
        kind: 'reference',
        book: reference.book,
        chapter: reference.chapter,
        verses: this.range(code, from, to),
      };
    }
    return { kind: 'text', book: reference?.book, verses: this.text(code, query) };
  }

  private range(code: string, from: number, to: number) {
    const rows = this.db
      .prepare(
        `SELECT v.vid, v.text FROM verses v JOIN bibles b ON b.id = v.bible_id
         WHERE b.code = ? AND v.vid BETWEEN ? AND ? ORDER BY v.vid`,
      )
      .all(code, from, to) as { vid: number; text: string }[];
    return this.withLabels(code, rows);
  }

  private text(code: string, query: string) {
    const exact = ftsQuery(query);
    if (!exact) return [];
    // Primero la palabra exacta. Después lo que empieza igual, para buscar mientras se escribe:
    // "amor" no debe arrancar por "Amorrheo".
    const rows = this.match(code, exact);
    if (rows.length < MAX_TEXT_RESULTS) {
      const seen = new Set(rows.map((row) => row.vid));
      for (const row of this.match(code, `${exact}*`)) {
        if (!seen.has(row.vid) && rows.length < MAX_TEXT_RESULTS) rows.push(row);
      }
    }
    return this.withLabels(code, rows);
  }

  private match(code: string, query: string) {
    return this.db
      .prepare(
        `SELECT v.vid, v.text FROM verses_fts
         JOIN verses v ON v.id = verses_fts.rowid
         JOIN bibles b ON b.id = v.bible_id
         WHERE verses_fts MATCH ? AND b.code = ? ORDER BY v.vid LIMIT ?`,
      )
      .all(query, code, MAX_TEXT_RESULTS) as { vid: number; text: string }[];
  }

  private withLabels(code: string, rows: { vid: number; text: string }[]): BibleVerse[] {
    const names = new Map(this.books(code).map(({ book, name }) => [book, name]));
    return rows.map(({ vid, text }) => {
      const { book, chapter, verse } = parseVid(vid);
      return { vid, text, label: `${names.get(book)} ${chapter}:${verse}` };
    });
  }
}
