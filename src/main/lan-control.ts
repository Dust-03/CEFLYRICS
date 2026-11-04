import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';
import type { OnAirState } from '@shared/state';
import type { Db } from './db/database';
import { readSetting, writeSetting } from './settings';

const PIN_KEY = 'lan.pin';
const TOKEN_KEY = 'lan.controlToken';

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;
const AUTH_MS = 5000;

export type ControlMethods = Record<string, (...args: unknown[]) => unknown>;

type ControlOptions = {
  db: Db;
  getState: () => OnAirState;
  dispatch: (action: unknown) => void;
  methods: ControlMethods;
  onChange: () => void;
};

export type PairResult = { token: string } | { error: 'pin' | 'locked' };

const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const newToken = () => randomBytes(32).toString('hex');
const digest = (value: string) => createHash('sha256').update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

// Lo que viaja por la red usa /media/; adentro de la app el protocolo es cef-media.
const toLan = (message: object) => JSON.stringify(message).split('cef-media://media/').join('/media/');
const fromLan = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/"\/media\//g, '"cef-media://media/'));

// Un celular vinculado puede cambiar lo que está al aire. Se vincula una vez con el PIN y después
// entra con un token, que deja de valer cuando se cambia el PIN.
export class LanControl {
  private pinValue: string;
  private token: string;
  private failures = new Map<string, { count: number; lockedUntil: number }>();
  private sockets = new Set<WebSocket>();

  constructor(private options: ControlOptions) {
    this.pinValue = readSetting<string>(options.db, PIN_KEY) ?? newPin();
    this.token = readSetting<string>(options.db, TOKEN_KEY) ?? newToken();
    writeSetting(options.db, PIN_KEY, this.pinValue);
    writeSetting(options.db, TOKEN_KEY, this.token);
  }

  get pin() {
    return this.pinValue;
  }

  get connected() {
    return this.sockets.size;
  }

  renewPin() {
    this.pinValue = newPin();
    this.token = newToken();
    writeSetting(this.options.db, PIN_KEY, this.pinValue);
    writeSetting(this.options.db, TOKEN_KEY, this.token);
    this.closeAll();
  }

  pair(ip: string, pin: unknown): PairResult {
    const record = this.failures.get(ip) ?? { count: 0, lockedUntil: 0 };
    if (record.lockedUntil > Date.now()) return { error: 'locked' };
    if (typeof pin === 'string' && same(pin, this.pinValue)) {
      this.failures.delete(ip);
      return { token: this.token };
    }
    record.count += 1;
    if (record.count >= MAX_FAILURES) {
      record.count = 0;
      record.lockedUntil = Date.now() + LOCK_MS;
    }
    this.failures.set(ip, record);
    return { error: 'pin' };
  }

  // Una página de internet abierta en la red no puede hablarle al control.
  isSameOrigin(request: IncomingMessage) {
    const { origin, host } = request.headers;
    return !origin || origin === `http://${host}`;
  }

  accept(socket: WebSocket) {
    let authorized = false;
    const timeout = setTimeout(() => socket.terminate(), AUTH_MS);
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearTimeout(timeout);
      if (this.sockets.delete(socket)) this.options.onChange();
    });
    socket.on('message', (data) => {
      let message: { t?: unknown; token?: unknown; id?: unknown; m?: unknown; a?: unknown } | null;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (authorized) {
        this.receive(socket, message).catch(() => {});
        return;
      }
      if (message?.t !== 'auth' || typeof message.token !== 'string' || !same(message.token, this.token)) {
        socket.close(4001);
        return;
      }
      authorized = true;
      clearTimeout(timeout);
      this.sockets.add(socket);
      socket.send(toLan({ t: 'state', state: this.options.getState() }));
      this.options.onChange();
    });
  }

  private async receive(socket: WebSocket, message: { t?: unknown; id?: unknown; m?: unknown; a?: unknown } | null) {
    if (message?.t === 'ping') {
      socket.send('{"t":"pong"}');
    } else if (message?.t === 'dispatch') {
      this.options.dispatch(fromLan(message.a));
    } else if (typeof message?.m === 'string' && Object.hasOwn(this.options.methods, message.m)) {
      const args = Array.isArray(message.a) ? message.a : [];
      const result = await this.options.methods[message.m](...args);
      socket.send(toLan({ id: message.id, r: result ?? null }));
    }
  }

  broadcast(state: OnAirState) {
    const message = toLan({ t: 'state', state });
    for (const socket of this.sockets) socket.send(message);
  }

  closeAll() {
    for (const socket of this.sockets) socket.terminate();
    this.sockets.clear();
  }
}
