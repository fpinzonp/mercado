import { test, expect } from 'vitest';
import {
  descuentoVigente, precioEfectivo, precioOferta, compararItem, cantidadReferencia,
  totalesPorMercado, totalCombinado, repartirCompra,
} from '../../src/logica/comparar.js';

const hoy = '2026-11-24';
// D1 $4,50/g · Éxito $4,80/g · Ara $5,00/g normal, $4,00/g con descuento
const arrozD1 = { id: 'o1', productoId: 'arroz', mercadoId: 'd1', tamano: 1000, precioNormal: 4500, actualizado: hoy };
const arrozExito = { id: 'o2', productoId: 'arroz', mercadoId: 'exito', tamano: 500, precioNormal: 2400, actualizado: hoy };
const arrozAra = {
  id: 'o3', productoId: 'arroz', mercadoId: 'ara', tamano: 1000, precioNormal: 5000,
  precioDescuento: 4000, descuentoHasta: '2026-11-30', actualizado: hoy,
};
const item = { id: 'i1', productoId: 'arroz', tachado: false };

test('precioOferta: precio de una presentación y precio por unidad', () => {
  expect(precioOferta(arrozD1, hoy)).toMatchObject({ costo: 4500, costoNormal: 4500, unitario: 4.5, unitarioNormal: 4.5, conDescuento: false });
  expect(precioOferta(arrozExito, hoy)).toMatchObject({ costo: 2400, unitario: 4.8 });
  expect(precioOferta({ ...arrozD1, tamano: 0 }, hoy)).toBeNull();
  expect(precioOferta({ ...arrozD1, precioNormal: 0 }, hoy)).toBeNull();
});

test('precioOferta con descuento guarda también el normal', () => {
  expect(precioOferta(arrozAra, hoy)).toMatchObject({ costo: 4000, costoNormal: 5000, unitario: 4, unitarioNormal: 5, conDescuento: true });
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

test('compara por precio por unidad, no por precio del paquete', () => {
  // El paquete de Éxito ($2.400) es más barato que el de D1 ($4.500), pero el gramo sale más caro.
  const r = compararItem(item, [arrozExito, arrozD1], hoy);
  expect(r.filas.map((f) => f.oferta.mercadoId)).toEqual(['d1', 'exito']);
  expect(r.filas[0].esMasBaratoHoy).toBe(true);
  expect(r.filas[1].esMasBaratoHoy).toBe(false);
});

test('la cantidad de ítems viejos ya no cambia la comparación', () => {
  const viejo = { ...item, cantidad: 500 };
  expect(compararItem(viejo, [arrozExito, arrozD1], hoy).filas[0].oferta.mercadoId).toBe('d1');
});

test('más barato solo por descuento', () => {
  const r = compararItem(item, [arrozD1, arrozExito, arrozAra], hoy);
  expect(r.filas[0].oferta.mercadoId).toBe('ara');
  expect(r.filas[0].esMasBaratoHoy).toBe(true);
  expect(r.filas.find((f) => f.oferta.mercadoId === 'd1').esMasBaratoNormal).toBe(true);
  expect(r.soloPorDescuento).toBe(true);
  expect(compararItem(item, [arrozD1, arrozExito, arrozAra], '2026-12-05').soloPorDescuento).toBe(false);
});

test('empates por unidad se marcan ambos aunque el paquete sea distinto', () => {
  const medio = { ...arrozD1, id: 'o9', mercadoId: 'ara', tamano: 500, precioNormal: 2250 };
  const r = compararItem(item, [arrozD1, medio], hoy);
  expect(r.filas.filter((f) => f.esMasBaratoHoy)).toHaveLength(2);
});

test('compararItem sin ofertas', () => {
  expect(compararItem(item, [], hoy)).toEqual({ filas: [], soloPorDescuento: false });
});

const aceiteD1 = { id: 'o4', productoId: 'aceite', mercadoId: 'd1', tamano: 1000, precioNormal: 12000, actualizado: hoy };
const aceiteExito = { id: 'o5', productoId: 'aceite', mercadoId: 'exito', tamano: 1000, precioNormal: 10000, actualizado: hoy };
const aceite = { id: 'i2', productoId: 'aceite', tachado: false };
const mercados = [{ id: 'd1' }, { id: 'exito' }];

test('cantidadReferencia: tamaño típico (mediana baja) de las presentaciones', () => {
  expect(cantidadReferencia([arrozD1, arrozExito, arrozAra])).toBe(1000);
  expect(cantidadReferencia([arrozD1, arrozExito])).toBe(500);
  expect(cantidadReferencia([])).toBeNull();
});

test('totales: la misma cantidad de cada producto en todos los mercados; incompleto no gana', () => {
  // Arroz: referencia 500 g → D1 $2.250, Éxito $2.400. Aceite: 1 L → D1 $12.000.
  const of = new Map([['arroz', [arrozD1, arrozExito]], ['aceite', [aceiteD1]]]);
  const t = totalesPorMercado([item, aceite], of, mercados, hoy);
  expect(t[0]).toEqual({ mercadoId: 'd1', total: 14250, faltan: 0 });
  expect(t[1]).toEqual({ mercadoId: 'exito', total: 2400, faltan: 1 });
});

test('el paquete pequeño no hace ganar a un mercado más caro por unidad', () => {
  const of = new Map([['arroz', [arrozD1, arrozExito, arrozAra]]]);
  const t = totalesPorMercado([item], of, [{ id: 'd1' }, { id: 'exito' }, { id: 'ara' }], hoy);
  expect(t.map((x) => [x.mercadoId, x.total])).toEqual([['ara', 4000], ['d1', 4500], ['exito', 4800]]);
});

test('total combinado: cada cosa donde sale más barata, con la misma cantidad', () => {
  const sal = { id: 'i3', productoId: 'sal', tachado: false };
  const of = new Map([['arroz', [arrozD1, arrozExito]], ['aceite', [aceiteD1, aceiteExito]], ['sal', []]]);
  // d1: 2250+12000=14250; exito: 2400+10000=12400; combinado: 2250+10000=12250
  expect(totalCombinado([item, aceite, sal], of, mercados, hoy)).toEqual({ total: 12250, sinPrecio: 1, ahorro: 150 });
});

test('ahorro null si ningún mercado está completo', () => {
  const of = new Map([['arroz', [arrozD1]], ['aceite', [aceiteExito]]]);
  expect(totalCombinado([item, aceite], of, mercados, hoy).ahorro).toBeNull();
});

test('repartirCompra dice cuánto más caro sale aquí por unidad', () => {
  const of = new Map([['arroz', [arrozD1, arrozExito]]]);
  const r = repartirCompra([item], of, 'exito', hoy);
  expect(r.aqui).toHaveLength(0);
  expect(r.otros[0]).toMatchObject({ mercadoId: 'd1', porcentaje: 7 });
  expect(repartirCompra([item], of, 'd1', hoy).aqui).toHaveLength(1);
  expect(repartirCompra([{ ...item, tachado: true }], of, 'd1', hoy).aqui).toHaveLength(0);
});

test('repartirCompra: sin precio en ningún lado va a aquí; sin precio aquí porcentaje null', () => {
  const sal = { id: 'i3', productoId: 'sal', tachado: false };
  const of = new Map([['arroz', [arrozD1]]]);
  const r = repartirCompra([item, sal], of, 'exito', hoy);
  expect(r.aqui.map((i) => i.id)).toEqual(['i3']);
  expect(r.otros[0]).toMatchObject({ mercadoId: 'd1', porcentaje: null });
});
