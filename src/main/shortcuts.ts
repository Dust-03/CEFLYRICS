import type { Shortcut } from '@shared/api';
import type { BibleService } from './bible/service';
import type { Db } from './db/database';
import type { MediaService } from './media';
import type { SongService } from './songs';

// Un atajo guarda solo a qué apunta ("verse:RV1909:43003016", "song:12", "media:3"). El título y
// el texto se leen al listar: si la canción se edita, el atajo queda al día.
const REF = /^(?:verse:[\w-]+:\d+|song:\d+|media:\d+)$/;

export class ShortcutService {
  constructor(
    private db: Db,
    private bible: BibleService,
    private songs: SongService,
    private media: MediaService,
  ) {}

  async list(): Promise<Shortcut[]> {
    const rows = this.db.prepare('SELECT id, ref FROM shortcuts ORDER BY id').all() as { id: number; ref: string }[];
    const files = new Map((await this.media.list()).map((item) => [item.id, item]));
    const shortcuts: Shortcut[] = [];
    for (const { id, ref } of rows) {
      const shortcut = this.resolve(id, ref, files);
      // Lo que se borró de la biblioteca deja de ser un atajo.
      if (shortcut) shortcuts.push(shortcut);
      else this.remove(id);
    }
    return shortcuts;
  }

  private resolve(id: number, ref: string, files: Map<number, Shortcut['media'] & object>): Shortcut | null {
    const [kind, first, second] = ref.split(':');
    if (kind === 'verse') {
      const verse = this.bible.verse(first, Number(second));
      return verse ? { id, ref, kind, title: `${verse.label} · ${first}`, text: verse.text } : null;
    }
    if (kind === 'song') {
      const song = this.songs.get(Number(first));
      return song ? { id, ref, kind, title: song.title, text: song.slides[0]?.text ?? '', songId: song.id } : null;
    }
    const media = files.get(Number(first));
    return media ? { id, ref, kind: 'media', title: media.name, text: '', media } : null;
  }

  add(ref: string) {
    if (!REF.test(ref)) throw new Error('Atajo inválido');
    this.db.prepare('INSERT OR IGNORE INTO shortcuts (ref) VALUES (?)').run(ref);
  }

  remove(id: number) {
    this.db.prepare('DELETE FROM shortcuts WHERE id = ?').run(id);
  }
}
