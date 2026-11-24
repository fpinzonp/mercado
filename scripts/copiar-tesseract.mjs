// Copia el worker y los núcleos LSTM de Tesseract a public/tesseract/ para servirlos
// desde la misma app (y que el service worker los pueda guardar para usar sin internet).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const destino = 'public/tesseract';
mkdirSync(destino, { recursive: true });

copyFileSync('node_modules/tesseract.js/dist/worker.min.js', join(destino, 'worker.min.js'));

const core = 'node_modules/tesseract.js-core';
for (const f of readdirSync(core)) {
  // Solo los núcleos LSTM con el wasm embebido (*.wasm.js): es lo que carga tesseract.js con corePath = carpeta.
  if (/^tesseract-core(-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(f)) {
    copyFileSync(join(core, f), join(destino, f));
  }
}
console.log('Tesseract copiado a', destino);
