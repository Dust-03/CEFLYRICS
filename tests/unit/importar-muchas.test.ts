import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { openDatabase, type Db } from '../../src/main/db/database';
import { SongImporter } from '../../src/main/song-import';
import { SongService } from '../../src/main/songs';

let dir: string;
let db: Db;
let songs: SongService;
let importer: SongImporter;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-muchas-'));
  db = openDatabase(join(dir, 'datos.db'));
  songs = new SongService(db);
  importer = new SongImporter(songs);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// La lista de la pantalla corta en 300; importar y exportar no pueden cortar.
test('con más de 300 canciones, importar dos veces no duplica y exportar las guarda todas', async () => {
  const list = Array.from({ length: 450 }, (_, index) => ({
    id: index,
    title: `Canción ${String(index).padStart(3, '0')}`,
    lyrics: { paragraphs: [{ description: '', text: `Letra ${index}` }] },
  }));
  const file = join(dir, 'holyrics.json');
  writeFileSync(file, JSON.stringify(list));

  expect((await importer.import([file])).added).toBe(450);
  const again = await importer.import([file]);
  expect(again.added).toBe(0);
  expect(again.rejected).toHaveLength(0);
  expect(again.repeated).toBe(450);
  expect(songs.all()).toHaveLength(450);

  const folder = join(dir, 'exportadas');
  expect(await importer.export(folder)).toBe(450);
  expect(readdirSync(folder)).toHaveLength(450);
});

test('saltea las repetidas: mismo título con otras tildes o signos, o la misma letra', async () => {
  songs.save({ title: 'Cuán grande es Él', author: '', text: 'Primera estrofa\n\nCoro\nSegunda parte' });
  const list = [
    { id: 1, title: '¡Cuan Grande es El!', lyrics: { paragraphs: [{ description: '', text: 'Otra letra' }] } },
    {
      id: 2,
      title: 'Otro nombre',
      lyrics: {
        paragraphs: [
          { description: '', text: 'Primera estrofa' },
          { description: 'Coro', text: 'Segunda parte' },
        ],
      },
    },
    { id: 3, title: 'Nueva', lyrics: { paragraphs: [{ description: '', text: 'Letra nueva' }] } },
    { id: 4, title: 'nueva', lyrics: { paragraphs: [{ description: '', text: 'Letra distinta' }] } },
  ];
  const file = join(dir, 'holyrics.json');
  writeFileSync(file, JSON.stringify(list));

  const result = await importer.import([file]);
  expect(result).toEqual({ added: 1, rejected: [], repeated: 3 });
  expect(songs.all().map(({ title }) => title)).toEqual(['Cuán grande es Él', 'Nueva']);
});
