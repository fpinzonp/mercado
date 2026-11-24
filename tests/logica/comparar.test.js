import { test, expect } from 'vitest';
import {
  descuentoVigente, precioEfectivo, costoItem, compararItem,
  totalesPorMercado, totalCombinado, repartirCompra,
} from '../../src/logica/comparar.js';

const hoy = '2026-11-24';
const arrozD1 = { id: 'o1', productoId: 'arroz', mercadoId: 'd1', tamano: 1000, precioNormal: 4500, actualizado: hoy };
const arrozExito = { id: 'o2', productoId: 'arroz', mercadoId: 'exito', tamano: 500, precioNormal: 2400, actualizado: hoy };
const arrozAra = {
  id: 'o3', productoId: 'arroz', mercadoId: 'ara', tamano: 1000, precioNormal: 5000,
  precioDescuento: 4000, descuentoHasta: '2026-11-30', actualizado: hoy,
};
const item = { id: 'i1', productoId: 'arroz', cantidad: 2000, tachado: false };

test('costoItem redondea paquetes hacia arriba', () => {
  expect(costoItem(2000, arrozD1, hoy)).toMatchObject({ paquetes: 2, costo: 9000, unitario: 4.5 });
  expect(costoItem(2000, arrozExito, hoy)).toMatchObject({ paquetes: 4, costo: 9600 });
  expect(costoItem(1200, arrozD1, hoy).paquetes).toBe(2);
  expect(costoItem(0, arrozD1, hoy)).toBeNull();
  expect(costoItem(2000, { ...arrozD1, tamano: 0 }, hoy)).toBeNull();
});

test('costoItem con descuento guarda también el costo normal', () => {
  expect(costoItem(2000, arrozAra, hoy)).toMatchObject({ costo: 8000, costoNormal: 10000, conDescuento: true });
});

test('descuento vigente hasta el último día incluido', () => {
  expect(descuentoVigente(arrozAra, '2026-11-30')).toBe(true);
  expect(descuentoVigente(arrozAra, '2026-12-01')).toBe(false);
  const sinFecha = { ...arrozAra, descuentoHasta: undefined, actualizado: '2026-11-20' };
  expect(descuentoVigente(sinFecha, '2026-11-20')).toBe(true);
  expect(descuentoVigente(sinFecha, '2026-11-21')).toBe(false);
  expect(descuentoVigente(arrozD1, hoy)).toBe(false);
});

test('precioEfectivo', () => {
  expect(precioEfectivo(arrozAra, hoy)).toEqual({ precio: 4000, conDescuento: true });
  expect(precioEfectivo(arrozAra, '2026-12-01')).toEqual({ precio: 5000, conDescuento: false });
});

test('más barato solo por descuento', () => {
  const r = compararItem(item, [arrozD1, arrozExito, arrozAra], hoy);
  expect(r.filas[0].oferta.mercadoId).toBe('ara');
  expect(r.filas[0].esMasBaratoHoy).toBe(true);
  expect(r.filas.find((f) => f.oferta.mercadoId === 'd1').esMasBaratoNormal).toBe(true);
  expect(r.soloPorDescuento).toBe(true);
  expect(compararItem(item, [arrozD1, arrozExito, arrozAra], '2026-12-05').soloPorDescuento).toBe(false);
});

test('empates se marcan ambos', () => {
  const r = compararItem(item, [arrozD1, { ...arrozD1, id: 'o9', mercadoId: 'ara' }], hoy);
  expect(r.filas.filter((f) => f.esMasBaratoHoy)).toHaveLength(2);
});

test('compararItem sin ofertas', () => {
  expect(compararItem(item, [], hoy)).toEqual({ filas: [], soloPorDescuento: false });
});

test('totales: mercado incompleto no gana', () => {
  const aceite = { id: 'i2', productoId: 'aceite', cantidad: 1000, tachado: false };
  const of = new Map([
    ['arroz', [arrozD1, arrozExito]],
    ['aceite', [{ id: 'o4', productoId: 'aceite', mercadoId: 'd1', tamano: 1000, precioNormal: 12000, actualizado: hoy }]],
  ]);
  const t = totalesPorMercado([item, aceite], of, [{ id: 'd1' }, { id: 'exito' }], hoy);
  expect(t[0]).toEqual({ mercadoId: 'd1', total: 21000, faltan: 0 });
  expect(t[1]).toEqual({ mercadoId: 'exito', total: 9600, faltan: 1 });
  expect(totalCombinado([item, aceite], of, [{ id: 'd1' }, { id: 'exito' }], hoy)).toEqual({ total: 21000, sinPrecio: 0, ahorro: 0 });
});

test('total combinado reparte y calcula ahorro', () => {
  const aceite = { id: 'i2', productoId: 'aceite', cantidad: 1000, tachado: false };
  const of = new Map([
    ['arroz', [arrozD1, arrozExito]],
    ['aceite', [
      { id: 'o4', productoId: 'aceite', mercadoId: 'd1', tamano: 1000, precioNormal: 12000, actualizado: hoy },
      { id: 'o5', productoId: 'aceite', mercadoId: 'exito', tamano: 1000, precioNormal: 10000, actualizado: hoy },
    ]],
    ['sal', []],
  ]);
  const sal = { id: 'i3', productoId: 'sal', cantidad: 500, tachado: false };
  const mercados = [{ id: 'd1' }, { id: 'exito' }];
  // d1: 9000+12000=21000; exito: 9600+10000=19600; combinado: 9000+10000=19000
  expect(totalCombinado([item, aceite, sal], of, mercados, hoy)).toEqual({ total: 19000, sinPrecio: 1, ahorro: 600 });
});

test('ahorro null si ningún mercado está completo', () => {
  const aceite = { id: 'i2', productoId: 'aceite', cantidad: 1000, tachado: false };
  const of = new Map([
    ['arroz', [arrozD1]],
    ['aceite', [{ id: 'o5', productoId: 'aceite', mercadoId: 'exito', tamano: 1000, precioNormal: 10000, actualizado: hoy }]],
  ]);
  expect(totalCombinado([item, aceite], of, [{ id: 'd1' }, { id: 'exito' }], hoy).ahorro).toBeNull();
});

test('repartirCompra', () => {
  const of = new Map([['arroz', [arrozD1, arrozExito]]]);
  const r = repartirCompra([item], of, 'exito', hoy);
  expect(r.aqui).toHaveLength(0);
  expect(r.otros[0]).toMatchObject({ mercadoId: 'd1', diferencia: 600 });
  expect(repartirCompra([item], of, 'd1', hoy).aqui).toHaveLength(1);
  expect(repartirCompra([{ ...item, tachado: true }], of, 'd1', hoy).aqui).toHaveLength(0);
});

test('repartirCompra: sin precio en ningún lado va a aquí; sin precio aquí diferencia null', () => {
  const sal = { id: 'i3', productoId: 'sal', cantidad: 500, tachado: false };
  const of = new Map([['arroz', [arrozD1]]]);
  const r = repartirCompra([item, sal], of, 'exito', hoy);
  expect(r.aqui.map((i) => i.id)).toEqual(['i3']);
  expect(r.otros[0]).toMatchObject({ mercadoId: 'd1', diferencia: null });
});
