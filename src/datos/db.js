import { openDB, deleteDB } from 'idb';
import { fusionarOferta } from '../logica/ofertas.js';
import { hoyLocal } from '../logica/fechas.js';

const VERSION = 1;
const DEFAULTS = { geminiModelo: 'gemini-flash-latest' };
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
    upgrade(db) {
      db.createObjectStore('mercados', { keyPath: 'id' });
      db.createObjectStore('productos', { keyPath: 'id' });
      const of = db.createObjectStore('ofertas', { keyPath: 'id' });
      of.createIndex('porProducto', 'productoId');
      of.createIndex('porMercado', 'mercadoId');
      of.createIndex('porProductoMercado', ['productoId', 'mercadoId'], { unique: true });
      db.createObjectStore('fotos', { keyPath: 'id' });
      db.createObjectStore('lista', { keyPath: 'id' });
      db.createObjectStore('ajustes', { keyPath: 'clave' });
    },
  });

  async function leerAjuste(clave) {
    const r = await db.get('ajustes', clave);
    return r ? r.valor : DEFAULTS[clave];
  }
  async function guardarAjuste(clave, valor) {
    if (valor === undefined || valor === null) await db.delete('ajustes', clave);
    else await db.put('ajustes', { clave, valor });
  }
  async function marcarCambio() {
    const hoy = hoyLocal();
    await guardarAjuste('ultimoCambio', hoy);
    if (!(await leerAjuste('primerCambio'))) await guardarAjuste('primerCambio', hoy);
  }

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');

  return {
    db,
    nombre,

    // Mercados
    async listarMercados() {
      return (await db.getAll('mercados')).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || porNombre(a, b));
    },
    async guardarMercado(m) {
      const r = { ...m, id: m.id ?? nuevoId(), nombre: m.nombre.trim() };
      if (r.orden == null) r.orden = (await db.count('mercados'));
      await db.put('mercados', r);
      await marcarCambio();
      return r;
    },
    async borrarMercado(id) {
      const tx = db.transaction(['mercados', 'ofertas', 'fotos'], 'readwrite');
      await tx.objectStore('mercados').delete(id);
      const idx = tx.objectStore('ofertas').index('porMercado');
      for (const o of await idx.getAll(id)) {
        await tx.objectStore('ofertas').delete(o.id);
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
      const r = { ...p, id: p.id ?? nuevoId(), nombre: p.nombre.trim() };
      await db.put('productos', r);
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
      await db.put('ofertas', r);
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
      const r = { tachado: false, creado: Date.now(), ...item, id: item.id ?? nuevoId() };
      await db.put('lista', r);
      await marcarCambio();
      return r;
    },
    async borrarItem(id) {
      await db.delete('lista', id);
      await marcarCambio();
    },
    async tacharItem(id, mercadoId) {
      const item = await db.get('lista', id);
      if (!item) return undefined;
      if (item.tachado) {
        item.tachado = false;
        delete item.compradoEn;
      } else {
        item.tachado = true;
        if (mercadoId) item.compradoEn = mercadoId;
      }
      await db.put('lista', item);
      await marcarCambio();
      return item;
    },
    async nuevaLista(modo) {
      const tx = db.transaction('lista', 'readwrite');
      if (modo === 'vaciar') {
        await tx.store.clear();
      } else {
        for (const item of await tx.store.getAll()) {
          item.tachado = false;
          delete item.compradoEn;
          await tx.store.put(item);
        }
      }
      await tx.done;
      await marcarCambio();
    },

    // Ajustes
    leerAjuste,
    guardarAjuste,

    async borrarTodo() {
      const almacenes = ['mercados', 'productos', 'ofertas', 'fotos', 'lista'];
      const tx = db.transaction([...almacenes, 'ajustes'], 'readwrite');
      for (const a of almacenes) await tx.objectStore(a).clear();
      for (const c of ['ultimoCambio', 'primerCambio', 'ultimoRespaldo', 'mercadoActivo', 'ultimoMercadoPrecio']) {
        await tx.objectStore('ajustes').delete(c);
      }
      await tx.done;
    },
  };
}

export { deleteDB };
