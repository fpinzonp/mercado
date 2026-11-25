import { test, expect } from 'vitest';
import { parsePrecio, convertir, formatoCOP, formatoCantidad, formatoUnitario, tipoDeUnidad, parseTamano } from '../../src/logica/unidades.js';

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

test('parseTamano convierte kg y L', () => {
  expect(parseTamano('2 kg', 'g')?.tamano).toBe(2000);
  expect(parseTamano('1,5 L', 'ml')?.tamano).toBe(1500);
  expect(parseTamano('500', 'g')?.tamano).toBe(500);
  expect(parseTamano('30', 'unidad')?.tamano).toBe(30);
  expect(parseTamano('1 L', 'g')).toBeNull();
  expect(parseTamano('0', 'g')).toBeNull();
  expect(parseTamano('', 'g')).toBeNull();
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

test('tipoDeUnidad y parseTamano deducen el tipo de medida', () => {
  expect(tipoDeUnidad('kg')).toBe('g');
  expect(tipoDeUnidad('L')).toBe('ml');
  expect(tipoDeUnidad('und')).toBe('unidad');
  expect(tipoDeUnidad('xyz')).toBeNull();
  expect(parseTamano('1 kg', null)).toEqual({ tamano: 1000, tipo: 'g' });
  expect(parseTamano('750 ml', 'ml')).toEqual({ tamano: 750, tipo: 'ml' });
  expect(parseTamano('500', 'g')).toEqual({ tamano: 500, tipo: 'g' });
  expect(parseTamano('500', null)).toEqual({ tamano: 500, tipo: null });
  expect(parseTamano('1 kg', 'ml')).toBeNull();
  expect(parseTamano('', 'g')).toBeNull();
});
