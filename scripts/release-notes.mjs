// Imprime la parte de CHANGELOG.md de una versión, para usarla como notas del release en GitHub.
// Uso: node scripts/release-notes.mjs [versión]   (sin versión, la de package.json)
import { readFileSync } from 'node:fs';

const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
const sections = readFileSync('CHANGELOG.md', 'utf8').replaceAll('\r\n', '\n').split(/^## /m);
const section = sections.find((part) => part.startsWith(`${version}\n`));
if (!section) {
  console.error(`CHANGELOG.md no tiene la versión ${version}.`);
  process.exit(1);
}
console.log(section.slice(version.length).trim());
