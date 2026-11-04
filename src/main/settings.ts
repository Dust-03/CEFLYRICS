import type { Db } from './db/database';

export function readSetting<T>(db: Db, key: string): T | undefined {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
    { value_json: string } | undefined;
  return row ? (JSON.parse(row.value_json) as T) : undefined;
}

export function writeSetting(db: Db, key: string, value: unknown) {
  db.prepare(
    `INSERT INTO settings (key, value_json) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json`,
  ).run(key, JSON.stringify(value));
}
