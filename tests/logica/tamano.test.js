import { test, expect } from 'vitest';
import { detectarTamano, normalizarLectura } from '../../src/logica/tamano.js';

test('detectarTamano', () => {
  expect(detectarTamano('ARROZ DIANA 1 kg')).toEqual({ tamano: 1000, unidad: 'g' });
  expect(detectarTamano('Arroz 500g premium')).toEqual({ tamano: 500, unidad: 'g' });
  expect(detectarTamano('Aceite 1.000 ml')).toEqual({ tamano: 1000, unidad: 'ml' });
  expect(detectarTamano('Gaseosa 1,5L')).toEqual({ tamano: 1500, unidad: 'ml' });
  expect(detectarTamano('Huevos x30 und')).toEqual({ tamano: 30, unidad: 'unidad' });
  expect(detectarTamano('Jabón 3 unidades')).toEqual({ tamano: 3, unidad: 'unidad' });
  expect(detectarTamano('sin tamaño')).toBeNull();
  expect(detectarTamano('')).toBeNull();
});

test('normalizarLectura convierte y limpia', () => {
  expect(normalizarLectura({ nombre: ' Leche Alpina ', tamano: 1, unidad: 'L' }, 'ml')).toEqual({ nombre: 'Leche Alpina', tamano: 1000, tipo: 'ml' });
  expect(normalizarLectura({ nombre: 'Huevos', tamano: 30, unidad: 'unidad' }, 'unidad')).toEqual({ nombre: 'Huevos', tamano: 30, tipo: 'unidad' });
});

test('normalizarLectura deja tamaño vacío si la unidad no es compatible', () => {
  expect(normalizarLectura({ nombre: 'Leche', tamano: 1, unidad: 'L' }, 'g')).toEqual({ nombre: 'Leche', tamano: null, tipo: 'g' });
  expect(normalizarLectura({ nombre: null }, 'g')).toEqual({ nombre: '', tamano: null, tipo: 'g' });
});

test('normalizarLectura sin tipo de medida lo deduce de la unidad leída', () => {
  expect(normalizarLectura({ nombre: 'Leche', tamano: 1, unidad: 'L' }, null)).toEqual({ nombre: 'Leche', tamano: 1000, tipo: 'ml' });
  expect(normalizarLectura({ nombre: 'Arroz', tamano: 500, unidad: 'g' }, undefined)).toEqual({ nombre: 'Arroz', tamano: 500, tipo: 'g' });
  expect(normalizarLectura({ nombre: 'Huevos', tamano: 30, unidad: null }, null)).toEqual({ nombre: 'Huevos', tamano: null, tipo: null });
});
