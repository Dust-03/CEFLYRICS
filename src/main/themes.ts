import type { ThemeAssignment, ThemeInput } from '@shared/api';
import { DEFAULT_THEME, FACTORY_THEMES, parseTheme, type ThemeEntry } from '@shared/theme';
import type { Db } from './db/database';

const ASSIGNMENT_KEY = 'themes.assignment';
const DEFAULT_ASSIGNMENT: ThemeAssignment = { song: FACTORY_THEMES[0].id, bible: FACTORY_THEMES[0].id };

export class ThemeService {
  constructor(private db: Db) {}

  list(): ThemeEntry[] {
    const rows = this.db.prepare('SELECT id, name, definition_json FROM themes ORDER BY id').all() as {
      id: number;
      name: string;
      definition_json: string;
    }[];
    const own = rows.map(({ id, name, definition_json }) => ({
      id: String(id),
      name,
      factory: false,
      theme: parseTheme(JSON.parse(definition_json)) ?? DEFAULT_THEME,
    }));
    return [...FACTORY_THEMES, ...own];
  }

  save({ id, name, theme }: ThemeInput) {
    const parsed = parseTheme(theme);
    const cleanName = name.trim().slice(0, 60);
    if (!parsed) throw new Error('El estilo no es válido');
    if (!cleanName) throw new Error('Falta el nombre del estilo');
    const json = JSON.stringify(parsed);
    if (id) {
      this.db.prepare('UPDATE themes SET name = ?, definition_json = ? WHERE id = ?').run(cleanName, json, Number(id));
      return id;
    }
    const result = this.db.prepare('INSERT INTO themes (name, definition_json) VALUES (?, ?)').run(cleanName, json);
    return String(result.lastInsertRowid);
  }

  remove(id: string) {
    this.db.prepare('DELETE FROM themes WHERE id = ?').run(Number(id));
    const assignment = this.assignment();
    this.assign({
      song: assignment.song === id ? DEFAULT_ASSIGNMENT.song : assignment.song,
      bible: assignment.bible === id ? DEFAULT_ASSIGNMENT.bible : assignment.bible,
    });
  }

  assignment(): ThemeAssignment {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(ASSIGNMENT_KEY) as
      { value_json: string } | undefined;
    return row ? { ...DEFAULT_ASSIGNMENT, ...JSON.parse(row.value_json) } : DEFAULT_ASSIGNMENT;
  }

  assign(assignment: ThemeAssignment) {
    const value = JSON.stringify({ song: String(assignment.song), bible: String(assignment.bible) });
    this.db
      .prepare(
        `INSERT INTO settings (key, value_json) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json`,
      )
      .run(ASSIGNMENT_KEY, value);
  }
}
