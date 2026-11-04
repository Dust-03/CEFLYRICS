import type { TimerInput } from '@shared/api';
import type { TimerConfig } from '@shared/timers';
import type { Db } from './db/database';

export class TimerService {
  constructor(private db: Db) {}

  list() {
    return this.db
      .prepare('SELECT id, name, kind, seconds, clock, message FROM timers ORDER BY id')
      .all() as TimerConfig[];
  }

  save({ id, name, kind, seconds, clock, message }: TimerInput) {
    const cleanName = name.trim().slice(0, 60);
    if (!cleanName) throw new Error('Falta el nombre del temporizador');
    if (kind === 'duration' && !(seconds > 0)) throw new Error('Poné una duración mayor a cero');
    if (kind === 'clock' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new Error('Elegí una hora');
    const values = [cleanName, kind, Math.floor(seconds) || 0, clock, message.trim().slice(0, 200)];
    if (id) {
      this.db
        .prepare('UPDATE timers SET name = ?, kind = ?, seconds = ?, clock = ?, message = ? WHERE id = ?')
        .run(...values, id);
      return id;
    }
    const result = this.db
      .prepare('INSERT INTO timers (name, kind, seconds, clock, message) VALUES (?, ?, ?, ?, ?)')
      .run(...values);
    return Number(result.lastInsertRowid);
  }

  remove(id: number) {
    this.db.prepare('DELETE FROM timers WHERE id = ?').run(id);
  }
}
