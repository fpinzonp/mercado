import { test, expect } from 'vitest';
import { fusionarOferta } from '../../src/logica/ofertas.js';

const hoy = '2026-11-24';
const arrozAra = {
  id: 'o3', productoId: 'arroz', mercadoId: 'ara', tamano: 1000, precioNormal: 5000,
  precioDescuento: 4000, detalleDescuento: '-20%', descuentoHasta: '2026-11-30', actualizado: hoy,
};

test('fusionarOferta borra descuento vencido al cambiar precio', () => {
  const vencido = { ...arrozAra, descuentoHasta: '2026-11-01' };
  const r = fusionarOferta(vencido, { precioNormal: 5200 }, hoy);
  expect(r.precioDescuento).toBeUndefined();
  expect(r.detalleDescuento).toBeUndefined();
  expect(r.descuentoHasta).toBeUndefined();
  expect(r.precioNormal).toBe(5200);
});

test('fusionarOferta conserva descuento vigente', () => {
  const r = fusionarOferta(arrozAra, { precioNormal: 5200 }, hoy);
  expect(r.precioDescuento).toBe(4000);
  expect(r.id).toBe('o3');
});

test('fusionarOferta con descuento nuevo lo reemplaza', () => {
  const r = fusionarOferta(arrozAra, { precioNormal: 5200, precioDescuento: 4500 }, hoy);
  expect(r.precioDescuento).toBe(4500);
  expect(r.detalleDescuento).toBeUndefined();
});

test('fusionarOferta pone actualizado = hoy', () => {
  const r = fusionarOferta(undefined, { productoId: 'arroz', mercadoId: 'd1', tamano: 1000, precioNormal: 4500 }, '2026-11-25');
  expect(r.actualizado).toBe('2026-11-25');
});

test('fusionarOferta con descuento explícito quitado (null) lo borra', () => {
  const r = fusionarOferta(arrozAra, { precioNormal: 5000, precioDescuento: null }, hoy);
  expect(r.precioDescuento).toBeUndefined();
});
