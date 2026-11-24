// Genera los íconos PNG (etiqueta de precio amarilla sobre verde) sin dependencias.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const VERDE = [0x1e, 0x7a, 0x4c];
const AMARILLO = [0xff, 0xd8, 0x4d];
const TINTA = [0x17, 0x30, 0x2a];

const crcTabla = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabla[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (tipo, datos) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(tam) {
  const filas = [];
  const s = tam / 100; // diseño en una cuadrícula de 100
  // Etiqueta: rectángulo redondeado inclinado con punta a la izquierda.
  const ang = -0.35, cos = Math.cos(ang), sin = Math.sin(ang);
  for (let y = 0; y < tam; y++) {
    const fila = [0];
    for (let x = 0; x < tam; x++) {
      // coordenadas en la cuadrícula, rotadas alrededor del centro
      const gx = x / s - 50, gy = y / s - 50;
      const rx = gx * cos - gy * sin, ry = gx * sin + gy * cos;
      let color = VERDE;
      const enCuerpo = rx > -18 && rx < 30 && Math.abs(ry) < 18;
      const enPunta = rx <= -18 && rx > -34 && Math.abs(ry) < 18 - (-18 - rx) * 1.1;
      if (enCuerpo || enPunta) color = AMARILLO;
      if ((rx + 20) ** 2 + ry ** 2 < 5 ** 2) color = VERDE; // hueco
      // dos líneas de "precio"
      if (rx > -6 && rx < 22 && ((ry > -7 && ry < -2) || (ry > 3 && ry < 8 && rx < 12))) color = TINTA;
      fila.push(...color);
    }
    filas.push(Buffer.from(fila));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(filas))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192));
writeFileSync('public/icons/icon-512.png', png(512));
writeFileSync('public/icons/apple-touch-icon.png', png(180));
console.log('Íconos generados en public/icons');
