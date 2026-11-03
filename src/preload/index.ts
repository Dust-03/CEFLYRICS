import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CefliricsApi } from '@shared/api';

const api: CefliricsApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
};

contextBridge.exposeInMainWorld('ceflirics', api);
