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
];
