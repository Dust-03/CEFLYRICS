import Database from 'better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations';

export type Db = InstanceType<typeof Database>;

export function openDatabase(file: string, migrations: Migration[] = MIGRATIONS) {
  const db = new Database(file);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Con WAL, NORMAL no arriesga la base; evita esperar al disco en cada escritura.
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 67108864');
    migrate(db, migrations);
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

// Cada migración corre en su transacción: si falla, la base queda como estaba.
function migrate(db: Db, migrations: Migration[]) {
  const current = db.pragma('user_version', { simple: true }) as number;
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) {
    throw new Error(
      `La base está en la versión ${current} y este programa llega a la ${latest}: hay que actualizarlo.`,
    );
  }
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}
