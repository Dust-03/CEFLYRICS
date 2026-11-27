import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebStream } from 'node:stream/web';
import { WebSocket, WebSocketServer } from 'ws';
import {
  DEFAULT_LAN_PORT,
  deviceName,
  listAddresses,
  parsePort,
  type LanAddress,
  type LanInfo,
  type LanScreen,
  type LanStatus,
} from '@shared/lan';
import type { DataCounts, MediaAddResult } from '@shared/api';
import type { OnAirState } from '@shared/state';
import type { Db } from './db/database';
import { MEDIA_TICKET_MS, type LanControl } from './lan-control';
import { MEDIA_EXTENSIONS } from './media';
import { readSetting, writeSetting } from './settings';

const PORT_KEY = 'lan.port';
const ENABLED_KEY = 'lan.enabled';
const LAST_IP_KEY = 'lan.lastIp';
const SOUND_KEY = 'lan.sound';

const RETRY_MS = 5000;
const TICK_MS = 5000;
const SILENT_MS = 20_000;
const MAX_SCREENS = 32;
const MAX_BODY = 200;

// El puerto que los navegadores usan si no se pone ninguno: con él, en la tele alcanza con la IP. Con 0
// no se usa.
const PLAIN_PORT = Number(process.env.CEF_LAN_PLAIN_PORT ?? 80);

// Sin módulos ni nada moderno: tiene que abrir en el navegador de un televisor viejo.
const PAGE = `<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CEFLYRICS</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #000; cursor: none; }
      #aviso { position: fixed; left: 20px; bottom: 20px; padding: 0.6em 1em; font: bold 24px sans-serif;
        font-size: 2vw; color: #fff; background: #000; background: rgba(0, 0, 0, 0.7); border-radius: 0.5em; }
      #aviso:empty { display: none; }
    </style>
  </head>
  <body>
    <div id="stage"></div>
    <div id="aviso">Conectando…</div>
    <noscript><p style="color: #fff">El navegador de esta tele tiene JavaScript apagado.</p></noscript>
    <script>
      // Si algo falla en una tele vieja se ve qué fue, en vez de una pantalla vacía.
      window.onerror = function (message, file, line) {
        document.getElementById('aviso').innerText = message + ' (' + line + ') ' + navigator.userAgent;
      };
    </script>
    <script src="/pantalla.js"></script>
  </body>
</html>
`;

const FILES: Record<string, string> = {
  '/pantalla.js': 'text/javascript; charset=utf-8',
  '/pantalla.css': 'text/css; charset=utf-8',
};

// Lo que compila la pantalla del control.
const ASSET_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

type Client = LanScreen & { seenAt: number };
type Listener = { server: Server; sockets: WebSocketServer };

type LanOptions = {
  db: Db;
  control: LanControl;
  // Carpeta con lo que arma la compilación de src/renderer/lan.
  folder: string;
  // Carpeta de la consola, donde también queda la pantalla del control.
  rendererFolder: string;
  apk: string;
  getState: () => OnAirState;
  serveMedia: (request: Request) => Promise<Response>;
  // Guarda en la biblioteca una foto o un video que mandó un celular vinculado.
  addMedia: (name: string, body: IncomingMessage) => Promise<MediaAddResult>;
  // Exportar e importar todo, cuando la PC ya lo autorizó.
  exportData: (target: string) => Promise<DataCounts>;
  importData: (source: string) => Promise<DataCounts>;
  onChange: (info: LanInfo) => void;
};

// La tele pide por http: el protocolo cef-media solo existe adentro de la app.
function toMessage(state: OnAirState) {
  return JSON.stringify({ t: 'state', state }).split('cef-media://media/').join('/media/');
}

// Desde el celular solo entran fotos y videos, con un nombre que Windows acepte.
function uploadName(header: unknown) {
  let name: string;
  try {
    name = decodeURIComponent(String(header ?? ''));
  } catch {
    return null;
  }
  name = basename(name.replaceAll('\\', '/'))
    // eslint-disable-next-line no-control-regex -- los caracteres de control no van en un nombre de archivo
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .slice(-120);
  return MEDIA_EXTENSIONS.includes(extname(name).slice(1).toLowerCase()) ? name : null;
}

function addressOf(request: IncomingMessage) {
  return (request.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}

// Sirve lo que está al aire a las pantallas de la red. Solo se lee: desde afuera no se cambia nada.
export class LanServer {
  private main: Listener | null = null;
  private plain: Listener | null = null;
  private clients = new Map<WebSocket, Client>();
  // Las teles sin WebSocket, que preguntan por HTTP.
  private polled = new Map<string, Client>();
  private status: LanStatus = 'off';
  private port: number;
  private addresses: LanAddress[] = [];
  private retry?: ReturnType<typeof setTimeout>;
  private ticker?: ReturnType<typeof setInterval>;
  private nextId = 1;
  // En memoria: al cerrar la app las pantallas se desconectan con la base ya cerrada.
  private lastIp: string | null;
  private sound: boolean;

  constructor(private options: LanOptions) {
    this.lastIp = readSetting<string>(options.db, LAST_IP_KEY) ?? null;
    this.sound = readSetting(options.db, SOUND_KEY) === true;
    // Una vez elegido, el puerto no cambia solo: si está ocupado se espera a que se libere.
    this.port = parsePort(process.env.CEF_LAN_PORT) ?? parsePort(readSetting(options.db, PORT_KEY)) ?? DEFAULT_LAN_PORT;
  }

  get info(): LanInfo {
    const { lastIp } = this;
    const moved = !!lastIp && this.addresses.length > 0 && !this.addresses.some(({ ip }) => ip === lastIp);
    return {
      status: this.status,
      port: this.port,
      publicPort: this.plain?.server.listening ? PLAIN_PORT : this.port,
      addresses: this.addresses,
      previousIp: moved ? lastIp : null,
      sound: this.sound,
      pin: this.options.control.pin,
      devices: this.options.control.list,
      apk: existsSync(this.options.apk),
      screens: [...this.clients.values(), ...this.polled.values()].map(({ id, ip, device, width, height }) => ({
        id,
        ip,
        device,
        width,
        height,
      })),
    };
  }

  start() {
    this.refreshAddresses();
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    if (readSetting(this.options.db, ENABLED_KEY) !== false) this.listen();
    else this.notify();
  }

  async stop() {
    clearInterval(this.ticker);
    await this.close();
  }

  async setPort(port: number) {
    if (port === this.port) return;
    writeSetting(this.options.db, PORT_KEY, port);
    this.port = port;
    if (this.status === 'off') {
      this.notify();
      return;
    }
    await this.close();
    this.listen();
  }

  async setEnabled(enabled: boolean) {
    writeSetting(this.options.db, ENABLED_KEY, enabled);
    await this.close();
    if (enabled) this.listen();
    else this.notify();
  }

  setSound(sound: boolean) {
    writeSetting(this.options.db, SOUND_KEY, sound);
    this.sound = sound;
    const message = this.soundMessage();
    for (const socket of this.clients.keys()) socket.send(message);
    this.notify();
  }

  renewPin() {
    this.options.control.renewPin();
    this.notify();
  }

  unlink(id: number) {
    this.options.control.unlink(id);
  }

  private soundMessage() {
    return JSON.stringify({ t: 'sound', on: this.sound });
  }

  broadcast(state: OnAirState) {
    const message = toMessage(state);
    for (const socket of this.clients.keys()) socket.send(message);
    this.options.control.broadcast(state);
  }

  private notify() {
    this.options.onChange(this.info);
  }

  private open(onError: () => void): Listener {
    const server = createServer((request, response) => {
      this.handle(request, response).catch(() => response.destroy());
    });
    // Node corta a los 5 minutos: un video por un Wi-Fi flojo puede tardar tanto como dura su permiso.
    server.requestTimeout = MEDIA_TICKET_MS;
    const sockets = new WebSocketServer({
      server,
      maxPayload: 65_536,
      verifyClient: ({ req }: { req: IncomingMessage }) =>
        req.url === '/ws' || (req.url === '/control-ws' && this.options.control.isSameOrigin(req)),
    });
    sockets.on('connection', (socket, request) => {
      if (request.url === '/ws') this.accept(socket, request);
      else this.options.control.accept(socket, addressOf(request));
    });
    // ws repite acá los errores del servidor: puerto ocupado, o reservado por Windows.
    sockets.on('error', onError);
    return { server, sockets };
  }

  private listen() {
    this.main = this.open(() => {
      this.main = null;
      this.status = 'busy';
      this.notify();
      this.retry = setTimeout(() => this.listen(), RETRY_MS);
    });
    this.main.server.listen(this.port, '0.0.0.0', () => {
      this.status = 'on';
      this.notify();
      this.listenPlain();
    });
  }

  // Si el 80 lo tiene otro programa (Holyrics también lo usa) no es un error: queda la dirección con
  // puerto, y se vuelve a probar cada tanto.
  private listenPlain() {
    if (!PLAIN_PORT || this.plain || this.status !== 'on') return;
    const plain = this.open(() => {
      if (this.plain === plain) this.plain = null;
    });
    this.plain = plain;
    plain.server.listen(PLAIN_PORT, '0.0.0.0', () => this.notify());
  }

  private async close() {
    clearTimeout(this.retry);
    const listeners = [this.main, this.plain];
    this.main = null;
    this.plain = null;
    this.status = 'off';
    for (const socket of this.clients.keys()) socket.terminate();
    this.clients.clear();
    this.polled.clear();
    this.options.control.closeAll();
    await Promise.all(
      listeners.map((listener) => {
        listener?.sockets.close();
        if (!listener?.server.listening) return;
        return new Promise((resolve) => {
          listener.server.close(resolve);
          listener.server.closeAllConnections();
        });
      }),
    );
  }

  private get full() {
    return this.clients.size + this.polled.size >= MAX_SCREENS;
  }

  private newClient(request: IncomingMessage): Client {
    // La IP que escribieron en la tele es la que hay que seguir ofreciendo.
    const host = (request.headers.host ?? '').replace(/:\d+$/, '');
    if (host !== this.lastIp && this.addresses.some(({ ip }) => ip === host)) {
      this.lastIp = host;
      writeSetting(this.options.db, LAST_IP_KEY, host);
    }
    return {
      id: this.nextId++,
      ip: addressOf(request),
      device: deviceName(request.headers['user-agent'] ?? ''),
      width: 0,
      height: 0,
      seenAt: Date.now(),
    };
  }

  // Lo mismo que se manda por WebSocket, para la tele que no lo tiene.
  private poll(request: IncomingMessage, response: ServerResponse) {
    const key = `${addressOf(request)} ${request.headers['user-agent']}`;
    let client = this.polled.get(key);
    if (!client) {
      if (this.full) {
        response.writeHead(503).end();
        return;
      }
      client = this.newClient(request);
      this.polled.set(key, client);
      this.notify();
    }
    client.seenAt = Date.now();
    const query = new URL(request.url ?? '/', 'http://lan').searchParams;
    const number = (name: string) => Math.round(Number(query.get(name))) || 0;
    const [width, height] = [number('w'), number('h')];
    if (width !== client.width || height !== client.height) {
      Object.assign(client, { width, height });
      this.notify();
    }
    const pong = JSON.stringify({ t: 'pong', c: number('t'), s: Date.now() });
    response
      .writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(`[${this.soundMessage()},${toMessage(this.options.getState())},${pong}]`);
  }

  private accept(socket: WebSocket, request: IncomingMessage) {
    if (this.full) {
      socket.close();
      return;
    }
    const client = this.newClient(request);
    this.clients.set(socket, client);
    socket.on('message', (data) => this.receive(socket, client, String(data)));
    socket.on('close', () => {
      if (this.clients.delete(socket)) this.notify();
    });
    socket.on('error', () => socket.terminate());
    // Primero el sonido: el video que esté al aire tiene que arrancar ya como corresponde.
    socket.send(this.soundMessage());
    socket.send(toMessage(this.options.getState()));
    this.notify();
  }

  private receive(socket: WebSocket, client: Client, data: string) {
    client.seenAt = Date.now();
    let message: { t?: unknown; c?: unknown; w?: unknown; h?: unknown } | null;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message?.t === 'ping' && typeof message.c === 'number') {
      socket.send(JSON.stringify({ t: 'pong', c: message.c, s: Date.now() }));
    } else if (message?.t === 'size' && typeof message.w === 'number' && typeof message.h === 'number') {
      client.width = Math.round(message.w);
      client.height = Math.round(message.h);
      this.notify();
    }
  }

  private tick() {
    // Una tele que se apaga de golpe no avisa: deja de hablar.
    const limit = Date.now() - SILENT_MS;
    for (const [socket, client] of this.clients) if (client.seenAt < limit) socket.terminate();
    for (const [key, client] of this.polled) if (client.seenAt < limit && this.polled.delete(key)) this.notify();
    this.refreshAddresses();
    this.listenPlain();
  }

  private refreshAddresses() {
    const addresses = listAddresses(networkInterfaces());
    if (JSON.stringify(addresses) === JSON.stringify(this.addresses)) return;
    this.addresses = addresses;
    this.notify();
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const path = (request.url ?? '/').split('?')[0];
    if (request.method === 'POST' && path === '/api/vincular') {
      await this.pair(request, response);
      return;
    }
    if (request.method === 'POST' && path === '/api/medios') {
      await this.upload(request, response);
      return;
    }
    if (request.method === 'POST' && path === '/api/datos/importar') {
      await this.importData(request, response);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    if (path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).end(PAGE);
    } else if (FILES[path]) {
      const data = await readFile(join(this.options.folder, path));
      response.writeHead(200, { 'Content-Type': FILES[path], 'Cache-Control': 'no-cache' }).end(data);
    } else if (path.startsWith('/media/')) {
      await this.sendMedia(path.slice('/media/'.length), request, response);
    } else if (path === '/api/pantalla') {
      this.poll(request, response);
    } else if (path === '/api/ceflyrics') {
      // Con esto la app del celular reconoce a la PC en la red.
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"app":"ceflyrics"}');
    } else if (path === '/control') {
      response.writeHead(302, { Location: '/control/' }).end();
    } else if (path === '/control/') {
      await this.sendRendererFile('control/index.html', 'text/html; charset=utf-8', response);
    } else if (/^\/assets\/[\w.-]+$/.test(path) && ASSET_TYPES[extname(path)]) {
      await this.sendRendererFile(path.slice(1), ASSET_TYPES[extname(path)], response);
    } else if (path === '/api/datos/exportar') {
      await this.exportData(request, response);
    } else if (path === '/app.apk' && existsSync(this.options.apk)) {
      await this.sendApk(response);
    } else {
      response.writeHead(404).end();
    }
  }

  private async pair(request: IncomingMessage, response: ServerResponse) {
    let body = '';
    for await (const chunk of request) {
      body += String(chunk);
      if (body.length > MAX_BODY) {
        response.writeHead(413).end();
        return;
      }
    }
    let input: { pin?: unknown; name?: unknown } | null = null;
    try {
      input = JSON.parse(body);
    } catch {
      // Sin datos válidos cuenta como un PIN equivocado.
    }
    const result = this.options.control.pair(addressOf(request), input?.pin, input?.name);
    const errors = { locked: 429, name: 400, pin: 403 };
    const status = 'token' in result ? 200 : errors[result.error];
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
  }

  private async upload(request: IncomingMessage, response: ServerResponse) {
    // Primero el nombre: un archivo rechazado no gasta el permiso que dio la PC.
    const { control } = this.options;
    const name = uploadName(request.headers['x-file-name']);
    if (!name) {
      response.writeHead(415, { Connection: 'close' }).end();
      return;
    }
    if (!control.isSameOrigin(request) || !control.useTicket(request.headers['x-ticket'], 'media')) {
      response.writeHead(403, { Connection: 'close' }).end();
      return;
    }
    const result = await this.options.addMedia(name, request);
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
  }

  // El ticket lo da la PC al autorizar, sirve una sola vez y no es el token del celular.
  private async exportData(request: IncomingMessage, response: ServerResponse) {
    const ticket = new URL(request.url ?? '/', 'http://lan').searchParams.get('ticket');
    if (!this.options.control.useTicket(ticket, 'export')) {
      response.writeHead(403).end();
      return;
    }
    const folder = await mkdtemp(join(tmpdir(), 'cef-exportar-'));
    try {
      const file = join(folder, 'datos.ceflyrics');
      await this.options.exportData(file);
      const date = new Date().toLocaleDateString('sv');
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': (await stat(file)).size,
        'Content-Disposition': `attachment; filename="CEFLYRICS-datos-${date}.ceflyrics"`,
      });
      await pipeline(createReadStream(file), response).catch(() => {});
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  private async importData(request: IncomingMessage, response: ServerResponse) {
    const { control } = this.options;
    if (!control.isSameOrigin(request) || !control.useTicket(request.headers['x-ticket'], 'import')) {
      response.writeHead(403, { Connection: 'close' }).end();
      return;
    }
    const folder = await mkdtemp(join(tmpdir(), 'cef-importar-'));
    try {
      const file = join(folder, 'datos.ceflyrics');
      await pipeline(request, createWriteStream(file));
      const counts = await this.options.importData(file);
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(counts));
    } catch (error) {
      response
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: (error as Error).message }));
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  private async sendRendererFile(name: string, type: string, response: ServerResponse) {
    const data = await readFile(join(this.options.rendererFolder, name)).catch(() => null);
    if (data) response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }).end(data);
    else response.writeHead(404).end();
  }

  private async sendApk(response: ServerResponse) {
    const { size } = await stat(this.options.apk);
    response.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': size,
      'Content-Disposition': 'attachment; filename="ceflyrics-control.apk"',
    });
    await pipeline(createReadStream(this.options.apk), response).catch(() => {});
  }

  private async sendMedia(name: string, request: IncomingMessage, response: ServerResponse) {
    const { range } = request.headers;
    const file = await this.options.serveMedia(
      new Request(`http://lan/${name}`, { headers: range ? { range } : undefined }),
    );
    response.writeHead(file.status, Object.fromEntries(file.headers));
    if (!file.body || request.method === 'HEAD') {
      await file.body?.cancel();
      response.end();
      return;
    }
    // La tele corta la descarga cada vez que salta en el video: no es un error.
    await pipeline(Readable.fromWeb(file.body as WebStream), response).catch(() => {});
  }
}
