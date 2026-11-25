import 'fake-indexeddb/auto';
import { test, expect } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';

let n = 0;
const nuevaDB = () => abrirDB(`prueba-db-${n++}`);
const hoy = '2026-11-24';

test('guardarOferta reemplaza la oferta del mismo producto y mercado', async () => {
  const repo = await nuevaDB();
  const d1 = await repo.guardarMercado({ nombre: 'D1' });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4700 }, hoy);
  const of = await repo.ofertasPorProducto();
  expect(of.get(arroz.id)).toHaveLength(1);
  expect(of.get(arroz.id)[0].precioNormal).toBe(4700);
  expect(of.get(arroz.id)[0].actualizado).toBe(hoy);
});

test('borrarMercado elimina sus ofertas', async () => {
  const repo = await nuevaDB();
  const d1 = await repo.guardarMercado({ nombre: 'D1' });
  const ara = await repo.guardarMercado({ nombre: 'Ara' });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 4500 }, hoy);
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: ara.id, tamano: 1000, precioNormal: 4800 }, hoy);
  await repo.borrarMercado(d1.id);
  expect((await repo.listarMercados()).map((m) => m.nombre)).toEqual(['Ara']);
  expect((await repo.ofertasPorProducto()).get(arroz.id).map((o) => o.mercadoId)).toEqual([ara.id]);
});

test('tacharItem alterna y guarda dónde se compró', async () => {
  const repo = await nuevaDB();
  const item = await repo.guardarItem({ productoId: 'p1', cantidad: 2000 });
  expect(await repo.tacharItem(item.id, 'd1')).toMatchObject({ tachado: true, compradoEn: 'd1' });
  const otra = await repo.tacharItem(item.id, null);
  expect(otra.tachado).toBe(false);
  expect(otra.compradoEn).toBeUndefined();
});

test('nuevaLista destachar y vaciar conservan catálogo y ofertas', async () => {
  const repo = await nuevaDB();
  const d1 = await repo.guardarMercado({ nombre: 'D1' });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 4500 }, hoy);
  const item = await repo.guardarItem({ productoId: arroz.id, cantidad: 2000 });
  await repo.tacharItem(item.id, d1.id);
  await repo.nuevaLista('destachar');
  const items = await repo.listarItems();
  expect(items).toHaveLength(1);
  expect(items[0].tachado).toBe(false);
  expect(items[0].compradoEn).toBeUndefined();
  await repo.nuevaLista('vaciar');
  expect(await repo.listarItems()).toHaveLength(0);
  expect(await repo.listarProductos()).toHaveLength(1);
  expect((await repo.ofertasPorProducto()).get(arroz.id)).toHaveLength(1);
});

test('ajustes y registro de cambios', async () => {
  const repo = await nuevaDB();
  await repo.guardarAjuste('mercadoActivo', 'abc');
  expect(await repo.leerAjuste('mercadoActivo')).toBe('abc');
  expect(await repo.leerAjuste('ultimoCambio')).toBeUndefined();
  await repo.guardarMercado({ nombre: 'D1' });
  expect(await repo.leerAjuste('ultimoCambio')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await repo.leerAjuste('primerCambio')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('fotos se guardan y leen', async () => {
  const repo = await nuevaDB();
  const id = await repo.guardarFoto(new Blob(['hola'], { type: 'image/jpeg' }));
  const b = await repo.leerFoto(id);
  expect(await b.text()).toBe('hola');
});
