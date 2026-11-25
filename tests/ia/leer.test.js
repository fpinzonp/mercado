import { test, expect } from 'vitest';
import { leerProducto } from '../../src/ia/leer.js';
import { ErrorIA } from '../../src/ia/gemini.js';

const blob = () => new Blob(['x']);
const ocrArroz = async () => ({ texto: 'ARROZ DIANA 500 g', palabras: ['ARROZ', 'DIANA', '500'] });

test('usa Gemini cuando responde', async () => {
  const r = await leerProducto(blob(), { clave: 'k', modelo: 'm' }, {
    gemini: async () => ({ nombre: 'Arroz Diana', tamano: 1, unidad: 'kg' }),
    ocr: async () => { throw new Error('no debería llamarse'); },
  });
  expect(r).toEqual({ fuente: 'gemini', nombre: 'Arroz Diana', tamano: 1, unidad: 'kg' });
});

test('cae a OCR con aviso por límite', async () => {
  const r = await leerProducto(blob(), { clave: 'k', modelo: 'm' }, {
    gemini: async () => { throw new ErrorIA('limite'); },
    ocr: ocrArroz,
  });
  expect(r).toMatchObject({ fuente: 'ocr', tamano: 500, unidad: 'g', palabras: ['ARROZ', 'DIANA', '500'] });
  expect(r.aviso).toMatch(/límite/i);
});

test('avisa si la clave es inválida', async () => {
  const r = await leerProducto(blob(), { clave: 'k', modelo: 'm' }, {
    gemini: async () => { throw new ErrorIA('clave_invalida'); },
    ocr: ocrArroz,
  });
  expect(r.aviso).toMatch(/clave/i);
});

test('sin señal cae a OCR sin aviso alarmante', async () => {
  const r = await leerProducto(blob(), { clave: 'k', modelo: 'm' }, {
    gemini: async () => { throw new ErrorIA('sin_red'); },
    ocr: ocrArroz,
  });
  expect(r.fuente).toBe('ocr');
});

test('termina en manual si todo falla', async () => {
  const r = await leerProducto(blob(), { clave: '' }, {
    gemini: async () => { throw new ErrorIA('sin_clave'); },
    ocr: async () => { throw new Error('wasm'); },
  });
  expect(r.fuente).toBe('manual');
});

test('error inesperado de Gemini también cae a OCR', async () => {
  const r = await leerProducto(blob(), { clave: 'k' }, {
    gemini: async () => { throw new Error('raro'); },
    ocr: ocrArroz,
  });
  expect(r.fuente).toBe('ocr');
});

const hoy = '2026-11-24';

test('leerTag usa Gemini y normaliza', async () => {
  const { leerTag } = await import('../../src/ia/leer.js');
  const r = await leerTag(blob(), { clave: 'k', hoy }, {
    gemini: async () => ({ precioNormal: 4500, precioPorUnidad: 4.5, unidadPrecioPorUnidad: 'g' }),
    ocr: async () => { throw new Error('no debería llamarse'); },
  });
  expect(r).toMatchObject({ fuente: 'gemini', precioNormal: 4500, tamano: 1000, unidad: 'g' });
});

test('leerTag cae a la lectura del teléfono con aviso', async () => {
  const { leerTag } = await import('../../src/ia/leer.js');
  const r = await leerTag(blob(), { clave: 'k', hoy }, {
    gemini: async () => { throw new ErrorIA('limite'); },
    ocr: async () => ({ texto: 'Antes $12.900 Ahora $9.990', palabras: [] }),
  });
  expect(r).toMatchObject({ fuente: 'ocr', precioNormal: 12900, precioDescuento: 9990 });
  expect(r.aviso).toMatch(/límite/i);
});

test('leerTag termina en manual si nada funciona', async () => {
  const { leerTag } = await import('../../src/ia/leer.js');
  const r = await leerTag(blob(), { clave: '', hoy }, {
    gemini: async () => { throw new ErrorIA('sin_clave'); },
    ocr: async () => { throw new Error('wasm'); },
  });
  expect(r.fuente).toBe('manual');
});
