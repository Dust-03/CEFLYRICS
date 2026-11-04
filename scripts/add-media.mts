// Carga archivos en los Medios de la base de desarrollo, sin abrir la app.
// Uso: npx tsx scripts/add-media.mts archivo1.jpg archivo2.mp4
import { mkdirSync } from 'node:fs';
import { openDatabase } from '../src/main/db/database';
import { MediaService } from '../src/main/media';

mkdirSync('userdata', { recursive: true });
const db = openDatabase('userdata/ceflirics.db');
const media = new MediaService(db, 'userdata/media');
console.log(await media.add(process.argv.slice(2)));
console.log(`Medios en total: ${media.list().length}`);
db.close();
