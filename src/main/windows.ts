import { join } from 'node:path';
import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Display } from 'electron';
import type { OutputInfo } from '@shared/api';

type Page = 'operator' | 'output';

const WINDOWED_OUTPUT = { width: 1280, height: 720 };

function baseOptions(): BrowserWindowConstructorOptions {
  return {
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

function loadPage(window: BrowserWindow, page: Page) {
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer) return window.loadURL(`${devServer}/${page}/index.html`);
  return window.loadFile(join(__dirname, `../renderer/${page}/index.html`));
}

export function createOperatorWindow() {
  const window = new BrowserWindow({
    ...baseOptions(),
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'CEFLIRICS',
    backgroundColor: '#0e1320',
  });
  window.once('ready-to-show', () => window.show());
  loadPage(window, 'operator');
  return window;
}

// El monitor de salida es cualquiera que no sea el principal, donde está el operador.
function externalDisplay(): Display | undefined {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().find((display) => display.id !== primary.id);
}

export class OutputWindow {
  private window: BrowserWindow | null = null;

  constructor(
    private onChange: (info: OutputInfo) => void,
    private onCreated: (window: BrowserWindow) => void,
  ) {
    screen.on('display-added', () => this.syncWithDisplays());
    screen.on('display-removed', () => this.syncWithDisplays());
  }

  get info(): OutputInfo {
    return {
      open: !!this.window,
      fullscreen: !!this.window?.isFullScreen(),
      displays: screen.getAllDisplays().length,
    };
  }

  // Con un segundo monitor la salida se abre sola; con uno, recién cuando se pide.
  openIfExternalDisplay() {
    if (process.env.CEF_OUTPUT === 'window') this.open(undefined);
    else if (externalDisplay()) this.open(externalDisplay());
  }

  toggle() {
    if (this.window) this.close();
    else this.open(externalDisplay());
  }

  close() {
    this.window?.close();
  }

  private open(display: Display | undefined) {
    if (this.window) return;
    // Sin monitor externo va en ventana, para no tapar la consola del operador.
    const bounds = display?.bounds ?? WINDOWED_OUTPUT;
    const window = new BrowserWindow({
      ...baseOptions(),
      ...bounds,
      title: 'CEFLIRICS · Salida',
      backgroundColor: '#000000',
      useContentSize: !display,
      frame: !display,
      fullscreen: !!display,
      autoHideMenuBar: true,
    });
    this.window = window;
    this.onCreated(window);
    window.once('ready-to-show', () => {
      window.showInactive();
      this.onChange(this.info);
    });
    window.on('closed', () => {
      this.window = null;
      this.onChange(this.info);
    });
    loadPage(window, 'output');
  }

  // Si se desconecta el monitor se cierra la salida; al volver, se abre sola.
  private syncWithDisplays() {
    const display = externalDisplay();
    if (this.window?.isFullScreen() && !display) this.close();
    else if (!this.window && display) this.open(display);
    this.onChange(this.info);
  }
}
