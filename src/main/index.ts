import { join } from 'node:path';
import { BrowserWindow, app, ipcMain } from 'electron';
import { IPC, type AppInfo } from '@shared/api';

// En desarrollo los datos quedan en el proyecto, no en el perfil del usuario.
if (!app.isPackaged) app.setPath('userData', join(app.getAppPath(), 'userdata'));

function openOperatorWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'CEFLIRICS',
    backgroundColor: '#0e1320',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once('ready-to-show', () => window.show());

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer) window.loadURL(`${devServer}/operator/index.html`);
  else window.loadFile(join(__dirname, '../renderer/operator/index.html'));
}

ipcMain.handle(
  IPC.getAppInfo,
  (): AppInfo => ({ name: 'CEFLIRICS', version: app.getVersion(), electron: process.versions.electron }),
);

app.whenReady().then(() => {
  openOperatorWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openOperatorWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
