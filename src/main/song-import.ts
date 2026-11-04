import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { ImportResult, SongInput } from '@shared/api';
import { toSongText } from '@shared/song-text';
import type { SongService } from './songs';

export const SONG_EXTENSIONS = ['txt', 'xml'];

const MAX_FILE = 2 * 1024 * 1024;

// Los TXT hechos en Windows suelen venir en la codificación vieja: los acentos saldrían rotos.
export function decodeText(data: Buffer) {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('windows-1252').decode(data);
  }
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

export function decodeXml(text: string) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|quot|apos|amp));/gi, (_all, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[name.toLowerCase()];
  });
}

const stripTags = (text: string) => text.replace(/<[^>]*>/g, '');

const SECTION_NAMES: Record<string, string> = {
  v: 'Verso',
  c: 'Coro',
  b: 'Puente',
  p: 'Precoro',
  i: 'Intro',
  e: 'Final',
};

function sectionLabel(name: string) {
  const match = /^([a-z])(\d*)/i.exec(name);
  const section = match && SECTION_NAMES[match[1].toLowerCase()];
  return section ? `${section}${match[2] ? ` ${match[2]}` : ''}` : '';
}

// OpenLyrics es el formato abierto de letras, el que usa OpenLP entre otros.
export function parseOpenLyrics(xml: string): Omit<SongInput, 'id'> {
  if (!/<song\b/.test(xml)) throw new Error('no es un archivo OpenLyrics');
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(xml)?.[1];
  const authors = [...xml.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/g)].map(([, name]) =>
    decodeXml(stripTags(name)).trim(),
  );
  const blocks: string[] = [];
  for (const [, attributes, body] of xml.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/g)) {
    const label = sectionLabel(/\bname="([^"]*)"/.exec(attributes)?.[1] ?? '');
    const lines = [...body.matchAll(/<lines\b[^>]*>([\s\S]*?)<\/lines>/g)]
      .map(([, text]) => text.replace(/<comment\b[^>]*>[\s\S]*?<\/comment>/g, '').replace(/<br\s*\/?>/g, '\n'))
      .map((text) => decodeXml(stripTags(text)))
      .join('\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length) blocks.push([label, ...lines].filter(Boolean).join('\n'));
  }
  if (!title?.trim() || !blocks.length) throw new Error('no tiene título o letra');
  return { title: decodeXml(stripTags(title)).trim(), author: authors.join(', '), text: blocks.join('\n\n') };
}

function fileNameFor(title: string, used: Set<string>) {
  const clean =
    title
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, '')
      .replace(/[. ]+$/, '')
      .trim() || 'Canción';
  let name = clean;
  for (let copy = 2; used.has(name.toLowerCase()); copy++) name = `${clean} (${copy})`;
  used.add(name.toLowerCase());
  return `${name}.txt`;
}

export class SongImporter {
  constructor(private songs: SongService) {}

  private async read(file: string): Promise<Omit<SongInput, 'id'>> {
    const data = await readFile(file);
    if (data.length > MAX_FILE) throw new Error('es demasiado grande');
    const text = decodeText(data);
    if (extname(file).toLowerCase() === '.xml') return parseOpenLyrics(text);
    return { title: basename(file, extname(file)).trim(), author: '', text };
  }

  async import(files: string[]): Promise<ImportResult> {
    const known = new Set(this.songs.list('').map(({ title }) => title.toLowerCase()));
    const result: ImportResult = { added: 0, rejected: [] };
    for (const file of files) {
      const name = basename(file);
      try {
        const song = await this.read(file);
        if (known.has(song.title.toLowerCase())) throw new Error('ya existe una canción con ese título');
        this.songs.save(song);
        known.add(song.title.toLowerCase());
        result.added++;
      } catch (error) {
        result.rejected.push({ name, reason: (error as Error).message });
      }
    }
    return result;
  }

  // Una canción por archivo, en el mismo formato con el que se escribe la letra.
  async export(folder: string) {
    await mkdir(folder, { recursive: true });
    const used = new Set<string>();
    const summaries = this.songs.list('');
    for (const { id, title } of summaries) {
      const song = this.songs.get(id);
      if (song) await writeFile(join(folder, fileNameFor(title, used)), toSongText(song.slides));
    }
    return summaries.length;
  }
}
