import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CeflyricsApi } from '@shared/api';

function subscribe<T>(channel: string, listener: (payload: T) => void) {
  const handler = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: CeflyricsApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  getState: () => ipcRenderer.invoke(IPC.getState),
  dispatch: (action) => ipcRenderer.send(IPC.dispatch, action),
  onState: (listener) => subscribe(IPC.stateChanged, listener),
  getOutputInfo: () => ipcRenderer.invoke(IPC.getOutputInfo),
  toggleOutput: () => ipcRenderer.send(IPC.toggleOutput),
  toggleFullscreen: () => ipcRenderer.send(IPC.toggleFullscreen),
  setTitleBarTheme: (theme) => ipcRenderer.send(IPC.setTitleBarTheme, theme),
  checkUpdates: () => ipcRenderer.invoke(IPC.checkUpdates),
  onUpdateProgress: (listener) => subscribe(IPC.updateProgress, listener),
  onOutputInfo: (listener) => subscribe(IPC.outputInfoChanged, listener),
  data: {
    export: () => ipcRenderer.invoke(IPC.dataExport),
    import: () => ipcRenderer.invoke(IPC.dataImport),
    importSongs: () => ipcRenderer.invoke(IPC.dataImportSongs),
    exportSongs: () => ipcRenderer.invoke(IPC.dataExportSongs),
    importBible: (input) => ipcRenderer.invoke(IPC.dataImportBible, input),
    removeBible: (code) => ipcRenderer.invoke(IPC.dataRemoveBible, code),
  },
  lan: {
    info: () => ipcRenderer.invoke(IPC.lanInfo),
    setPort: (port) => ipcRenderer.send(IPC.lanSetPort, port),
    setEnabled: (enabled) => ipcRenderer.send(IPC.lanSetEnabled, enabled),
    setSound: (sound) => ipcRenderer.send(IPC.lanSetSound, sound),
    renewPin: () => ipcRenderer.send(IPC.lanRenewPin),
    unlink: (id) => ipcRenderer.send(IPC.lanUnlink, id),
    onInfo: (listener) => subscribe(IPC.lanInfoChanged, listener),
  },
  bible: {
    list: () => ipcRenderer.invoke(IPC.bibleList),
    books: (code) => ipcRenderer.invoke(IPC.bibleBooks, code),
    chapter: (code, book, chapter) => ipcRenderer.invoke(IPC.bibleChapter, code, book, chapter),
    chapterVerseIds: (code, book, chapter) => ipcRenderer.invoke(IPC.bibleChapterVerseIds, code, book, chapter),
    verse: (code, vid) => ipcRenderer.invoke(IPC.bibleVerse, code, vid),
    search: (code, query) => ipcRenderer.invoke(IPC.bibleSearch, code, query),
  },
  songs: {
    list: (query) => ipcRenderer.invoke(IPC.songList, query),
    get: (id) => ipcRenderer.invoke(IPC.songGet, id),
    save: (input) => ipcRenderer.invoke(IPC.songSave, input),
    remove: (id) => ipcRenderer.invoke(IPC.songRemove, id),
  },
  media: {
    list: () => ipcRenderer.invoke(IPC.mediaList),
    add: () => ipcRenderer.invoke(IPC.mediaAdd),
    remove: (id) => ipcRenderer.invoke(IPC.mediaRemove, id),
    onChange: (listener) => subscribe(IPC.mediaChanged, listener),
  },
  themes: {
    list: () => ipcRenderer.invoke(IPC.themeList),
    save: (input) => ipcRenderer.invoke(IPC.themeSave, input),
    remove: (id) => ipcRenderer.invoke(IPC.themeRemove, id),
    assignment: () => ipcRenderer.invoke(IPC.themeAssignment),
    assign: (assignment) => ipcRenderer.invoke(IPC.themeAssign, assignment),
  },
  timers: {
    list: () => ipcRenderer.invoke(IPC.timerList),
    save: (input) => ipcRenderer.invoke(IPC.timerSave, input),
    remove: (id) => ipcRenderer.invoke(IPC.timerRemove, id),
    onChange: (listener) => subscribe(IPC.timersChanged, listener),
  },
  keys: {
    get: () => ipcRenderer.invoke(IPC.keysGet),
    save: (buttons) => ipcRenderer.invoke(IPC.keysSave, buttons),
    onChange: (listener) => subscribe(IPC.keysChanged, listener),
  },
  shortcuts: {
    list: () => ipcRenderer.invoke(IPC.shortcutList),
    add: (ref) => ipcRenderer.invoke(IPC.shortcutAdd, ref),
    remove: (id) => ipcRenderer.invoke(IPC.shortcutRemove, id),
    reorder: (ids) => ipcRenderer.invoke(IPC.shortcutReorder, ids),
    onChange: (listener) => subscribe(IPC.shortcutsChanged, listener),
  },
};

contextBridge.exposeInMainWorld('ceflyrics', api);
