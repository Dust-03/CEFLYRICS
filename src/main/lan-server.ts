import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
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
import type { OnAirState } from '@shared/state';
import type { Db } from './db/database';
import type { LanControl } from './lan-control';
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

// Sin módulos ni nada moderno: tiene que abrir en el navegador de un televisor viejo.
const PAGE = `<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CEFLIRICS</title>
    <link rel="stylesheet" href="/pantalla.css" />
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #000; cursor: none; }
      #aviso { position: fixed; left: 2vw; bottom: 2vw; padding: 0.6em 1em; font: 600 2vw sans-serif;
        color: #fff; background: rgba(0, 0, 0, 0.7); border-radius: 0.5em; }
      #aviso:empty { display: none; }
    </style>
  </head>
  <body>
    <div id="stage"></div>
    <div id="aviso"></div>
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
  onChange: (info: LanInfo) => void;
};

// La tele pide por http: el protocolo cef-media solo existe adentro de la app.
function toMessage(state: OnAirState) {
  return JSON.stringify({ t: 'state', state }).split('cef-media://media/').join('/media/');
}

function addressOf(request: IncomingMessage) {
  return (request.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}

// Sirve lo que está al aire a las pantallas de la red. Solo se lee: desde afuera no se cambia nada.
export class LanServer {
  private server: Server | null = null;
  private sockets: WebSocketServer | null = null;
  private clients = new Map<WebSocket, Client>();
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
      addresses: this.addresses,
      previousIp: moved ? lastIp : null,
      sound: this.sound,
      pin: this.options.control.pin,
      devices: this.options.control.list,
      apk: existsSync(this.options.apk),
      screens: [...this.clients.values()].map(({ id, ip, device, width, height }) => ({
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

  private listen() {
    const server = createServer((request, response) => {
      this.handle(request, response).catch(() => response.destroy());
    });
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
    sockets.on('error', () => {
      this.server = null;
      this.sockets = null;
      this.status = 'busy';
      this.notify();
      this.retry = setTimeout(() => this.listen(), RETRY_MS);
    });
    this.server = server;
    this.sockets = sockets;
    server.listen(this.port, '0.0.0.0', () => {
      this.status = 'on';
      this.notify();
    });
  }

  private async close() {
    clearTimeout(this.retry);
    const { server, sockets } = this;
    this.server = null;
    this.sockets = null;
    this.status = 'off';
    for (const socket of this.clients.keys()) socket.terminate();
    this.clients.clear();
    this.options.control.closeAll();
    sockets?.close();
    if (!server?.listening) return;
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }

  private accept(socket: WebSocket, request: IncomingMessage) {
    if (this.clients.size >= MAX_SCREENS) {
      socket.close();
      return;
    }
    const client: Client = {
      id: this.nextId++,
      ip: addressOf(request),
      device: deviceName(request.headers['user-agent'] ?? ''),
      width: 0,
      height: 0,
      seenAt: Date.now(),
    };
    this.clients.set(socket, client);
    // La IP que escribieron en la tele es la que hay que seguir ofreciendo.
    const host = (request.headers.host ?? '').replace(/:\d+$/, '');
    if (host !== this.lastIp && this.addresses.some(({ ip }) => ip === host)) {
      this.lastIp = host;
      writeSetting(this.options.db, LAST_IP_KEY, host);
    }
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
    this.refreshAddresses();
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
    } else if (path === '/api/ceflirics') {
      // Con esto la app del celular reconoce a la PC en la red.
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"app":"ceflirics"}');
    } else if (path === '/control') {
      response.writeHead(302, { Location: '/control/' }).end();
    } else if (path === '/control/') {
      await this.sendRendererFile('control/index.html', 'text/html; charset=utf-8', response);
    } else if (/^\/assets\/[\w.-]+$/.test(path) && ASSET_TYPES[extname(path)]) {
      await this.sendRendererFile(path.slice(1), ASSET_TYPES[extname(path)], response);
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
      'Content-Disposition': 'attachment; filename="ceflirics-control.apk"',
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
