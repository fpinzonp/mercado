import 'fake-indexeddb/auto';
import { test, expect } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { exportarRespaldo, importarRespaldo, necesitaRecordatorio } from '../../src/datos/respaldo.js';

let n = 0;
const nuevaDB = () => abrirDB(`prueba-resp-${n++}`);
const hoy = '2026-11-24';

test('exportar, borrar e importar devuelve los mismos datos y sin la clave', async () => {
  const repo = await nuevaDB();
  await repo.guardarAjuste('geminiClave', 'SECRETA');
  const d1 = await repo.guardarMercado({ nombre: 'D1' });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  const fotoId = await repo.guardarFoto(new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }));
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 4500, fotoId }, hoy);
  await repo.guardarItem({ productoId: arroz.id, cantidad: 2000 });

  const datos = await exportarRespaldo(repo);
  expect(JSON.stringify(datos)).not.toContain('SECRETA');
  expect(datos.version).toBe(1);

  await repo.borrarTodo();
  expect(await repo.listarMercados()).toHaveLength(0);

  await importarRespaldo(repo, JSON.parse(JSON.stringify(datos)));
  expect((await repo.listarMercados()).map((m) => m.nombre)).toEqual(['D1']);
  expect((await repo.ofertasPorProducto()).get(arroz.id)[0].precioNormal).toBe(4500);
  expect(await repo.listarItems()).toHaveLength(1);
  const foto = await repo.leerFoto(fotoId);
  expect([...new Uint8Array(await foto.arrayBuffer())]).toEqual([1, 2, 3, 250]);
  expect(foto.type).toBe('image/jpeg');
});

test('importar un archivo ajeno falla con mensaje claro', async () => {
  const repo = await nuevaDB();
  await expect(importarRespaldo(repo, { hola: 1 })).rejects.toThrow('Este archivo no es un respaldo de Mercado');
});

test('importar conserva la clave de Gemini existente', async () => {
  const repo = await nuevaDB();
  await repo.guardarAjuste('geminiClave', 'MIA');
  await importarRespaldo(repo, { version: 1, mercados: [], productos: [], ofertas: [], lista: [], fotos: [] });
  expect(await repo.leerAjuste('geminiClave')).toBe('MIA');
});

test('necesitaRecordatorio', () => {
  expect(necesitaRecordatorio({ ultimoRespaldo: '2026-11-10', ultimoCambio: '2026-11-20', hoy: '2026-11-24' })).toBe(true);
  expect(necesitaRecordatorio({ ultimoRespaldo: '2026-11-10', ultimoCambio: '2026-11-20', hoy: '2026-11-23' })).toBe(false);
  expect(necesitaRecordatorio({ ultimoRespaldo: '2026-11-01', ultimoCambio: '2026-11-01', hoy: '2026-11-24' })).toBe(false);
  expect(necesitaRecordatorio({ primerCambio: '2026-11-01', ultimoCambio: '2026-11-02', hoy: '2026-11-24' })).toBe(true);
  expect(necesitaRecordatorio({ primerCambio: '2026-11-20', ultimoCambio: '2026-11-22', hoy: '2026-11-24' })).toBe(false);
  expect(necesitaRecordatorio({ hoy: '2026-11-24' })).toBe(false);
});
