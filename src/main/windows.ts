import { join } from 'node:path';
import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Display } from 'electron';
import type { OutputInfo } from '@shared/api';
import icon from '../../assets/icono.png?asset';

type Page = 'operator' | 'output';

const WINDOWED_OUTPUT = { width: 1280, height: 720 };

function baseOptions(): BrowserWindowConstructorOptions {
  return {
    show: false,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Los videos arrancan con sonido sin esperar un clic en la ventana de salida.
      autoplayPolicy: 'no-user-gesture-required',
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
  // Se recuerda dónde se abrió: isFullScreen() tarda en ser cierto, sobre todo en una PC cargada.
  private onExternalDisplay = false;

  constructor(
    private onChange: (info: OutputInfo) => void,
    private onCreated: (window: BrowserWindow) => void,
  ) {
    screen.on('display-added', () => this.syncWithDisplays());
    screen.on('display-removed', () => this.syncWithDisplays());
    screen.on('display-metrics-changed', () => this.fitToDisplay());
  }

  get info(): OutputInfo {
    const [width, height] = this.window?.getContentSize() ?? [0, 0];
    const scale = this.window ? screen.getDisplayMatching(this.window.getBounds()).scaleFactor : 1;
    return {
      open: !!this.window,
      fullscreen: !!this.window && this.onExternalDisplay,
      displays: screen.getAllDisplays().length,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
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
      webPreferences: { ...baseOptions().webPreferences, backgroundThrottling: false },
    });
    this.window = window;
    this.onExternalDisplay = !!display;
    this.onCreated(window);
    window.once('ready-to-show', () => {
      window.showInactive();
      this.onChange(this.info);
    });
    window.on('resize', () => this.onChange(this.info));
    window.on('closed', () => {
      this.window = null;
      this.onChange(this.info);
    });
    loadPage(window, 'output');
  }

  // Cambiar la resolución de la tele no mueve las ventanas: la salida se vuelve a acomodar.
  private fitToDisplay() {
    const { window } = this;
    const display = externalDisplay();
    if (window && this.onExternalDisplay && display) {
      const now = window.getBounds();
      const { x, y, width, height } = display.bounds;
      // Este aviso también llega por cosas como mover la barra de tareas: ahí no hay nada que hacer.
      if (now.x !== x || now.y !== y || now.width !== width || now.height !== height) {
        window.setFullScreen(false);
        window.setBounds(display.bounds);
        window.setFullScreen(true);
      }
    }
    this.onChange(this.info);
  }

  // Si se desconecta el monitor se cierra la salida; al volver, se abre sola.
  private syncWithDisplays() {
    const display = externalDisplay();
    if (this.window && this.onExternalDisplay && !display) this.close();
    else if (!this.window && display) this.open(display);
    this.onChange(this.info);
  }
}
