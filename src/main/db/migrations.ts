// Migraciones de la base, en orden. Una migración publicada no se edita: se agrega otra.
// Las tablas del resto del modelo (docs/investigacion.md, sección (c)) llegan con cada módulo.

export type Migration = { version: number; name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'biblias y ajustes',
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE bibles (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        language TEXT NOT NULL,
        versification TEXT NOT NULL,
        license_kind TEXT NOT NULL CHECK (license_kind IN ('public_domain', 'user_imported')),
        source TEXT,
        imported_by_user INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE verses (
        id INTEGER PRIMARY KEY,
        bible_id INTEGER NOT NULL REFERENCES bibles (id) ON DELETE CASCADE,
        vid INTEGER NOT NULL,
        text TEXT NOT NULL,
        UNIQUE (bible_id, vid)
      );

      -- remove_diacritics: "amo" encuentra "amó" y "á" no estorba en la RV1909.
      CREATE VIRTUAL TABLE verses_fts USING fts5(
        text,
        content = 'verses',
        content_rowid = 'id',
        tokenize = "unicode61 remove_diacritics 2"
      );

      CREATE TRIGGER verses_after_insert AFTER INSERT ON verses BEGIN
        INSERT INTO verses_fts (rowid, text) VALUES (new.id, new.text);
      END;

      CREATE TRIGGER verses_after_delete AFTER DELETE ON verses BEGIN
        INSERT INTO verses_fts (verses_fts, rowid, text) VALUES ('delete', old.id, old.text);
      END;

      CREATE TRIGGER verses_after_update AFTER UPDATE OF text ON verses BEGIN
        INSERT INTO verses_fts (verses_fts, rowid, text) VALUES ('delete', old.id, old.text);
        INSERT INTO verses_fts (rowid, text) VALUES (new.id, new.text);
      END;
    `,
  },
  {
    version: 2,
    name: 'libros y versificación',
    sql: `
      CREATE TABLE bible_books (
        bible_id INTEGER NOT NULL REFERENCES bibles (id) ON DELETE CASCADE,
        book_no INTEGER NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (bible_id, book_no)
      );

      CREATE TABLE versification_map (
        from_scheme TEXT NOT NULL,
        from_vid INTEGER NOT NULL,
        to_scheme TEXT NOT NULL,
        to_vid INTEGER NOT NULL,
        PRIMARY KEY (from_scheme, from_vid, to_scheme)
      );
    `,
  },
  {
    version: 3,
    name: 'canciones, medios y estilos',
    sql: `
      CREATE TABLE songs (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE song_slides (
        id INTEGER PRIMARY KEY,
        song_id INTEGER NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        label TEXT NOT NULL,
        text TEXT NOT NULL,
        return_notes TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX song_slides_song ON song_slides (song_id, position);

      -- rowid es el id de la canción. Se mantiene desde SongService al guardar.
      CREATE VIRTUAL TABLE songs_fts USING fts5(
        title,
        lyrics,
        tokenize = "unicode61 remove_diacritics 2"
      );

      CREATE TABLE media (
        id INTEGER PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
        ext TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE themes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        definition_json TEXT NOT NULL
      );
    `,
  },
  {
    version: 4,
    name: 'temporizadores',
    sql: `
      CREATE TABLE timers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('duration', 'clock')),
        seconds INTEGER NOT NULL DEFAULT 0,
        clock TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT ''
      );
    `,
  },
];
