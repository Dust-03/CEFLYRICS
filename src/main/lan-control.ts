import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';
import { cleanDeviceName, type LanDevice } from '@shared/lan';
import type { OnAirState } from '@shared/state';
import type { Db } from './db/database';
import { readSetting, writeSetting } from './settings';

const PIN_KEY = 'lan.pin';
const DEVICES_KEY = 'lan.devices';

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;
const AUTH_MS = 5000;
// El celular lo entiende como "te desvincularon".
const REJECTED = 4001;

export type ControlMethods = Record<string, (...args: unknown[]) => unknown>;

type ControlOptions = {
  db: Db;
  getState: () => OnAirState;
  dispatch: (action: unknown) => void;
  methods: ControlMethods;
  onChange: () => void;
};

// De cada celular se guarda solo la huella de su llave, nunca la llave.
type Device = { id: number; name: string; tokenHash: string };
type Session = { deviceId: number; ip: string };
type Message = { t?: unknown; token?: unknown; id?: unknown; m?: unknown; a?: unknown; c?: unknown } | null;

export type PairResult = { token: string } | { error: 'pin' | 'locked' | 'name' };

const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const digest = (value: string) => createHash('sha256').update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const hashOf = (token: string) => digest(token).toString('hex');

// Lo que viaja por la red usa /media/; adentro de la app el protocolo es cef-media.
const toLan = (message: object) => JSON.stringify(message).split('cef-media://media/').join('/media/');
const fromLan = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/"\/media\//g, '"cef-media://media/'));

// Un celular vinculado puede cambiar lo que está al aire. Se vincula una vez con el PIN y un nombre,
// y desde entonces entra con su propia llave, que se puede revocar desde la PC.
export class LanControl {
  private pinValue: string;
  private devices: Device[];
  private failures = new Map<string, { count: number; lockedUntil: number }>();
  private sessions = new Map<WebSocket, Session>();

  constructor(private options: ControlOptions) {
    this.pinValue = readSetting<string>(options.db, PIN_KEY) ?? newPin();
    this.devices = readSetting<Device[]>(options.db, DEVICES_KEY) ?? [];
    writeSetting(options.db, PIN_KEY, this.pinValue);
  }

  get pin() {
    return this.pinValue;
  }

  get list(): LanDevice[] {
    const sessions = [...this.sessions.values()];
    return this.devices.map(({ id, name }) => ({
      id,
      name,
      ip: sessions.find(({ deviceId }) => deviceId === id)?.ip ?? null,
    }));
  }

  // Los celulares ya vinculados siguen entrando: el PIN solo sirve para vincular uno nuevo.
  renewPin() {
    this.pinValue = newPin();
    writeSetting(this.options.db, PIN_KEY, this.pinValue);
  }

  pair(ip: string, pin: unknown, rawName: unknown): PairResult {
    const record = this.failures.get(ip) ?? { count: 0, lockedUntil: 0 };
    if (record.lockedUntil > Date.now()) return { error: 'locked' };
    if (typeof pin !== 'string' || !same(pin, this.pinValue)) {
      record.count += 1;
      if (record.count >= MAX_FAILURES) {
        record.count = 0;
        record.lockedUntil = Date.now() + LOCK_MS;
      }
      this.failures.set(ip, record);
      return { error: 'pin' };
    }
    const name = cleanDeviceName(rawName);
    if (!name) return { error: 'name' };
    this.failures.delete(ip);
    const token = randomBytes(32).toString('hex');
    const id = Math.max(0, ...this.devices.map((device) => device.id)) + 1;
    this.devices.push({ id, name, tokenHash: hashOf(token) });
    this.save();
    this.options.onChange();
    return { token };
  }

  unlink(id: number) {
    this.devices = this.devices.filter((device) => device.id !== id);
    this.save();
    for (const [socket, session] of this.sessions) if (session.deviceId === id) socket.close(REJECTED);
    this.options.onChange();
  }

  private save() {
    writeSetting(this.options.db, DEVICES_KEY, this.devices);
  }

  // Una página de internet abierta en la red no puede hablarle al control.
  isPaired(token: unknown) {
    return typeof token === 'string' && this.devices.some(({ tokenHash }) => tokenHash === hashOf(token));
  }

  isSameOrigin(request: IncomingMessage) {
    const { origin, host } = request.headers;
    return !origin || origin === `http://${host}`;
  }

  accept(socket: WebSocket, ip: string) {
    const timeout = setTimeout(() => socket.terminate(), AUTH_MS);
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearTimeout(timeout);
      if (this.sessions.delete(socket)) this.options.onChange();
    });
    socket.on('message', (data) => {
      let message: Message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (this.sessions.has(socket)) {
        this.receive(socket, message).catch(() => socket.send(JSON.stringify({ id: message?.id, r: null })));
        return;
      }
      const hash = typeof message?.token === 'string' ? hashOf(message.token) : '';
      const device = this.devices.find(({ tokenHash }) => tokenHash === hash);
      if (message?.t !== 'auth' || !device) {
        socket.close(REJECTED);
        return;
      }
      clearTimeout(timeout);
      this.sessions.set(socket, { deviceId: device.id, ip });
      socket.send(toLan({ t: 'state', state: this.options.getState() }));
      this.options.onChange();
    });
  }

  private async receive(socket: WebSocket, message: Message) {
    if (message?.t === 'ping') {
      socket.send(JSON.stringify({ t: 'pong', c: message.c, s: Date.now() }));
    } else if (message?.t === 'forget') {
      this.unlink(this.sessions.get(socket)!.deviceId);
    } else if (message?.t === 'dispatch') {
      this.options.dispatch(fromLan(message.a));
    } else if (typeof message?.m === 'string' && Object.hasOwn(this.options.methods, message.m)) {
      const args = Array.isArray(message.a) ? message.a : [];
      const result = await this.options.methods[message.m](...args);
      socket.send(toLan({ id: message.id, r: result ?? null }));
    }
  }

  broadcast(state: OnAirState) {
    this.send({ t: 'state', state });
  }

  // Avisa que cambió una lista, para que los celulares la vuelvan a pedir.
  notify(list: 'shortcuts' | 'timers' | 'media') {
    this.send({ t: list });
  }

  private send(message: object) {
    const text = toLan(message);
    for (const socket of this.sessions.keys()) socket.send(text);
  }

  closeAll() {
    for (const socket of this.sessions.keys()) socket.terminate();
    this.sessions.clear();
  }
}
