import type { ThemeAssignment, ThemeInput } from '@shared/api';
import { DEFAULT_THEME, FACTORY_THEMES, parseTheme, type ThemeEntry } from '@shared/theme';
import type { Db } from './db/database';
import { readSetting, writeSetting } from './settings';

const ASSIGNMENT_KEY = 'themes.assignment';
// Los de fábrica viven en el código: borrarlos es esconderlos.
const HIDDEN_KEY = 'themes.hidden';
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
    const hidden = new Set(readSetting<string[]>(this.db, HIDDEN_KEY) ?? []);
    return [...FACTORY_THEMES.filter((entry) => !hidden.has(entry.id)), ...own];
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
    if (FACTORY_THEMES.some((entry) => entry.id === id)) {
      writeSetting(this.db, HIDDEN_KEY, [...new Set([...(readSetting<string[]>(this.db, HIDDEN_KEY) ?? []), id])]);
    } else {
      this.db.prepare('DELETE FROM themes WHERE id = ?').run(Number(id));
    }
    // Lo que usaba el estilo borrado pasa al primero que quede; sin ninguno, sale el de base.
    const fallback = this.list()[0]?.id ?? '';
    const assignment = this.assignment();
    this.assign({
      song: assignment.song === id ? fallback : assignment.song,
      bible: assignment.bible === id ? fallback : assignment.bible,
    });
  }

  assignment(): ThemeAssignment {
    return { ...DEFAULT_ASSIGNMENT, ...readSetting<ThemeAssignment>(this.db, ASSIGNMENT_KEY) };
  }

  assign(assignment: ThemeAssignment) {
    writeSetting(this.db, ASSIGNMENT_KEY, { song: String(assignment.song), bible: String(assignment.bible) });
  }
}
