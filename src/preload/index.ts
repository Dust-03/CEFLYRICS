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
  bible: {
    list: () => ipcRenderer.invoke(IPC.bibleList),
    books: (code) => ipcRenderer.invoke(IPC.bibleBooks, code),
    chapter: (code, book, chapter) => ipcRenderer.invoke(IPC.bibleChapter, code, book, chapter),
    search: (code, query) => ipcRenderer.invoke(IPC.bibleSearch, code, query),
  },
};

contextBridge.exposeInMainWorld('ceflirics', api);
