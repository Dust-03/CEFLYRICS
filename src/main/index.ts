import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, Menu, app, ipcMain, type WebContents } from 'electron';
import { IPC, type AppInfo } from '@shared/api';
import { parseAction, type Action } from '@shared/state';
import { BibleService } from './bible/service';
import { openDatabase } from './db/database';
import { OnAirStore } from './store';
import { OutputWindow, createOperatorWindow } from './windows';

// En desarrollo los datos quedan en el proyecto, no en el perfil del usuario.
if (!app.isPackaged) app.setPath('userData', join(app.getAppPath(), 'userdata'));

const store = new OnAirStore();

const SHORTCUTS: Record<string, Action> = {
  F8: { type: 'toggle-mode', mode: 'wallpaper' },
  F9: { type: 'toggle-mode', mode: 'background' },
  F10: { type: 'toggle-mode', mode: 'black' },
  Escape: { type: 'clear' },
};

// Los atajos se atienden acá para que funcionen desde cualquier ventana, con cualquier foco.
function handleShortcuts(contents: WebContents) {
  contents.on('before-input-event', (event, input) => {
    const action = SHORTCUTS[input.key];
    if (input.type !== 'keyDown' || input.isAutoRepeat || !action) return;
    event.preventDefault();
    store.dispatch(action);
  });
}

function broadcast(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

app.whenReady().then(() => {
  // Sin menú: F10 abriría el de Windows en vez de poner negro.
  Menu.setApplicationMenu(null);

  const dbFile = join(app.getPath('userData'), 'ceflirics.db');
  // La primera vez se parte de la base de fábrica, que ya trae las biblias y su índice.
  const factoryDb = app.isPackaged
    ? join(process.resourcesPath, 'bibles.db')
    : join(app.getAppPath(), 'resources/bibles.db');
  if (!existsSync(dbFile) && existsSync(factoryDb)) copyFileSync(factoryDb, dbFile);
  const db = openDatabase(dbFile);
  app.on('will-quit', () => db.close());

  const output = new OutputWindow(
    (info) => broadcast(IPC.outputInfoChanged, info),
    (window) => handleShortcuts(window.webContents),
  );

  store.subscribe((state) => broadcast(IPC.stateChanged, state));

  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({
    name: 'CEFLIRICS',
    version: app.getVersion(),
    electron: process.versions.electron,
  }));
  ipcMain.handle(IPC.getState, () => store.current);
  ipcMain.on(IPC.dispatch, (_event, input: unknown) => {
    const action = parseAction(input);
    if (action) store.dispatch(action);
  });
  const bible = new BibleService(db);
  ipcMain.handle(IPC.bibleList, () => bible.list());
  ipcMain.handle(IPC.bibleBooks, (_event, code: string) => bible.books(String(code)));
  ipcMain.handle(IPC.bibleChapter, (_event, code: string, book: number, chapter: number) =>
    bible.chapter(String(code), Number(book), Number(chapter)),
  );
  ipcMain.handle(IPC.bibleSearch, (_event, code: string, query: string) => bible.search(String(code), String(query)));
  ipcMain.handle(IPC.getOutputInfo, () => output.info);
  ipcMain.on(IPC.toggleOutput, () => output.toggle());

  const operator = createOperatorWindow();
  handleShortcuts(operator.webContents);
  // La salida sola no sirve: al cerrar el operador se cierra todo.
  operator.on('closed', () => output.close());
  output.openIfExternalDisplay();
});

app.on('window-all-closed', () => app.quit());
