import 'fake-indexeddb/auto';
import { test, expect, vi, afterEach } from 'vitest';
import { openDB } from 'idb';
import { abrirDB } from '../../src/datos/db.js';
import { sincronizar } from '../../src/datos/sync.js';
import { normalizarNombre } from '../../src/logica/nombres.js';

const hoy = '2026-11-24';
let n = 0;
const nuevoRepo = () => abrirDB(`sync-${n++}`);
afterEach(() => vi.restoreAllMocks());

/** Servidor falso con las mismas reglas que supabase/esquema.sql. */
class NubeFalsa {
  constructor() {
    this.tablas = { mercados: new Map(), productos: new Map(), ofertas: new Map(), lista: new Map(), compras: new Map() };
    this.fotos = new Map();
    this.reloj = 0;
    this.caida = false;
  }
  revisar() { if (this.caida) throw Object.assign(new Error('Failed to fetch'), { sinRed: true }); }
  async subir(tabla, filas) {
    this.revisar();
    const rechazados = [];
    for (const f of filas) {
      const t = this.tablas[tabla];
      const antes = t.get(f.id);
      if (antes && f.actualizado_en < antes.actualizado_en) continue;
      if (tabla === 'productos' && !f.borrado
        && [...t.values()].some((o) => o.id !== f.id && !o.borrado && o.nombre_normalizado === f.nombre_normalizado)) {
        rechazados.push(f.id);
        continue;
      }
      t.set(f.id, structuredClone({ ...f, modificado: ++this.reloj }));
    }
    return { rechazados };
  }
  async bajar(tabla, desde) {
    this.revisar();
    const filas = [...this.tablas[tabla].values()].filter((f) => f.modificado > (desde ?? 0));
    return { filas: structuredClone(filas), hasta: Math.max(desde ?? 0, ...filas.map((f) => f.modificado)) };
  }
  async subirFoto(id, blob) { this.revisar(); this.fotos.set(id, blob); }
  async bajarFoto(id) { this.revisar(); return this.fotos.get(id) ?? null; }
  vivos(tabla) { return [...this.tablas[tabla].values()].filter((f) => !f.borrado); }
}

async function conDatos(repo) {
  const d1 = await repo.guardarMercado({ id: 'm-d1', nombre: 'D1' });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  const oferta = await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  const item = await repo.guardarItem({ productoId: arroz.id });
  return { d1, arroz, oferta, item };
}

test('migración: lo que ya estaba en el teléfono se sube completo la primera vez', async () => {
  const repo = await nuevoRepo();
  await conDatos(repo);
  await repo.db.clear('pendientes'); // como si los datos vinieran de la versión anterior, sin pendientes
  const nube = new NubeFalsa();
  const r = await sincronizar(repo, nube);
  expect(r.ok).toBe(true);
  expect(nube.vivos('mercados')).toHaveLength(1);
  expect(nube.vivos('productos')[0]).toMatchObject({ nombre_normalizado: 'arroz', datos: { nombre: 'Arroz' } });
  expect(nube.vivos('ofertas')[0].datos).toMatchObject({ precioNormal: 4500 });
  expect(nube.vivos('lista')).toHaveLength(1);
  expect(await repo.db.count('pendientes')).toBe(0);
});

test('actualizar la base del teléfono de la versión 1 a la 2 conserva los datos', async () => {
  const nombre = `sync-v1-${n++}`;
  const vieja = await openDB(nombre, 1, {
    upgrade(db) {
      for (const s of ['mercados', 'productos', 'fotos', 'lista']) db.createObjectStore(s, { keyPath: 'id' });
      const of = db.createObjectStore('ofertas', { keyPath: 'id' });
      of.createIndex('porProducto', 'productoId');
      of.createIndex('porMercado', 'mercadoId');
      of.createIndex('porProductoMercado', ['productoId', 'mercadoId'], { unique: true });
      db.createObjectStore('ajustes', { keyPath: 'clave' });
    },
  });
  await vieja.put('mercados', { id: 'm1', nombre: 'D1', orden: 0 });
  await vieja.put('lista', { id: 'i1', productoId: 'p1', cantidad: 2000, tachado: false });
  vieja.close();
  const repo = await abrirDB(nombre);
  expect((await repo.listarMercados()).map((m) => m.nombre)).toEqual(['D1']);
  expect((await repo.listarItems())[0].cantidad).toBe(2000);
  expect(repo.db.objectStoreNames.contains('pendientes')).toBe(true);
});

test('dos dispositivos terminan con la misma información', async () => {
  const nube = new NubeFalsa();
  const a = await nuevoRepo();
  const b = await nuevoRepo();
  const { arroz } = await conDatos(a);
  await sincronizar(a, nube);
  await sincronizar(b, nube);
  expect((await b.listarProductos()).map((p) => p.nombre)).toEqual(['Arroz']);
  expect((await b.ofertasPorProducto()).get(arroz.id)[0]).toMatchObject({ nombreReal: 'Arroz Diana', precioNormal: 4500 });
  expect(await b.listarItems()).toHaveLength(1);
  expect(await b.db.count('pendientes')).toBe(0);
});

test('conflicto: si dos dispositivos cambian el mismo precio, gana el cambio más reciente', async () => {
  const nube = new NubeFalsa();
  const a = await nuevoRepo();
  const b = await nuevoRepo();
  const { d1, arroz } = await conDatos(a);
  await sincronizar(a, nube);
  await sincronizar(b, nube);
  const ahora = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(ahora + 1000);
  await a.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, precioNormal: 4000 }, hoy);
  Date.now.mockReturnValue(ahora + 2000);
  await b.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, precioNormal: 4200 }, hoy);
  // B sube primero el más nuevo; A llega tarde con el más viejo.
  await sincronizar(b, nube);
  await sincronizar(a, nube);
  await sincronizar(b, nube);
  expect((await a.ofertasPorProducto()).get(arroz.id)[0].precioNormal).toBe(4200);
  expect((await b.ofertasPorProducto()).get(arroz.id)[0].precioNormal).toBe(4200);
  expect(nube.vivos('ofertas')[0].datos.precioNormal).toBe(4200);
});

test('sin internet: no se pierde nada y se sube cuando vuelve la señal', async () => {
  const nube = new NubeFalsa();
  const repo = await nuevoRepo();
  await conDatos(repo);
  nube.caida = true;
  const r = await sincronizar(repo, nube);
  expect(r).toMatchObject({ ok: false, sinRed: true });
  expect(await repo.listarProductos()).toHaveLength(1);
  expect(await repo.db.count('pendientes')).toBeGreaterThan(0);
  nube.caida = false;
  expect((await sincronizar(repo, nube)).ok).toBe(true);
  expect(nube.vivos('ofertas')).toHaveLength(1);
  expect(await repo.db.count('pendientes')).toBe(0);
});

test('productos repetidos en dos dispositivos se unen en uno solo con todos sus precios', async () => {
  const nube = new NubeFalsa();
  const a = await nuevoRepo();
  const b = await nuevoRepo();
  const ma = await a.guardarMercado({ id: 'm-d1', nombre: 'D1' });
  const cafeA = await a.guardarProducto({ nombre: 'Café' });
  await a.guardarOferta({ productoId: cafeA.id, mercadoId: ma.id, nombreReal: 'Sello Rojo', tamano: 500, precioNormal: 15000 }, hoy);
  await sincronizar(a, nube);
  const mb = await b.guardarMercado({ id: 'm-ara', nombre: 'Ara' });
  const cafeB = await b.guardarProducto({ nombre: ' cafe ' });
  await b.guardarOferta({ productoId: cafeB.id, mercadoId: mb.id, nombreReal: 'Águila Roja', tamano: 500, precioNormal: 13000 }, hoy);
  await b.guardarItem({ productoId: cafeB.id });
  await sincronizar(b, nube);
  await sincronizar(a, nube);
  for (const repo of [a, b]) {
    const productos = await repo.listarProductos();
    expect(productos).toHaveLength(1);
    const ofertas = (await repo.ofertasPorProducto()).get(productos[0].id);
    expect(ofertas.map((o) => o.nombreReal).sort()).toEqual(['Sello Rojo', 'Águila Roja']);
    expect((await repo.listarItems()).map((i) => i.productoId)).toEqual([productos[0].id]);
  }
  expect(nube.vivos('productos')).toHaveLength(1);
});

test('borrar en un dispositivo lo borra en el otro', async () => {
  const nube = new NubeFalsa();
  const a = await nuevoRepo();
  const b = await nuevoRepo();
  const { item } = await conDatos(a);
  await sincronizar(a, nube);
  await sincronizar(b, nube);
  await a.borrarItem(item.id);
  await sincronizar(a, nube);
  await sincronizar(b, nube);
  expect(await b.listarItems()).toHaveLength(0);
});

test('las fotos de los precios viajan entre dispositivos', async () => {
  const nube = new NubeFalsa();
  const a = await nuevoRepo();
  const b = await nuevoRepo();
  const d1 = await a.guardarMercado({ nombre: 'D1' });
  const arroz = await a.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  const fotoId = await a.guardarFoto(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
  await a.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 4500, fotoId }, hoy);
  await sincronizar(a, nube);
  await sincronizar(b, nube);
  const foto = await b.leerFoto(fotoId);
  expect([...new Uint8Array(await foto.arrayBuffer())]).toEqual([1, 2, 3]);
});

test('normalizarNombre ignora mayúsculas, tildes y espacios de más', () => {
  expect(normalizarNombre('  Café   Sello ')).toBe('cafe sello');
  expect(normalizarNombre('ARROZ')).toBe(normalizarNombre('arroz'));
});

test('mercados con el mismo nombre en dos dispositivos se unen sin perder precios', async () => {
  const nube = new NubeFalsa();
  const a = await nuevoRepo();
  const b = await nuevoRepo();
  const d1a = await a.guardarMercado({ nombre: 'D1' });
  const arroz = await a.guardarProducto({ id: 'p-arroz', nombre: 'Arroz', tipoUnidad: 'g' });
  await a.guardarOferta({ productoId: arroz.id, mercadoId: d1a.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  await sincronizar(a, nube);
  const d1b = await b.guardarMercado({ nombre: ' d1 ' });
  const ara = await b.guardarMercado({ nombre: 'Ara' });
  const item = await b.guardarItem({ productoId: 'p-arroz' });
  await b.tacharItem(item.id, d1b.id);
  await b.guardarAjuste('mercadoActivo', d1b.id);
  await sincronizar(b, nube);
  await sincronizar(a, nube);
  for (const repo of [a, b]) {
    const mercados = await repo.listarMercados();
    expect(mercados.map((m) => m.nombre.toLowerCase()).sort()).toEqual(['ara', 'd1']);
    const d1 = mercados.find((m) => m.nombre.trim().toLowerCase() === 'd1');
    expect((await repo.ofertasPorProducto()).get('p-arroz')[0].mercadoId).toBe(d1.id);
    expect((await repo.listarItems())[0].compradoEn).toBe(d1.id);
  }
  expect(await b.leerAjuste('mercadoActivo')).toBe((await b.listarMercados()).find((m) => m.nombre.trim().toLowerCase() === 'd1').id);
  void ara;
});

test('el historial de compras viaja entre dispositivos y sigue a los productos unidos', async () => {
  const nube = new NubeFalsa();
  const a = await nuevoRepo();
  const b = await nuevoRepo();
  const d1 = await a.guardarMercado({ id: 'm-d1', nombre: 'D1' });
  const cafeA = await a.guardarProducto({ id: 'p-z', nombre: 'Café' });
  await a.guardarOferta({ productoId: cafeA.id, mercadoId: d1.id, tamano: 500, precioNormal: 15000 }, hoy);
  const item = await a.guardarItem({ productoId: cafeA.id });
  await a.tacharItem(item.id, d1.id, hoy);
  await sincronizar(a, nube);
  await b.guardarProducto({ id: 'p-a', nombre: 'cafe' });
  await sincronizar(b, nube);
  await sincronizar(a, nube);
  for (const repo of [a, b]) {
    const [c] = await repo.listarCompras();
    expect(c).toMatchObject({ productoId: 'p-a', mercadoId: 'm-d1', precio: 15000, conDescuento: false });
  }
});

test('si el servidor todavía no tiene una tabla, lo demás se sincroniza igual', async () => {
  const nube = new NubeFalsa();
  delete nube.tablas.compras;
  const original = nube.bajar.bind(nube);
  const sinTabla = () => Object.assign(new Error('relation does not exist'), { tablaFalta: true });
  nube.bajar = async (t, d) => { if (!nube.tablas[t]) throw sinTabla(); return original(t, d); };
  const subirOriginal = nube.subir.bind(nube);
  nube.subir = async (t, f) => { if (!nube.tablas[t]) throw sinTabla(); return subirOriginal(t, f); };
  const repo = await nuevoRepo();
  const { item, d1 } = await conDatos(repo);
  await repo.tacharItem(item.id, d1.id, hoy);
  const r = await sincronizar(repo, nube);
  expect(r.ok).toBe(true);
  expect(nube.vivos('ofertas')).toHaveLength(1);
  expect(await repo.db.count('pendientes')).toBe(1); // la compra espera a que exista la tabla
});
