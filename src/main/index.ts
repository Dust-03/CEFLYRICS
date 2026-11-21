import { copyFileSync, createWriteStream, existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BrowserWindow, Menu, app, dialog, ipcMain, nativeImage, protocol, type WebContents } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  IPC,
  type AppInfo,
  type BibleImportInput,
  type SongInput,
  type ThemeAssignment,
  type ThemeInput,
  type TimerInput,
  type UpdateCheck,
} from '@shared/api';
import { parsePort } from '@shared/lan';
import { parseAction, type Action } from '@shared/state';
import { createTimerRun, remainingMs } from '@shared/timers';
import { BackupService } from './backup';
import { BIBLE_EXTENSIONS, BibleImporter } from './bible/import';
import { BibleService } from './bible/service';
import { openDatabase } from './db/database';
import { LanControl } from './lan-control';
import { LanServer } from './lan-server';
import { MEDIA_EXTENSIONS, MEDIA_SCHEME, MediaService } from './media';
import { ShortcutService } from './shortcuts';
import { SONG_EXTENSIONS, SongImporter } from './song-import';
import { SongService } from './songs';
import { OnAirStore } from './store';
import { ThemeService } from './themes';
import { TimerService } from './timers';
import { OutputWindow, TITLE_BAR, createOperatorWindow } from './windows';

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
function toggleFullscreen(contents: WebContents) {
  const window = BrowserWindow.fromWebContents(contents);
  window?.setFullScreen(!window.isFullScreen());
}

// Devuelve la búsqueda manual; sin instalar (desarrollo, pruebas) no hay nada que buscar.
function configureAutoUpdates(operator: BrowserWindow): (() => Promise<UpdateCheck>) | undefined {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  let promptOpen = false;
  // El avance se ve en el ícono de la barra de tareas y en la consola, junto a la versión.
  const progress = (percent: number | null) => {
    operator.setProgressBar(percent === null ? -1 : percent / 100);
    operator.webContents.send(IPC.updateProgress, percent);
  };

  autoUpdater.on('update-available', async (info) => {
    if (promptOpen) return;
    promptOpen = true;
    let choice: Awaited<ReturnType<typeof dialog.showMessageBox>>;
    try {
      choice = await dialog.showMessageBox(operator, {
        type: 'info',
        title: 'Actualización disponible',
        message: `Hay una nueva versión de CEFLYRICS (${info.version}).`,
        detail: '¿Querés descargarla ahora? La versión actual seguirá funcionando mientras se descarga.',
        buttons: ['Descargar', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
      });
    } catch {
      return;
    } finally {
      promptOpen = false;
    }
    if (choice.response !== 0) return;
    try {
      progress(0);
      await autoUpdater.downloadUpdate();
    } catch {
      progress(null);
      if (!promptOpen) {
        promptOpen = true;
        try {
          await dialog.showMessageBox(operator, {
            type: 'warning',
            title: 'No se pudo descargar',
            message: 'No se pudo descargar la actualización. Podés intentarlo de nuevo más tarde.',
            buttons: ['Aceptar'],
          });
        } finally {
          promptOpen = false;
        }
      }
    }
  });

  autoUpdater.on('download-progress', ({ percent }) => progress(percent));
  autoUpdater.on('error', () => progress(null));

  autoUpdater.on('update-downloaded', async (info) => {
    progress(null);
    if (promptOpen) return;
    promptOpen = true;
    try {
      const { response } = await dialog.showMessageBox(operator, {
        type: 'info',
        title: 'Actualización descargada',
        message: `CEFLYRICS ${info.version} está lista para instalar.`,
        detail: 'Podés reiniciar ahora o instalarla al cerrar el programa.',
        buttons: ['Reiniciar e instalar', 'Instalar al cerrar'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) autoUpdater.quitAndInstall(false, true);
      else autoUpdater.autoInstallOnAppQuit = true;
    } finally {
      promptOpen = false;
    }
  });

  let checking = false;
  const check = () => {
    if (checking) return;
    checking = true;
    void autoUpdater
      .checkForUpdates()
      .catch(() => undefined)
      .finally(() => (checking = false));
  };
  const initialCheck = setTimeout(check, 8_000);
  initialCheck.unref();
  const periodicCheck = setInterval(check, 6 * 60 * 60 * 1_000);
  periodicCheck.unref();

  // Si hay una versión nueva, el aviso de 'update-available' ofrece descargarla.
  return async () => {
    const result = await autoUpdater.checkForUpdates().catch(() => null);
    if (!result) return 'error';
    return result.isUpdateAvailable ? 'available' : 'latest';
  };
}

function handleShortcuts(contents: WebContents, canChangeSize: () => boolean = () => true) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    if (input.key === 'F11') {
      event.preventDefault();
      if (canChangeSize()) toggleFullscreen(contents);
      return;
    }
    const action = SHORTCUTS[input.key];
    if (!action) return;
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

  const dbFile = join(app.getPath('userData'), 'ceflyrics.db');
  // La primera vez se parte de la base de fábrica, que ya trae las biblias y su índice.
  const factoryDb = app.isPackaged
    ? join(process.resourcesPath, 'bibles.db')
    : join(app.getAppPath(), 'resources/bibles.db');
  if (!existsSync(dbFile) && existsSync(factoryDb)) copyFileSync(factoryDb, dbFile);
  const db = openDatabase(dbFile);
  app.on('will-quit', () => db.close());

  const output = new OutputWindow(
    (info) => broadcast(IPC.outputInfoChanged, info),
    // En el segundo monitor la salida siempre ocupa toda la pantalla.
    (window) => handleShortcuts(window.webContents, () => !output.info.fullscreen),
  );

  store.subscribe((state) => broadcast(IPC.stateChanged, state));

  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({
    name: 'CEFLYRICS',
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
  ipcMain.handle(IPC.bibleChapterVerseIds, (_event, code: string, book: number, chapter: number) =>
    bible.chapterVerseIds(String(code), Number(book), Number(chapter)),
  );
  ipcMain.handle(IPC.bibleVerse, (_event, code: string, vid: number) => bible.verse(String(code), Number(vid)));
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
    if (canceled) return { added: 0, rejected: [] };
    const result = await media.add(filePaths);
    control.notify('media');
    return result;
  });
  ipcMain.handle(IPC.mediaRemove, async (_event, id: number) => {
    await media.remove(Number(id));
    control.notify('media');
  });
  // Lo que suben los celulares: la PC y los demás celulares tienen que verlo enseguida.
  const uploadMedia = async (name: string, body: NodeJS.ReadableStream) => {
    const folder = await mkdtemp(join(app.getPath('userData'), 'subida-'));
    try {
      const file = join(folder, name);
      await pipeline(body, createWriteStream(file));
      const result = await media.add([file]);
      if (result.added) {
        broadcast(IPC.mediaChanged, null);
        control.notify('media');
      }
      return result;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  };

  const themes = new ThemeService(db);
  ipcMain.handle(IPC.themeList, () => themes.list());
  ipcMain.handle(IPC.themeSave, (_event, input: ThemeInput) => themes.save(input));
  ipcMain.handle(IPC.themeRemove, (_event, id: string) => themes.remove(String(id)));
  ipcMain.handle(IPC.themeAssignment, () => themes.assignment());
  ipcMain.handle(IPC.themeAssign, (_event, assignment: ThemeAssignment) => themes.assign(assignment));

  const timers = new TimerService(db);
  ipcMain.handle(IPC.timerList, () => timers.list());
  // Los temporizadores también se manejan desde los celulares, con la hora de esta PC: el reloj del
  // teléfono puede estar corrido.
  const timersChanged = () => {
    broadcast(IPC.timersChanged, null);
    control.notify('timers');
  };
  const saveTimer = (input: TimerInput) => {
    const id = timers.save(input);
    timersChanged();
    return id;
  };
  const runOf = (id: unknown) => store.current.timers.find((run) => run.id === String(id));
  const startTimer = (id: unknown) => {
    const moment = Date.now();
    const paused = runOf(id);
    if (paused && paused.endsAt === null) {
      store.dispatch({ type: 'timer-run', run: { ...paused, endsAt: moment + paused.remainingMs } });
      return;
    }
    const config = timers.list().find((timer) => timer.id === Number(id));
    const theme = themes.list().find((entry) => entry.id === themes.assignment().song)?.theme;
    const run = config && createTimerRun(config, moment, theme);
    if (run) store.dispatch({ type: 'timer-run', run });
  };
  const pauseTimer = (id: unknown) => {
    const run = runOf(id);
    const remaining = run && remainingMs(run, Date.now());
    if (run) store.dispatch({ type: 'timer-run', run: { ...run, endsAt: null, remainingMs: remaining! } });
  };
  const toggleTimerShow = (id: unknown, input: unknown) => {
    const layout = input === 'full' ? 'full' : 'corner';
    const { shownTimer } = store.current;
    if (shownTimer?.id === String(id) && shownTimer.layout === layout) {
      store.dispatch({ type: 'timer-hide' });
      return;
    }
    if (!runOf(id)) startTimer(id);
    store.dispatch({ type: 'timer-show', id: String(id), layout });
  };
  ipcMain.handle(IPC.timerSave, (_event, input: TimerInput) => saveTimer(input));
  ipcMain.handle(IPC.timerRemove, (_event, id: number) => {
    timers.remove(Number(id));
    timersChanged();
  });

  const shortcuts = new ShortcutService(db, bible, songs, media);
  ipcMain.handle(IPC.shortcutList, () => shortcuts.list());
  // Los atajos se tocan desde la PC y desde los celulares: todos tienen que quedar al día.
  const shortcutsChanged = () => {
    broadcast(IPC.shortcutsChanged, null);
    control.notify('shortcuts');
  };
  const addShortcut = (ref: unknown) => {
    shortcuts.add(String(ref));
    shortcutsChanged();
  };
  const removeShortcut = (id: unknown) => {
    shortcuts.remove(Number(id));
    shortcutsChanged();
  };
  ipcMain.handle(IPC.shortcutAdd, (_event, ref: string) => addShortcut(ref));
  ipcMain.handle(IPC.shortcutRemove, (_event, id: number) => removeShortcut(id));
  const reorderShortcuts = (ids: unknown) => {
    if (!Array.isArray(ids)) return;
    shortcuts.reorder(ids.map(Number));
    shortcutsChanged();
  };
  ipcMain.handle(IPC.shortcutReorder, (_event, ids: number[]) => reorderShortcuts(ids));

  const backup = new BackupService(db, join(app.getPath('userData'), 'media'));
  const DATA_FILTER = { name: 'Datos de CEFLYRICS', extensions: ['ceflyrics'] };
  const guarded = async <T>(action: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await action();
    } catch (error) {
      return { error: (error as Error).message };
    }
  };
  ipcMain.handle(IPC.dataExport, () =>
    guarded(async () => {
      const date = new Date().toLocaleDateString('sv');
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Exportar datos',
        defaultPath: `CEFLYRICS-datos-${date}.ceflyrics`,
        filters: [DATA_FILTER],
      });
      return canceled || !filePath ? { canceled: true as const } : { counts: await backup.export(filePath) };
    }),
  );
  ipcMain.handle(IPC.dataImport, () =>
    guarded(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Importar datos',
        properties: ['openFile'],
        filters: [DATA_FILTER],
      });
      if (canceled || !filePaths[0]) return { canceled: true as const };
      const counts = await backup.import(filePaths[0]);
      shortcutsChanged();
      timersChanged();
      return { counts };
    }),
  );

  const songImporter = new SongImporter(songs);
  const bibleImporter = new BibleImporter(db);
  const pickFiles = async (title: string, name: string, extensions: string[]) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name, extensions }],
    });
    return canceled ? [] : filePaths;
  };
  ipcMain.handle(IPC.dataImportSongs, () =>
    guarded(async () => {
      const files = await pickFiles('Importar canciones', 'Canciones (TXT, OpenLyrics y Holyrics)', SONG_EXTENSIONS);
      return files.length ? songImporter.import(files) : { canceled: true as const };
    }),
  );
  ipcMain.handle(IPC.dataExportSongs, () =>
    guarded(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Elegí la carpeta para las canciones',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (canceled || !filePaths[0]) return { canceled: true as const };
      return { count: await songImporter.export(filePaths[0]) };
    }),
  );
  ipcMain.handle(IPC.dataImportBible, (_event, input: BibleImportInput) =>
    guarded(async () => {
      const files = await pickFiles('Importar Biblia', 'Biblia (XML y USFM)', BIBLE_EXTENSIONS);
      return files.length ? bibleImporter.import(files, input) : { canceled: true as const };
    }),
  );
  ipcMain.handle(IPC.dataRemoveBible, (_event, code: string) => bibleImporter.remove(String(code)));

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
      'bible.chapter-verse-ids': (code, book, chapter) =>
        bible.chapterVerseIds(String(code), Number(book), Number(chapter)),
      'bible.verse': (code, vid) => bible.verse(String(code), Number(vid)),
      'bible.search': (code, query) => bible.search(String(code), String(query)),
      'songs.list': (query) => songs.list(String(query ?? '')),
      'songs.get': (id) => songs.get(Number(id)),
      'media.list': () => media.list(),
      'shortcuts.list': () => shortcuts.list(),
      'shortcuts.add': addShortcut,
      'shortcuts.remove': removeShortcut,
      'shortcuts.reorder': reorderShortcuts,
      'timers.list': () => timers.list(),
      'timers.save': (input) => saveTimer(input as TimerInput),
      'timers.start': startTimer,
      'timers.pause': pauseTimer,
      'timers.show': toggleTimerShow,
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
      ? join(process.resourcesPath, 'ceflyrics-control.apk')
      : join(app.getAppPath(), 'resources/ceflyrics-control.apk'),
    getState: () => store.current,
    serveMedia: (request) => media.serve(request),
    addMedia: uploadMedia,
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
  ipcMain.on(IPC.lanUnlink, (_event, id: unknown) => lan.unlink(Number(id)));
  lan.start();

  ipcMain.handle(IPC.getOutputInfo, () => output.info);
  ipcMain.on(IPC.toggleOutput, () => output.toggle());
  ipcMain.on(IPC.toggleFullscreen, (event) => toggleFullscreen(event.sender));
  ipcMain.on(IPC.setTitleBarTheme, (event, theme: unknown) => {
    const colors = theme === 'light' ? TITLE_BAR.light : TITLE_BAR.dark;
    BrowserWindow.fromWebContents(event.sender)?.setTitleBarOverlay({ ...colors, height: TITLE_BAR.height });
  });

  const operator = createOperatorWindow();
  const checkUpdates = configureAutoUpdates(operator);
  ipcMain.handle(IPC.checkUpdates, (): Promise<UpdateCheck> | UpdateCheck => checkUpdates?.() ?? 'dev');
  handleShortcuts(operator.webContents);
  // La salida sola no sirve: al cerrar el operador se cierra todo.
  operator.on('closed', () => output.close());
  output.openIfExternalDisplay();
});

app.on('window-all-closed', () => app.quit());
