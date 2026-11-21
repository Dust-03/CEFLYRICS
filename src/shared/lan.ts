// Transmisión: lo que necesitan el servidor de la red y su menú.
export const DEFAULT_LAN_PORT = 8787;

export type LanAddress = { ip: string; adapter: string; mac: string };
export type LanScreen = { id: number; ip: string; device: string; width: number; height: number };
export type LanStatus = 'on' | 'off' | 'busy';
// Un celular vinculado. Sin ip, no está conectado ahora. alwaysAllowData: exporta e importa sin preguntar.
export type LanDevice = { id: number; name: string; ip: string | null; alwaysAllowData: boolean };

// Lo que un celular puede pedirle a la PC, y que la PC tiene que autorizar.
export type DataAction = 'export' | 'import' | 'media';
export type DataAnswer = 'once' | 'always' | 'deny';
// Qué fotos y videos quiere mandar el celular, para que la PC sepa qué autoriza.
export type MediaDetail = { images: number; videos: number; bytes: number };
// Un pedido nuevo, o el aviso de que el celular se fue o tardó y el pedido ya no vale.
export type LanDataRequest =
  { id: number; device: string; action: DataAction; media?: MediaDetail } | { id: number; cancelled: true };

export const MAX_MEDIA_FILES = 100;

// Lo que manda el celular no se cree tal cual: números enteros, sin negativos, y entre 1 y 100 archivos.
export function cleanMediaDetail(input: unknown): MediaDetail | null {
  const value = (input ?? {}) as Record<string, unknown>;
  const count = (key: string) => {
    const number = Number(value[key]);
    return Number.isSafeInteger(number) && number >= 0 ? number : -1;
  };
  const [images, videos, bytes] = [count('images'), count('videos'), count('bytes')];
  const files = images + videos;
  if (images < 0 || videos < 0 || bytes < 0 || files < 1 || files > MAX_MEDIA_FILES) return null;
  return { images, videos, bytes };
}

export type LanInfo = {
  status: LanStatus;
  port: number;
  addresses: LanAddress[];
  // La IP con la que se conectó la última pantalla, si ya no es la de esta PC.
  previousIp: string | null;
  screens: LanScreen[];
  // Si las teles reproducen el audio de los videos.
  sound: boolean;
  // Para vincular un celular como control.
  pin: string;
  devices: LanDevice[];
  // Si la PC tiene el instalador de la app para ofrecerlo.
  apk: boolean;
};

export type LanApi = {
  info: () => Promise<LanInfo>;
  setPort: (port: number) => void;
  setEnabled: (enabled: boolean) => void;
  setSound: (sound: boolean) => void;
  renewPin: () => void;
  unlink: (id: number) => void;
  revokeAlways: (id: number) => void;
  answerDataRequest: (id: number, answer: DataAnswer) => void;
  onDataRequest: (listener: (request: LanDataRequest) => void) => () => void;
  onInfo: (listener: (info: LanInfo) => void) => () => void;
};

// Por debajo de 1024 Windows suele negarlos.
export function parsePort(input: unknown) {
  const port = Number(input);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

const MAX_NAME = 30;

// Vacío o solo espacios no vale: el nombre es lo que permite reconocerlo después en la PC.
export function cleanDeviceName(input: unknown) {
  if (typeof input !== 'string') return null;
  const name = input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  return name || null;
}

export function lanAddress(ip: string, port: number) {
  return `${ip}:${port}`;
}

type NetworkInterface = { address: string; family: string | number; internal: boolean; mac: string };

// Los adaptadores que crean las máquinas virtuales y las VPN no llegan a la tele.
const VIRTUAL = /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|loopback|tailscale|zerotier|hamachi|bluetooth/i;

function networkRank(ip: string) {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
}

// Las direcciones de esta PC en la red, primero la que más probablemente vea la tele.
export function listAddresses(interfaces: Record<string, NetworkInterface[] | undefined>): LanAddress[] {
  const found: LanAddress[] = [];
  for (const [adapter, entries] of Object.entries(interfaces)) {
    for (const { address, family, internal, mac } of entries ?? []) {
      const ipv4 = family === 'IPv4' || family === 4;
      if (ipv4 && !internal && !address.startsWith('169.254.')) found.push({ ip: address, adapter, mac });
    }
  }
  const real = found.filter(({ adapter }) => !VIRTUAL.test(adapter));
  return (real.length ? real : found).sort((a, b) => networkRank(a.ip) - networkRank(b.ip));
}

export function deviceName(userAgent: string) {
  if (/tizen|samsung/i.test(userAgent)) return 'Tele Samsung';
  if (/web0s|webos|netcast/i.test(userAgent)) return 'Tele LG';
  if (/android.*(tv|aft|box)|bravia|googletv/i.test(userAgent)) return 'Android TV';
  if (/iphone|ipad/i.test(userAgent)) return 'iPhone o iPad';
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'PC con Windows';
  if (/macintosh/i.test(userAgent)) return 'Mac';
  if (/tv/i.test(userAgent)) return 'Tele';
  return 'Navegador';
}
