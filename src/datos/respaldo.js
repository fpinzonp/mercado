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
  const fotos = (await db.getAll('fotos')).map((f) => ({ id: f.id, tipo: f.tipo, base64: aBase64(f.datos) }));
  return {
    version: 1,
    exportado: hoyLocal(),
    mercados: await db.getAll('mercados'),
    productos: await db.getAll('productos'),
    ofertas: await db.getAll('ofertas'),
    lista: await db.getAll('lista'),
    fotos,
  };
}

export async function importarRespaldo(repo, datos) {
  const listas = ['mercados', 'productos', 'ofertas', 'lista', 'fotos'];
  if (!datos || datos.version !== 1 || !listas.every((k) => Array.isArray(datos[k] ?? []))) {
    throw new Error('Este archivo no es un respaldo de Mercado');
  }
  const { db } = repo;
  const tx = db.transaction(listas, 'readwrite');
  for (const a of listas) await tx.objectStore(a).clear();
  for (const a of ['mercados', 'productos', 'ofertas', 'lista']) {
    for (const r of datos[a] ?? []) await tx.objectStore(a).put(r);
  }
  for (const f of datos.fotos ?? []) {
    await tx.objectStore('fotos').put({ id: f.id, tipo: f.tipo || 'image/jpeg', datos: deBase64(f.base64) });
  }
  await tx.done;
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
