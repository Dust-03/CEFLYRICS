import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, Menu, app, dialog, ipcMain, nativeImage, protocol, type WebContents } from 'electron';
import { IPC, type AppInfo, type SongInput, type ThemeAssignment, type ThemeInput, type TimerInput } from '@shared/api';
import { parsePort } from '@shared/lan';
import { parseAction, type Action } from '@shared/state';
import { BibleService } from './bible/service';
import { openDatabase } from './db/database';
import { LanControl } from './lan-control';
import { LanServer } from './lan-server';
import { MEDIA_EXTENSIONS, MEDIA_SCHEME, MediaService } from './media';
import { ShortcutService } from './shortcuts';
import { SongService } from './songs';
import { OnAirStore } from './store';
import { ThemeService } from './themes';
import { TimerService } from './timers';
import { OutputWindow, createOperatorWindow } from './windows';

// En desarrollo los datos quedan en el proyecto, no en el perfil del usuario.
if (!app.isPackaged) app.setPath('userData', process.env.CEF_USER_DATA ?? join(app.getAppPath(), 'userdata'));

// Las fotos y videos se sirven por un protocolo propio: las páginas no leen el disco.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

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

  const songs = new SongService(db);
  ipcMain.handle(IPC.songList, (_event, query: string) => songs.list(String(query ?? '')));
  ipcMain.handle(IPC.songGet, (_event, id: number) => songs.get(Number(id)));
  ipcMain.handle(IPC.songSave, (_event, input: SongInput) => songs.save(input));
  ipcMain.handle(IPC.songRemove, (_event, id: number) => songs.remove(Number(id)));

  const media = new MediaService(db, join(app.getPath('userData'), 'media'), async (file, kind) => {
    const size = { width: 480, height: 270 };
    // Windows hace también la de los videos; las fotos se achican directo, sin depender de eso.
    const image =
      kind === 'image'
        ? nativeImage.createFromPath(file).resize({ width: size.width, quality: 'good' })
        : await nativeImage.createThumbnailFromPath(file, size);
    return image.isEmpty() ? null : image.toJPEG(82);
  });
  protocol.handle(MEDIA_SCHEME, (request) => media.serve(request));
  ipcMain.handle(IPC.mediaList, () => media.list());
  ipcMain.handle(IPC.mediaAdd, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Agregar fotos y videos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Fotos y videos', extensions: MEDIA_EXTENSIONS }],
    });
    return canceled ? { added: 0, rejected: [] } : media.add(filePaths);
  });
  ipcMain.handle(IPC.mediaRemove, (_event, id: number) => media.remove(Number(id)));

  const themes = new ThemeService(db);
  ipcMain.handle(IPC.themeList, () => themes.list());
  ipcMain.handle(IPC.themeSave, (_event, input: ThemeInput) => themes.save(input));
  ipcMain.handle(IPC.themeRemove, (_event, id: string) => themes.remove(String(id)));
  ipcMain.handle(IPC.themeAssignment, () => themes.assignment());
  ipcMain.handle(IPC.themeAssign, (_event, assignment: ThemeAssignment) => themes.assign(assignment));

  const timers = new TimerService(db);
  ipcMain.handle(IPC.timerList, () => timers.list());
  ipcMain.handle(IPC.timerSave, (_event, input: TimerInput) => timers.save(input));
  ipcMain.handle(IPC.timerRemove, (_event, id: number) => timers.remove(Number(id)));

  const shortcuts = new ShortcutService(db, bible, songs, media);
  ipcMain.handle(IPC.shortcutList, () => shortcuts.list());
  ipcMain.handle(IPC.shortcutAdd, (_event, ref: string) => shortcuts.add(String(ref)));
  ipcMain.handle(IPC.shortcutRemove, (_event, id: number) => shortcuts.remove(Number(id)));
  ipcMain.handle(IPC.shortcutReorder, (_event, ids: number[]) => shortcuts.reorder(ids.map(Number)));

  const control = new LanControl({
    db,
    getState: () => store.current,
    dispatch: (input) => {
      const action = parseAction(input);
      if (action) store.dispatch(action);
    },
    methods: {
      'bible.list': () => bible.list(),
      'bible.books': (code) => bible.books(String(code)),
      'bible.chapter': (code, book, chapter) => bible.chapter(String(code), Number(book), Number(chapter)),
      'bible.search': (code, query) => bible.search(String(code), String(query)),
      'songs.list': (query) => songs.list(String(query ?? '')),
      'songs.get': (id) => songs.get(Number(id)),
      'media.list': () => media.list(),
      'shortcuts.list': () => shortcuts.list(),
      'themes.list': () => themes.list(),
      'themes.assignment': () => themes.assignment(),
    },
    onChange: () => broadcast(IPC.lanInfoChanged, lan.info),
  });
  const lan = new LanServer({
    db,
    control,
    folder: join(__dirname, '../lan'),
    rendererFolder: join(__dirname, '../renderer'),
    apk: app.isPackaged
      ? join(process.resourcesPath, 'ceflirics-control.apk')
      : join(app.getAppPath(), 'resources/ceflirics-control.apk'),
    getState: () => store.current,
    serveMedia: (request) => media.serve(request),
    onChange: (info) => broadcast(IPC.lanInfoChanged, info),
  });
  store.subscribe((state) => lan.broadcast(state));
  app.on('will-quit', () => lan.stop());
  ipcMain.handle(IPC.lanInfo, () => lan.info);
  ipcMain.on(IPC.lanSetPort, (_event, input: unknown) => {
    const port = parsePort(input);
    if (port) lan.setPort(port);
  });
  ipcMain.on(IPC.lanSetEnabled, (_event, enabled: unknown) => lan.setEnabled(enabled === true));
  ipcMain.on(IPC.lanSetSound, (_event, sound: unknown) => lan.setSound(sound === true));
  ipcMain.on(IPC.lanRenewPin, () => lan.renewPin());
  lan.start();

  ipcMain.handle(IPC.getOutputInfo, () => output.info);
  ipcMain.on(IPC.toggleOutput, () => output.toggle());

  const operator = createOperatorWindow();
  handleShortcuts(operator.webContents);
  // La salida sola no sirve: al cerrar el operador se cierra todo.
  operator.on('closed', () => output.close());
  output.openIfExternalDisplay();
});

app.on('window-all-closed', () => app.quit());
