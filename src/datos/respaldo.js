import { diasEntre, hoyLocal } from '../logica/fechas.js';

const DIAS_RECORDATORIO = 14;

const aBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const deBase64 = (s) => {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

/** Todo menos los ajustes (la clave de Gemini nunca sale del teléfono). */
export async function exportarRespaldo(repo) {
  const { db } = repo;
  const ofertas = await db.getAll('ofertas');
  const usadas = new Set(ofertas.map((o) => o.fotoId).filter(Boolean));
  const fotos = (await db.getAll('fotos'))
    .filter((f) => usadas.has(f.id))
    .map((f) => ({ id: f.id, tipo: f.tipo, base64: aBase64(f.datos) }));
  return {
    version: 1,
    exportado: hoyLocal(),
    mercados: await db.getAll('mercados'),
    productos: await db.getAll('productos'),
    ofertas,
    lista: await db.getAll('lista'),
    fotos,
  };
}

const NO_ES_RESPALDO = 'Este archivo no es un respaldo de Mercado';
const tieneId = (r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id;

/** Valida y prepara todo ANTES de tocar la base: un archivo dañado nunca borra datos. */
function prepararRespaldo(datos) {
  const listas = ['mercados', 'productos', 'ofertas', 'lista', 'fotos'];
  if (!datos || datos.version !== 1 || !listas.every((k) => Array.isArray(datos[k] ?? []))) throw new Error(NO_ES_RESPALDO);
  const r = {};
  for (const a of ['mercados', 'productos', 'ofertas', 'lista']) {
    r[a] = datos[a] ?? [];
    if (!r[a].every(tieneId)) throw new Error(NO_ES_RESPALDO);
  }
  if (!r.ofertas.every((o) => o.productoId && o.mercadoId)) throw new Error(NO_ES_RESPALDO);
  if (!r.lista.every((i) => i.productoId)) throw new Error(NO_ES_RESPALDO);
  try {
    r.fotos = (datos.fotos ?? []).map((f) => {
      if (!tieneId(f) || typeof f.base64 !== 'string') throw new Error();
      return { id: f.id, tipo: f.tipo || 'image/jpeg', datos: deBase64(f.base64) };
    });
  } catch {
    throw new Error(NO_ES_RESPALDO);
  }
  return r;
}

export async function importarRespaldo(repo, datos) {
  const listo = prepararRespaldo(datos);
  const almacenes = ['mercados', 'productos', 'ofertas', 'lista', 'fotos'];
  const tx = repo.db.transaction(almacenes, 'readwrite');
  try {
    for (const a of almacenes) await tx.objectStore(a).clear();
    for (const a of almacenes) for (const r of listo[a]) await tx.objectStore(a).put(r);
    await tx.done;
  } catch (e) {
    try { tx.abort(); } catch { /* ya terminó */ }
    throw new Error(NO_ES_RESPALDO, { cause: e });
  }
  await repo.guardarAjuste('ultimoRespaldo', hoyLocal());
}

/**
 * ¿Mostrar el aviso de respaldo? Hay cambios sin respaldar y pasaron 14+ días
 * desde el último respaldo (o desde el primer cambio, si nunca se respaldó).
 */
export function necesitaRecordatorio({ ultimoRespaldo, ultimoCambio, primerCambio, hoy }) {
  if (!ultimoCambio) return false;
  if (ultimoRespaldo && ultimoCambio <= ultimoRespaldo) return false;
  const desde = ultimoRespaldo || primerCambio;
  if (!desde) return false;
  return diasEntre(desde, hoy) >= DIAS_RECORDATORIO;
}
