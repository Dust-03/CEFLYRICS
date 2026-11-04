// Dibuja las imágenes del instalador. Windows las pide en BMP y con estas medidas exactas.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const strip = (file) => readFileSync(file, 'utf8').replace(/<title>.*?<\/title>/, '');
const mark = strip('assets/logo-cef.svg');
const wordmark = strip('assets/logo-ceflyrics.svg');

const BASE = `html, body { margin: 0; overflow: hidden; }
  .art { position: relative; overflow: hidden; color: #fff;
    background: radial-gradient(circle at 50% 38%, #1d2b4d 0%, #0a0f1e 70%); font-family: 'Segoe UI', sans-serif; }`;

const IMAGES = [
  {
    file: 'assets/instalador-lateral.bmp',
    width: 164,
    height: 314,
    html: `<div class="art" style="width:164px;height:314px;display:grid;justify-items:center;align-content:center;gap:16px">
      <div style="width:112px;height:112px;filter:drop-shadow(0 0 12px rgb(242 181 68 / .55))">${mark}</div>
      <div style="width:44px;height:2px;background:#f2b544;border-radius:2px"></div>
      <div style="font-size:15px;font-weight:600;letter-spacing:.14em">CEFLYRICS</div>
      <div style="font-size:10px;color:#aeb9cf;text-align:center;line-height:1.35">Proyección<br>para la iglesia</div>
    </div>`,
  },
  {
    file: 'assets/instalador-encabezado.bmp',
    width: 150,
    height: 57,
    html: `<div class="art" style="width:150px;height:57px;display:grid;place-items:center">
      <div style="width:112px">${wordmark}</div>
    </div>`,
  },
];

function toBmp(width, height, rgba) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const size = rowSize * height;
  const file = Buffer.alloc(54 + size);
  file.write('BM', 0);
  file.writeUInt32LE(54 + size, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(size, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = 54 + (height - 1 - y) * rowSize + x * 3;
      file[to] = rgba[from + 2];
      file[to + 1] = rgba[from + 1];
      file[to + 2] = rgba[from];
    }
  }
  return file;
}

const browser = await chromium.launch({ channel: 'msedge' });
for (const { file, width, height, html } of IMAGES) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><style>${BASE} svg { display: block; width: 100%; height: 100%; }</style>${html}`,
  );
  const png = (await page.screenshot()).toString('base64');
  const rgba = await page.evaluate(
    async ([data, w, h]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(0, 0, w, h).data);
    },
    [png, width, height],
  );
  writeFileSync(file, toBmp(width, height, rgba));
  await page.close();
}
await browser.close();
console.log('imágenes del instalador listas');
