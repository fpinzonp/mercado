import { test, expect } from 'vitest';
import { interpretarTag, normalizarTag } from '../../src/logica/tag.js';

const hoy = '2026-11-24';

test('tag simple: precio y precio por gramo dan el tamaño', () => {
  const r = interpretarTag('ARROZ DIANA 1000 g\n$4.500\nPrecio por gramo $4,50', hoy);
  expect(r).toMatchObject({ precioNormal: 4500, precioDescuento: null, tamano: 1000, unidad: 'g' });
});

test('tag con antes/ahora, ahorro y vigencia', () => {
  const r = interpretarTag('ACEITE GIRASOL 900 ml\nAntes $12.900\nAhora $9.990\nAhorra $2.910\nOferta válida hasta 30/11/2026', hoy);
  expect(r).toMatchObject({ precioNormal: 12900, precioDescuento: 9990, hasta: '2026-11-30', tamano: 900, unidad: 'ml' });
});

test('porcentaje de descuento con un solo precio queda como porcentaje para revisar', () => {
  const r = interpretarTag('HUEVOS AA x30 und\n$15.900\n20% dto\nHasta 05/12', hoy);
  expect(r).toMatchObject({ precioNormal: 15900, precioDescuento: null, porcentaje: 20, detalle: '20% dto', hasta: '2026-12-05', tamano: 30, unidad: 'unidad' });
});

test('el precio por unidad no se confunde con el precio y deduce el tamaño', () => {
  const r = interpretarTag('LECHE ENTERA\n$4.200\nPrecio x ml $4,20', hoy);
  expect(r).toMatchObject({ precioNormal: 4200, tamano: 1000, unidad: 'ml' });
});

test('promociones tipo 2x1 o lleve/pague van al detalle', () => {
  expect(interpretarTag('GALLETAS $6.500 Promo 2x1', hoy).detalle).toBe('2x1');
  expect(interpretarTag('JABÓN $3.200 Lleve 3 pague 2', hoy).detalle).toBe('Lleve 3 pague 2');
});

test('una fecha sin palabra de vigencia no se toma; una fecha vencida tampoco', () => {
  expect(interpretarTag('ARROZ $4.500 impreso 12/11/2026', hoy).hasta).toBeNull();
  expect(interpretarTag('ARROZ antes $5.000 ahora $4.500 hasta 10/11/2026', hoy).hasta).toBeNull();
});

test('texto sin precios devuelve todo vacío', () => {
  expect(interpretarTag('borroso ###', hoy)).toMatchObject({ precioNormal: null, precioDescuento: null, tamano: null, hasta: null, detalle: null });
});

test('normalizarTag limpia lo que llega de Gemini', () => {
  expect(normalizarTag({ precioNormal: '4.500', precioDescuento: 5000, hasta: '2026-11-01', tamano: null, precioPorUnidad: 4.5, unidadPrecioPorUnidad: 'g' }, hoy))
    .toMatchObject({ precioNormal: 4500, precioDescuento: null, hasta: null, tamano: 1000, unidad: 'g' });
  expect(normalizarTag({ precioNormal: 12900, precioDescuento: 9990, detalle: ' -23% ', hasta: '2026-11-30', tamano: 1, unidad: 'L' }, hoy))
    .toMatchObject({ precioNormal: 12900, precioDescuento: 9990, detalle: '-23%', hasta: '2026-11-30', tamano: 1000, unidad: 'ml' });
  expect(normalizarTag(null, hoy)).toMatchObject({ precioNormal: null });
});
