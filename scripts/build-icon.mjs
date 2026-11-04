// Arma el ícono de Windows a partir del logo: un PNG para las ventanas y un ICO para el instalador.
// Va en blanco sobre fondo oscuro, porque la barra de la ventana puede ser de cualquier color.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const logo = readFileSync('assets/logo-cef.svg', 'utf8').replace(/<title>.*?<\/title>/, '');

const browser = await chromium.launch({ channel: 'msedge' });
const images = new Map();
for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; background: transparent; }
      div { display: grid; place-items: center; width: ${size}px; height: ${size}px; color: #fff;
        background: #0f1420; border-radius: ${size * 0.2}px; }
      svg { width: ${size * 0.84}px; height: ${size * 0.84}px; }
    </style>
    <div>${logo}</div>`);
  images.set(size, await page.screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();

// Un ICO es un índice y, después, cada tamaño como PNG.
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(SIZES.length, 4);
const entries = [];
let offset = header.length + SIZES.length * 16;
for (const size of SIZES) {
  const data = images.get(size);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size % 256, 0);
  entry.writeUInt8(size % 256, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += data.length;
}
writeFileSync('assets/icono.ico', Buffer.concat([header, ...entries, ...SIZES.map((size) => images.get(size))]));
writeFileSync('assets/icono.png', images.get(256));
console.log('assets/icono.ico y assets/icono.png listos');
