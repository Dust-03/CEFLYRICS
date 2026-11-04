import type { Action, OnAirState } from './state';

// Lo que el preload expone a los renderers en window.ceflirics.
export type AppInfo = {
  name: string;
  version: string;
  electron: string;
};

export type OutputInfo = {
  open: boolean;
  fullscreen: boolean;
  displays: number;
};

export type BibleInfo = { code: string; name: string; language: string };
export type BibleBook = { book: number; name: string; chapters: number };
export type BibleVerse = { vid: number; text: string; label: string };

export type BibleSearchResult =
  | { kind: 'reference'; book: number; chapter: number; verses: BibleVerse[] }
  | { kind: 'text'; book?: number; verses: BibleVerse[] };

export type BibleApi = {
  list: () => Promise<BibleInfo[]>;
  books: (code: string) => Promise<BibleBook[]>;
  chapter: (code: string, book: number, chapter: number) => Promise<BibleVerse[]>;
  search: (code: string, query: string) => Promise<BibleSearchResult>;
};

export type CefliricsApi = {
  getAppInfo: () => Promise<AppInfo>;
  getState: () => Promise<OnAirState>;
  dispatch: (action: Action) => void;
  onState: (listener: (state: OnAirState) => void) => () => void;
  getOutputInfo: () => Promise<OutputInfo>;
  toggleOutput: () => void;
  onOutputInfo: (listener: (info: OutputInfo) => void) => () => void;
  bible: BibleApi;
};

export const IPC = {
  getAppInfo: 'app:get-info',
  getState: 'state:get',
  dispatch: 'state:dispatch',
  stateChanged: 'state:changed',
  getOutputInfo: 'output:get-info',
  toggleOutput: 'output:toggle',
  outputInfoChanged: 'output:info-changed',
  bibleList: 'bible:list',
  bibleBooks: 'bible:books',
  bibleChapter: 'bible:chapter',
  bibleSearch: 'bible:search',
} as const;
