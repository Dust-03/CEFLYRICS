import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CefliricsApi } from '@shared/api';

function subscribe<T>(channel: string, listener: (payload: T) => void) {
  const handler = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: CefliricsApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  getState: () => ipcRenderer.invoke(IPC.getState),
  dispatch: (action) => ipcRenderer.send(IPC.dispatch, action),
  onState: (listener) => subscribe(IPC.stateChanged, listener),
  getOutputInfo: () => ipcRenderer.invoke(IPC.getOutputInfo),
  toggleOutput: () => ipcRenderer.send(IPC.toggleOutput),
  onOutputInfo: (listener) => subscribe(IPC.outputInfoChanged, listener),
  lan: {
    info: () => ipcRenderer.invoke(IPC.lanInfo),
    setPort: (port) => ipcRenderer.send(IPC.lanSetPort, port),
    setEnabled: (enabled) => ipcRenderer.send(IPC.lanSetEnabled, enabled),
    onInfo: (listener) => subscribe(IPC.lanInfoChanged, listener),
  },
  bible: {
    list: () => ipcRenderer.invoke(IPC.bibleList),
    books: (code) => ipcRenderer.invoke(IPC.bibleBooks, code),
    chapter: (code, book, chapter) => ipcRenderer.invoke(IPC.bibleChapter, code, book, chapter),
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
  },
  shortcuts: {
    list: () => ipcRenderer.invoke(IPC.shortcutList),
    add: (ref) => ipcRenderer.invoke(IPC.shortcutAdd, ref),
    remove: (id) => ipcRenderer.invoke(IPC.shortcutRemove, id),
    reorder: (ids) => ipcRenderer.invoke(IPC.shortcutReorder, ids),
  },
};

contextBridge.exposeInMainWorld('ceflirics', api);
