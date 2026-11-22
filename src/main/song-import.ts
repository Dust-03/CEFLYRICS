import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { ImportResult, SongInput } from '@shared/api';
import { parseSongText, toSongText } from '@shared/song-text';
import type { SongService } from './songs';

export const SONG_EXTENSIONS = ['txt', 'xml', 'json'];

const MAX_FILE = 2 * 1024 * 1024;
// Un JSON de Holyrics trae todas las canciones juntas, así que puede pesar bastante más.
const MAX_JSON = 50 * 1024 * 1024;

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

// Sin tildes, mayúsculas ni signos: "¡Cuán Grande!" y "cuan grande" son la misma canción.
// La ñ queda como n: alcanza para comparar.
export const songKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

type SongEntry = { name: string; song?: Omit<SongInput, 'id'>; error?: string };

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

// Solo se usa la descripción de la estrofa si el programa la reconoce como etiqueta ("Coro", "Verso 2").
function holyricsLabel(description: string) {
  const label = description.trim();
  if (!label) return '';
  return parseSongText(`${label}\nx`)[0]?.text === 'x' ? label : '';
}

function holyricsSong(item: unknown): Omit<SongInput, 'id'> {
  if (!item || typeof item !== 'object') throw new Error('no es una canción');
  const song = item as Record<string, unknown>;
  const title = asText(song.title).trim();
  const lyrics = (song.lyrics ?? {}) as Record<string, unknown>;
  const paragraphs = Array.isArray(lyrics.paragraphs) ? lyrics.paragraphs : [];
  const blocks = paragraphs
    .map((paragraph) => {
      const { text, description } = (paragraph ?? {}) as Record<string, unknown>;
      // Dentro de una estrofa no puede quedar una línea en blanco: la partiría en dos diapositivas.
      const lines = asText(text)
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return lines.length ? [holyricsLabel(asText(description)), ...lines].filter(Boolean).join('\n') : '';
    })
    .filter(Boolean);
  const text = blocks.length ? blocks.join('\n\n') : asText(lyrics.full_text).replace(/\r/g, '').trim();
  if (!title || !text) throw new Error('no tiene título o letra');
  return { title, author: (asText(song.author) || asText(song.artist)).trim(), text };
}

// El archivo que exporta Holyrics es una lista de canciones, cada una con sus estrofas en "lyrics.paragraphs".
export function parseHolyricsJson(json: string): SongEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(json.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('no es un archivo JSON válido');
  }
  const list = Array.isArray(data) ? data : [data];
  if (!list.some((item) => item && typeof item === 'object' && 'lyrics' in item)) {
    throw new Error('no es una exportación de canciones de Holyrics');
  }
  return list.map((item, index) => {
    const name = asText((item as Record<string, unknown>)?.title).trim() || `Canción ${index + 1}`;
    try {
      return { name, song: holyricsSong(item) };
    } catch (error) {
      return { name, error: (error as Error).message };
    }
  });
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

  private async read(file: string): Promise<SongEntry[]> {
    const name = basename(file);
    const isJson = extname(file).toLowerCase() === '.json';
    const data = await readFile(file);
    if (data.length > (isJson ? MAX_JSON : MAX_FILE)) throw new Error('es demasiado grande');
    const text = decodeText(data);
    if (isJson) return parseHolyricsJson(text).map((entry) => ({ ...entry, name: `${name}: ${entry.name}` }));
    if (extname(file).toLowerCase() === '.xml') return [{ name, song: parseOpenLyrics(text) }];
    return [{ name, song: { title: basename(file, extname(file)).trim(), author: '', text } }];
  }

  async import(files: string[]): Promise<ImportResult> {
    const titles = new Set(this.songs.all().map(({ title }) => songKey(title)));
    const lyrics = new Set(this.songs.allLyrics().map(songKey));
    const result: ImportResult = { added: 0, rejected: [], repeated: 0 };
    for (const file of files) {
      let entries: SongEntry[];
      try {
        entries = await this.read(file);
      } catch (error) {
        result.rejected.push({ name: basename(file), reason: (error as Error).message });
        continue;
      }
      for (const { name, song, error } of entries) {
        if (!song) {
          result.rejected.push({ name, reason: error ?? 'no se pudo leer' });
          continue;
        }
        // Repetida si ya hay una con el mismo título o con la misma letra, también dentro de lo que se importa.
        const title = songKey(song.title);
        const text = songKey(
          parseSongText(song.text)
            .map((slide) => slide.text)
            .join('\n'),
        );
        if (titles.has(title) || (text && lyrics.has(text))) {
          result.repeated!++;
          continue;
        }
        // Una canción vacía o rota no puede frenar a las demás del mismo archivo.
        try {
          this.songs.save(song);
          titles.add(title);
          if (text) lyrics.add(text);
          result.added++;
        } catch (saveError) {
          result.rejected.push({ name, reason: (saveError as Error).message });
        }
      }
    }
    return result;
  }

  // Una canción por archivo, en el mismo formato con el que se escribe la letra.
  async export(folder: string) {
    await mkdir(folder, { recursive: true });
    const used = new Set<string>();
    const summaries = this.songs.all();
    for (const { id, title } of summaries) {
      const song = this.songs.get(id);
      if (song) await writeFile(join(folder, fileNameFor(title, used)), toSongText(song.slides));
    }
    return summaries.length;
  }
}
