import { openDB, deleteDB } from 'idb';
import { fusionarOferta } from '../logica/ofertas.js';
import { hoyLocal } from '../logica/fechas.js';
import { precioEfectivo } from '../logica/comparar.js';

const VERSION = 3;
export const TABLAS_SYNC = ['mercados', 'productos', 'ofertas', 'lista', 'compras'];
const DEFAULTS = {};
// randomUUID solo existe en contexto seguro (https); en http de la red local se arma a mano.
const nuevoId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

/**
 * Abre la base local y devuelve el repositorio.
 * Las fotos se guardan como ArrayBuffer (+ tipo) porque Safari ha tenido problemas guardando Blobs.
 */
export async function abrirDB(nombre = 'mercado') {
  const db = await openDB(nombre, VERSION, {
    upgrade(db, viejaVersion) {
      if (viejaVersion < 1) crearAlmacenes(db);
      // v2: cambios pendientes de subir a la nube (también los borrados).
      if (viejaVersion < 2) db.createObjectStore('pendientes', { keyPath: 'clave' });
      // v3: historial de compras (no se borra al empezar una lista nueva).
      if (viejaVersion < 3) db.createObjectStore('compras', { keyPath: 'id' }).createIndex('porProducto', 'productoId');
    },
  });
  function crearAlmacenes(db) {
      db.createObjectStore('mercados', { keyPath: 'id' });
      db.createObjectStore('productos', { keyPath: 'id' });
      const of = db.createObjectStore('ofertas', { keyPath: 'id' });
      of.createIndex('porProducto', 'productoId');
      of.createIndex('porMercado', 'mercadoId');
      of.createIndex('porProductoMercado', ['productoId', 'mercadoId'], { unique: true });
      db.createObjectStore('fotos', { keyPath: 'id' });
      db.createObjectStore('lista', { keyPath: 'id' });
      db.createObjectStore('ajustes', { keyPath: 'clave' });
  }

  async function leerAjuste(clave) {
    const r = await db.get('ajustes', clave);
    return r ? r.valor : DEFAULTS[clave];
  }
  async function guardarAjuste(clave, valor) {
    if (valor === undefined || valor === null) await db.delete('ajustes', clave);
    else await db.put('ajustes', { clave, valor });
  }
  const oyentes = new Set();
  async function marcarCambio() {
    const hoy = hoyLocal();
    await guardarAjuste('ultimoCambio', hoy);
    if (!(await leerAjuste('primerCambio'))) await guardarAjuste('primerCambio', hoy);
    for (const fn of oyentes) fn();
  }
  /** Anota el registro como pendiente de subir (dentro de la transacción dada o sola). */
  async function pendiente(tabla, id, tx) {
    const r = { clave: `${tabla}:${id}`, tabla, id, en: Date.now() };
    if (tx) await tx.objectStore('pendientes').put(r);
    else await db.put('pendientes', r);
  }
  const sellar = (r) => ({ ...r, actualizadoEn: Date.now() });

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');

  return {
    db,
    nombre,

    // Mercados
    async listarMercados() {
      return (await db.getAll('mercados')).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || porNombre(a, b));
    },
    async guardarMercado(m) {
      const r = sellar({ ...m, id: m.id ?? nuevoId(), nombre: m.nombre.trim() });
      if (r.orden == null) r.orden = (await db.count('mercados'));
      await db.put('mercados', r);
      await pendiente('mercados', r.id);
      await marcarCambio();
      return r;
    },
    async borrarMercado(id) {
      const tx = db.transaction(['mercados', 'ofertas', 'fotos', 'pendientes'], 'readwrite');
      await tx.objectStore('mercados').delete(id);
      await pendiente('mercados', id, tx);
      const idx = tx.objectStore('ofertas').index('porMercado');
      for (const o of await idx.getAll(id)) {
        await tx.objectStore('ofertas').delete(o.id);
        await pendiente('ofertas', o.id, tx);
        if (o.fotoId) await tx.objectStore('fotos').delete(o.fotoId);
      }
      await tx.done;
      await marcarCambio();
    },

    // Productos
    async listarProductos() {
      return (await db.getAll('productos')).sort(porNombre);
    },
    async guardarProducto(p) {
      const r = sellar({ ...p, id: p.id ?? nuevoId(), nombre: p.nombre.trim() });
      await db.put('productos', r);
      await pendiente('productos', r.id);
      await marcarCambio();
      return r;
    },

    // Ofertas
    async ofertasPorProducto() {
      const mapa = new Map();
      for (const o of await db.getAll('ofertas')) {
        if (!mapa.has(o.productoId)) mapa.set(o.productoId, []);
        mapa.get(o.productoId).push(o);
      }
      return mapa;
    },
    async guardarOferta(parcial, hoy = hoyLocal()) {
      const anterior = await db.getFromIndex('ofertas', 'porProductoMercado', [parcial.productoId, parcial.mercadoId]);
      const r = fusionarOferta(anterior, parcial, hoy);
      r.id = anterior?.id ?? nuevoId();
      r.actualizadoEn = Date.now();
      await db.put('ofertas', r);
      await pendiente('ofertas', r.id);
      if (anterior?.fotoId && anterior.fotoId !== r.fotoId) await db.delete('fotos', anterior.fotoId);
      await marcarCambio();
      return r;
    },

    // Fotos
    async guardarFoto(blob) {
      const id = nuevoId();
      await db.put('fotos', { id, datos: await blob.arrayBuffer(), tipo: blob.type || 'image/jpeg' });
      return id;
    },
    async leerFoto(id) {
      const r = id ? await db.get('fotos', id) : undefined;
      return r ? new Blob([r.datos], { type: r.tipo }) : undefined;
    },

    // Lista
    async listarItems() {
      return (await db.getAll('lista')).sort((a, b) => (a.creado ?? 0) - (b.creado ?? 0));
    },
    async guardarItem(item) {
      const r = sellar({ tachado: false, creado: Date.now(), ...item, id: item.id ?? nuevoId() });
      await db.put('lista', r);
      await pendiente('lista', r.id);
      await marcarCambio();
      return r;
    },
    async borrarItem(id) {
      await db.delete('lista', id);
      await pendiente('lista', id);
      await marcarCambio();
    },
    /** Tacha o destacha. Al tachar en un mercado guarda la compra (precio pagado y si tenía descuento). */
    async tacharItem(id, mercadoId, hoy = hoyLocal()) {
      const item = await db.get('lista', id);
      if (!item) return undefined;
      if (item.tachado) {
        item.tachado = false;
        delete item.compradoEn;
        if (item.compraId) {
          await db.delete('compras', item.compraId); // destachar = fue un error: esa compra no pasó
          await pendiente('compras', item.compraId);
          delete item.compraId;
        }
      } else {
        item.tachado = true;
        if (mercadoId) {
          item.compradoEn = mercadoId;
          const oferta = await db.getFromIndex('ofertas', 'porProductoMercado', [item.productoId, mercadoId]);
          const pagado = oferta?.precioNormal > 0 ? precioEfectivo(oferta, hoy) : null;
          const compra = sellar({
            id: nuevoId(), productoId: item.productoId, mercadoId, fecha: hoy,
            precio: pagado?.precio ?? null, precioNormal: oferta?.precioNormal ?? null, conDescuento: pagado?.conDescuento ?? false,
          });
          await db.put('compras', compra);
          await pendiente('compras', compra.id);
          item.compraId = compra.id;
        }
      }
      item.actualizadoEn = Date.now();
      await db.put('lista', item);
      await pendiente('lista', id);
      await marcarCambio();
      return item;
    },
    async nuevaLista(modo) {
      const tx = db.transaction(['lista', 'pendientes'], 'readwrite');
      const lista = tx.objectStore('lista');
      for (const item of await lista.getAll()) {
        if (modo === 'vaciar') {
          await lista.delete(item.id);
        } else {
          item.tachado = false;
          delete item.compradoEn;
          delete item.compraId; // la compra queda en el historial
          item.actualizadoEn = Date.now();
          await lista.put(item);
        }
        await pendiente('lista', item.id, tx);
      }
      await tx.done;
      await marcarCambio();
    },

    // Historial de compras
    async listarCompras() {
      return (await db.getAll('compras')).sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.actualizadoEn ?? 0) - (a.actualizadoEn ?? 0)));
    },

    // Ajustes
    leerAjuste,
    guardarAjuste,

    // Sincronización
    pendiente,
    /** fn() se llama después de cada cambio local (para sincronizar sin que el usuario lo pida). */
    alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },

    async borrarTodo() {
      // Solo este teléfono: no anota borrados para la nube.
      const almacenes = ['mercados', 'productos', 'ofertas', 'fotos', 'lista', 'compras', 'pendientes'];
      const tx = db.transaction([...almacenes, 'ajustes'], 'readwrite');
      for (const a of almacenes) await tx.objectStore(a).clear();
      await tx.objectStore('ajustes').clear(); // también la sesión de sincronización de este teléfono
      await tx.done;
    },
  };
}

export { deleteDB };
