import { test, expect } from 'vitest';
import { parsePrecio, parseCantidad, convertir, formatoCOP, formatoCantidad, formatoUnitario } from '../../src/logica/unidades.js';

test('parsePrecio entiende precios a la colombiana', () => {
  expect(parsePrecio('4.500')).toBe(4500);
  expect(parsePrecio('$ 4.500')).toBe(4500);
  expect(parsePrecio('4500')).toBe(4500);
  expect(parsePrecio('12.990,00')).toBe(12990);
  expect(parsePrecio('1.234.567')).toBe(1234567);
  expect(parsePrecio('')).toBeNull();
  expect(parsePrecio('0')).toBeNull();
  expect(parsePrecio('abc')).toBeNull();
});

test('parseCantidad convierte kg y L', () => {
  expect(parseCantidad('2 kg', 'g')).toBe(2000);
  expect(parseCantidad('1,5 L', 'ml')).toBe(1500);
  expect(parseCantidad('500', 'g')).toBe(500);
  expect(parseCantidad('30', 'unidad')).toBe(30);
  expect(parseCantidad('1 L', 'g')).toBeNull();
  expect(parseCantidad('0', 'g')).toBeNull();
  expect(parseCantidad('', 'g')).toBeNull();
});

test('convertir rechaza unidades incompatibles', () => {
  expect(convertir(1, 'kg', 'g')).toBe(1000);
  expect(convertir(2, 'und', 'unidad')).toBe(2);
  expect(convertir(1, 'L', 'g')).toBeNull();
});

test('formatos', () => {
  expect(formatoCOP(85000)).toBe('$85.000');
  expect(formatoCantidad(2000, 'g')).toBe('2 kg');
  expect(formatoCantidad(500, 'g')).toBe('500 g');
  expect(formatoCantidad(1500, 'ml')).toBe('1,5 L');
  expect(formatoCantidad(30, 'unidad')).toBe('30 un');
  expect(formatoUnitario(4500, 1000, 'g')).toBe('$4,50/g');
  expect(formatoUnitario(13500, 30, 'unidad')).toBe('$450,00/un');
});
