// Guarda capturas de la búsqueda bíblica para revisar la interfaz de cada versión.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron } from '@playwright/test';

const output = resolve('release/capturas-1.3.0');
const userData = mkdtempSync(join(tmpdir(), 'ceflyrics-capturas-'));
mkdirSync(output, { recursive: true });
copyFileSync('resources/bibles.db', join(userData, 'ceflyrics.db'));
const db = new Database(join(userData, 'ceflyrics.db'));
db.prepare('INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)').run('lan.port', '8789');
db.close();

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, CEF_OUTPUT: 'window', CEF_USER_DATA: userData },
});

try {
  const operator = await app.firstWindow();
  await operator
    .locator('#inicio')
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => undefined);
  await operator.locator('button[data-book="19"]').click();
  await operator.locator('button[data-chapter="23"]').click();
  await operator.locator('[data-verse-number="6"]').waitFor();
  await operator.screenshot({ path: join(output, 'biblia-capitulo-y-versiculos.png') });

  await operator.locator('[data-verse-number="2"]').click();
  await operator.waitForFunction(() => document.querySelectorAll('#biblia-versos .verse').length === 1);
  await operator.waitForFunction(() =>
    document.querySelector('#vista-previa .cef-body')?.textContent?.includes('En lugares de delicados pastos'),
  );
  await operator.screenshot({ path: join(output, 'biblia-versiculo-seleccionado.png') });
  console.log(`Capturas guardadas en ${output}`);
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}
