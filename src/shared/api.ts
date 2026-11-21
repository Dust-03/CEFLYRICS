import type { LanApi } from './lan';
import type { SongSlide } from './song-text';
import type { Action, OnAirState } from './state';
import type { Theme, ThemeEntry } from './theme';
import type { TimerConfig } from './timers';

// Lo que el preload expone a los renderers en window.ceflyrics.
export type AppInfo = {
  name: string;
  version: string;
  electron: string;
};

// Resultado de buscar actualizaciones a mano: 'dev' cuando corre sin instalar.
export type UpdateCheck = 'available' | 'latest' | 'error' | 'dev';

export type OutputInfo = {
  open: boolean;
  fullscreen: boolean;
  displays: number;
  // Resolución real de la salida, en píxeles. En cero si está cerrada.
  width: number;
  height: number;
};

export type BibleInfo = { code: string; name: string; language: string; imported?: boolean };
export type BibleBook = { book: number; name: string; chapters: number };
export type BibleVerse = { vid: number; text: string; label: string };

export type BibleSearchResult =
  | { kind: 'reference'; book: number; chapter: number; verses: BibleVerse[] }
  | { kind: 'text'; book?: number; verses: BibleVerse[] };

export type BibleApi = {
  list: () => Promise<BibleInfo[]>;
  books: (code: string) => Promise<BibleBook[]>;
  chapter: (code: string, book: number, chapter: number) => Promise<BibleVerse[]>;
  chapterVerseIds: (code: string, book: number, chapter: number) => Promise<number[]>;
  verse: (code: string, vid: number) => Promise<BibleVerse | undefined>;
  search: (code: string, query: string) => Promise<BibleSearchResult>;
};

export type SongSummary = { id: number; title: string; author: string };
export type Song = SongSummary & { slides: SongSlide[] };
export type SongInput = { id?: number; title: string; author: string; text: string };

export type SongApi = {
  list: (query: string) => Promise<SongSummary[]>;
  get: (id: number) => Promise<Song | null>;
  save: (input: SongInput) => Promise<number>;
  remove: (id: number) => Promise<void>;
};

export type MediaItem = {
  id: number;
  kind: 'image' | 'video';
  name: string;
  size: number;
  url: string;
  thumb?: string;
};
export type MediaAddResult = { added: number; rejected: string[] };

export type MediaApi = {
  list: () => Promise<MediaItem[]>;
  add: () => Promise<MediaAddResult>;
  remove: (id: number) => Promise<void>;
  onChange: (listener: () => void) => () => void;
};

export type ThemeInput = { id?: string; name: string; theme: Theme };
export type ThemeAssignment = { song: string; bible: string };

export type ThemeApi = {
  list: () => Promise<ThemeEntry[]>;
  save: (input: ThemeInput) => Promise<string>;
  remove: (id: string) => Promise<void>;
  assignment: () => Promise<ThemeAssignment>;
  assign: (assignment: ThemeAssignment) => Promise<void>;
};

export type TimerInput = Omit<TimerConfig, 'id'> & { id?: number };

export type TimerApi = {
  list: () => Promise<TimerConfig[]>;
  save: (input: TimerInput) => Promise<number>;
  remove: (id: number) => Promise<void>;
  onChange: (listener: () => void) => () => void;
};

export type Shortcut = {
  id: number;
  ref: string;
  kind: 'verse' | 'song' | 'media';
  title: string;
  text: string;
  songId?: number;
  media?: MediaItem;
};

export type ShortcutApi = {
  list: () => Promise<Shortcut[]>;
  add: (ref: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  reorder: (ids: number[]) => Promise<void>;
  onChange: (listener: () => void) => () => void;
};

export type DataCounts = {
  songs: number;
  media: number;
  themes: number;
  timers: number;
  shortcuts: number;
  bibles: number;
};
export type DataResult = { canceled: true } | { counts: DataCounts } | { error: string };

export type ImportResult = { added: number; rejected: { name: string; reason: string }[] };
export type BibleImportInput = { code: string; name: string };
type Dialog<T> = T | { canceled: true } | { error: string };

export type DataApi = {
  export: () => Promise<DataResult>;
  import: () => Promise<DataResult>;
  importSongs: () => Promise<Dialog<ImportResult>>;
  exportSongs: () => Promise<Dialog<{ count: number }>>;
  importBible: (input: BibleImportInput) => Promise<Dialog<ImportResult>>;
  removeBible: (code: string) => Promise<void>;
};

export type CeflyricsApi = {
  getAppInfo: () => Promise<AppInfo>;
  getState: () => Promise<OnAirState>;
  dispatch: (action: Action) => void;
  onState: (listener: (state: OnAirState) => void) => () => void;
  getOutputInfo: () => Promise<OutputInfo>;
  toggleOutput: () => void;
  toggleFullscreen: () => void;
  setTitleBarTheme: (theme: 'dark' | 'light') => void;
  checkUpdates: () => Promise<UpdateCheck>;
  // Porcentaje de la descarga de una actualización; null cuando termina o falla.
  onUpdateProgress: (listener: (percent: number | null) => void) => () => void;
  onOutputInfo: (listener: (info: OutputInfo) => void) => () => void;
  bible: BibleApi;
  songs: SongApi;
  media: MediaApi;
  themes: ThemeApi;
  timers: TimerApi;
  shortcuts: ShortcutApi;
  lan: LanApi;
  data: DataApi;
};

export const IPC = {
  getAppInfo: 'app:get-info',
  getState: 'state:get',
  dispatch: 'state:dispatch',
  stateChanged: 'state:changed',
  getOutputInfo: 'output:get-info',
  toggleOutput: 'output:toggle',
  toggleFullscreen: 'window:toggle-fullscreen',
  setTitleBarTheme: 'window:title-bar-theme',
  checkUpdates: 'app:check-updates',
  updateProgress: 'app:update-progress',
  outputInfoChanged: 'output:info-changed',
  bibleList: 'bible:list',
  bibleBooks: 'bible:books',
  bibleChapter: 'bible:chapter',
  bibleChapterVerseIds: 'bible:chapter-verse-ids',
  bibleVerse: 'bible:verse',
  bibleSearch: 'bible:search',
  songList: 'songs:list',
  songGet: 'songs:get',
  songSave: 'songs:save',
  songRemove: 'songs:remove',
  mediaList: 'media:list',
  mediaAdd: 'media:add',
  mediaRemove: 'media:remove',
  mediaChanged: 'media:changed',
  themeList: 'themes:list',
  themeSave: 'themes:save',
  themeRemove: 'themes:remove',
  themeAssignment: 'themes:assignment',
  themeAssign: 'themes:assign',
  timerList: 'timers:list',
  timerSave: 'timers:save',
  timerRemove: 'timers:remove',
  timersChanged: 'timers:changed',
  shortcutList: 'shortcuts:list',
  shortcutAdd: 'shortcuts:add',
  shortcutRemove: 'shortcuts:remove',
  shortcutReorder: 'shortcuts:reorder',
  shortcutsChanged: 'shortcuts:changed',
  dataExport: 'data:export',
  dataImport: 'data:import',
  dataImportSongs: 'data:import-songs',
  dataExportSongs: 'data:export-songs',
  dataImportBible: 'data:import-bible',
  dataRemoveBible: 'data:remove-bible',
  lanInfo: 'lan:info',
  lanSetPort: 'lan:set-port',
  lanSetEnabled: 'lan:set-enabled',
  lanSetSound: 'lan:set-sound',
  lanRenewPin: 'lan:renew-pin',
  lanUnlink: 'lan:unlink',
  lanInfoChanged: 'lan:info-changed',
} as const;
