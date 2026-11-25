import 'fake-indexeddb/auto';
import { test, expect } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { exportarRespaldo, importarRespaldo } from '../../src/datos/respaldo.js';
import { resumenProducto } from '../../src/logica/resumen.js';
import { hoyLocal } from '../../src/logica/fechas.js';

let n = 0;
const hoy = hoyLocal();
const enUnaSemana = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return hoyLocal(d); })();

async function escenario() {
  const repo = await abrirDB(`compras-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1', orden: 0 });
  const ara = await repo.guardarMercado({ nombre: 'Ara', orden: 1 });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  await repo.guardarOferta({
    productoId: arroz.id, mercadoId: ara.id, nombreReal: 'Arroz Roa', tamano: 1000, precioNormal: 5000,
    precioDescuento: 4000, descuentoHasta: enUnaSemana,
  }, hoy);
  return { repo, d1, ara, arroz };
}

test('tachar en un mercado guarda la compra con el precio pagado y si tenía descuento', async () => {
  const { repo, ara, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, ara.id);
  const [c] = await repo.listarCompras();
  expect(c).toMatchObject({ productoId: arroz.id, mercadoId: ara.id, fecha: hoy, precio: 4000, precioNormal: 5000, conDescuento: true });
});

test('a precio completo queda conDescuento false; sin precio en ese mercado queda precio null', async () => {
  const { repo, d1, arroz } = await escenario();
  const otro = await repo.guardarMercado({ nombre: 'Éxito' });
  const i1 = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(i1.id, d1.id);
  expect((await repo.listarCompras())[0]).toMatchObject({ mercadoId: d1.id, precio: 4500, conDescuento: false });
  await repo.tacharItem(i1.id, null);
  await repo.tacharItem(i1.id, otro.id);
  const [c] = await repo.listarCompras();
  expect(c).toMatchObject({ mercadoId: otro.id, precio: null, conDescuento: false });
});

test('destachar borra la compra de ese tachado (fue un error)', async () => {
  const { repo, d1, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, d1.id);
  await repo.tacharItem(item.id, null);
  expect(await repo.listarCompras()).toHaveLength(0);
});

test('el historial se conserva al empezar una lista nueva (vaciar o destachar)', async () => {
  const { repo, d1, ara, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, d1.id);
  await repo.nuevaLista('destachar');
  expect(await repo.listarCompras()).toHaveLength(1);
  await repo.tacharItem(item.id, ara.id);
  await repo.nuevaLista('vaciar');
  expect(await repo.listarItems()).toHaveLength(0);
  expect((await repo.listarCompras()).map((c) => c.mercadoId).sort()).toEqual([d1.id, ara.id].sort());
});

test('resumen: mejor mercado (y si es solo por descuento) y última compra con descuento', async () => {
  const { repo, ara, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, ara.id);
  const r = resumenProducto({
    productoId: arroz.id, ofertas: (await repo.ofertasPorProducto()).get(arroz.id), compras: await repo.listarCompras(), hoy,
  });
  expect(r.mejor).toMatchObject({ mercadoId: ara.id, soloPorDescuento: true, unitario: 4 });
  expect(r.ultima).toMatchObject({ mercadoId: ara.id, fecha: hoy, precio: 4000, conDescuento: true });
});

test('resumen: compra anterior a precio completo, producto sin precios y nunca comprado', async () => {
  const { repo, d1, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, d1.id);
  const compras = await repo.listarCompras();
  expect(resumenProducto({ productoId: arroz.id, ofertas: (await repo.ofertasPorProducto()).get(arroz.id), compras, hoy }).ultima)
    .toMatchObject({ mercadoId: d1.id, precio: 4500, conDescuento: false });
  expect(resumenProducto({ productoId: 'sal', ofertas: undefined, compras, hoy })).toEqual({ mejor: null, ultima: null });
});

test('las compras salen y vuelven en el respaldo; un respaldo viejo sin compras se importa', async () => {
  const { repo, d1, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, d1.id);
  const datos = JSON.parse(JSON.stringify(await exportarRespaldo(repo)));
  expect(datos.compras).toHaveLength(1);
  await repo.borrarTodo();
  await importarRespaldo(repo, datos);
  expect(await repo.listarCompras()).toHaveLength(1);
  const { compras, ...viejo } = datos;
  void compras;
  await importarRespaldo(repo, viejo);
  expect(await repo.listarCompras()).toHaveLength(0);
});
