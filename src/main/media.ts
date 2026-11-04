import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import type { MediaAddResult, MediaItem } from '@shared/api';
import type { Db } from './db/database';

const KINDS: Record<string, 'image' | 'video'> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
  mp4: 'video',
  m4v: 'video',
  webm: 'video',
  mov: 'video',
};

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export const MEDIA_EXTENSIONS = Object.keys(KINDS);
export const MEDIA_SCHEME = 'cef-media';

type MediaRow = {
  id: number;
  sha256: string;
  kind: 'image' | 'video';
  ext: string;
  original_name: string;
  size: number;
};

export function hashFile(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

// Hace la miniatura de un archivo. Devuelve un JPEG, o null si no se pudo.
export type MakeThumbnail = (file: string, kind: 'image' | 'video') => Promise<Buffer | null>;

// Los archivos se guardan por el hash de su contenido: importar dos veces no ocupa más lugar.
export class MediaService {
  constructor(
    private db: Db,
    private folder: string,
    private makeThumbnail: MakeThumbnail = async () => null,
  ) {}

  async list(): Promise<MediaItem[]> {
    const rows = this.db.prepare('SELECT * FROM media ORDER BY id DESC').all() as MediaRow[];
    return Promise.all(rows.map((row) => this.toItem(row)));
  }

  private async toItem({ id, sha256, kind, ext, original_name, size }: MediaRow): Promise<MediaItem> {
    const url = `${MEDIA_SCHEME}://media/${sha256}.${ext}`;
    const hasThumb = await this.ensureThumbnail(sha256, ext, kind);
    return {
      id,
      kind,
      name: original_name,
      size,
      url,
      ...(hasThumb ? { thumb: `${MEDIA_SCHEME}://media/${sha256}.thumb.jpg` } : {}),
    };
  }

  // Las miniaturas se hacen una vez y quedan en disco, también para lo importado antes.
  private async ensureThumbnail(sha256: string, ext: string, kind: 'image' | 'video') {
    const thumb = join(this.folder, `${sha256}.thumb.jpg`);
    try {
      await access(thumb);
      return true;
    } catch {
      const data = await this.makeThumbnail(join(this.folder, `${sha256}.${ext}`), kind).catch(() => null);
      if (!data) return false;
      await writeFile(thumb, data);
      return true;
    }
  }

  async add(files: string[]): Promise<MediaAddResult> {
    await mkdir(this.folder, { recursive: true });
    const result: MediaAddResult = { added: 0, rejected: [] };
    for (const file of files) {
      const ext = extname(file).slice(1).toLowerCase();
      const kind = KINDS[ext];
      if (!kind) {
        result.rejected.push(basename(file));
        continue;
      }
      const sha256 = await hashFile(file);
      await copyFile(file, join(this.folder, `${sha256}.${ext}`));
      const { size } = await stat(file);
      const { changes } = this.db
        .prepare('INSERT OR IGNORE INTO media (sha256, kind, ext, original_name, size) VALUES (?, ?, ?, ?, ?)')
        .run(sha256, kind, ext, basename(file), size);
      result.added += changes;
    }
    return result;
  }

  async remove(id: number) {
    const row = this.db.prepare('SELECT * FROM media WHERE id = ?').get(id) as MediaRow | undefined;
    if (!row) return;
    this.db.prepare('DELETE FROM media WHERE id = ?').run(id);
    await rm(join(this.folder, `${row.sha256}.${row.ext}`), { force: true });
    await rm(join(this.folder, `${row.sha256}.thumb.jpg`), { force: true });
  }

  // Respuesta del protocolo cef-media, con Range para que el video pueda saltar.
  async serve(request: Request) {
    const name = new URL(request.url).pathname.slice(1);
    const match = /^[0-9a-f]{64}(?:\.thumb)?\.([a-z0-9]+)$/.exec(name);
    if (!match) return new Response(null, { status: 404 });
    const file = join(this.folder, name);
    let size: number;
    try {
      ({ size } = await stat(file));
    } catch {
      return new Response(null, { status: 404 });
    }
    const headers = new Headers({
      'Content-Type': MIME[match[1]] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
    });
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
    let start = 0;
    let end = size - 1;
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(Number(range[2]), end);
      } else {
        start = Math.max(0, size - Number(range[2]));
      }
      if (start > end) return new Response(null, { status: 416 });
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    headers.set('Content-Length', String(end - start + 1));
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: range && (range[1] || range[2]) ? 206 : 200, headers });
  }
}
