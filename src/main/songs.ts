import type { Song, SongInput, SongSummary } from '@shared/api';
import { parseSongText, type SongSlide } from '@shared/song-text';
import type { Db } from './db/database';

const MAX_RESULTS = 300;

function ftsQuery(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((word) => `"${word.replaceAll('"', '""')}"*`).join(' ') : null;
}

export class SongService {
  constructor(private db: Db) {}

  list(query = ''): SongSummary[] {
    const match = ftsQuery(query);
    if (!match) {
      return this.db
        .prepare('SELECT id, title, author FROM songs ORDER BY title COLLATE NOCASE LIMIT ?')
        .all(MAX_RESULTS) as SongSummary[];
    }
    return this.db
      .prepare(
        `SELECT s.id, s.title, s.author FROM songs_fts
         JOIN songs s ON s.id = songs_fts.rowid
         WHERE songs_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(match, MAX_RESULTS) as SongSummary[];
  }

  get(id: number): Song | null {
    const song = this.db.prepare('SELECT id, title, author FROM songs WHERE id = ?').get(id) as SongSummary | undefined;
    if (!song) return null;
    const slides = this.db
      .prepare(
        `SELECT label, text, return_notes AS returnNotes FROM song_slides
         WHERE song_id = ? ORDER BY position`,
      )
      .all(id) as SongSlide[];
    return { ...song, slides };
  }

  save({ id, title, author, text }: SongInput) {
    const cleanTitle = title.trim();
    const slides = parseSongText(text);
    if (!cleanTitle) throw new Error('Falta el título de la canción');
    if (!slides.length) throw new Error('Falta la letra de la canción');

    return this.db.transaction(() => {
      let songId = id;
      if (songId) {
        this.db
          .prepare(`UPDATE songs SET title = ?, author = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(cleanTitle, author.trim(), songId);
        this.db.prepare('DELETE FROM song_slides WHERE song_id = ?').run(songId);
        this.db.prepare('DELETE FROM songs_fts WHERE rowid = ?').run(songId);
      } else {
        const result = this.db
          .prepare('INSERT INTO songs (title, author) VALUES (?, ?)')
          .run(cleanTitle, author.trim());
        songId = Number(result.lastInsertRowid);
      }
      const addSlide = this.db.prepare(
        'INSERT INTO song_slides (song_id, position, label, text, return_notes) VALUES (?, ?, ?, ?, ?)',
      );
      slides.forEach((slide, position) => addSlide.run(songId, position, slide.label, slide.text, slide.returnNotes));
      this.db
        .prepare('INSERT INTO songs_fts (rowid, title, lyrics) VALUES (?, ?, ?)')
        .run(songId, cleanTitle, slides.map((slide) => slide.text).join('\n'));
      return songId;
    })();
  }

  remove(id: number) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM songs WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM songs_fts WHERE rowid = ?').run(id);
    })();
  }
}
