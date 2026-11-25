import { TABLAS_SYNC } from './db.js';
import { normalizarNombre } from '../logica/nombres.js';

/**
 * Sincroniza el teléfono con la nube. El teléfono sigue siendo la fuente para usar la app sin señal:
 * primero baja lo que cambió en otros dispositivos, une productos repetidos y luego sube lo pendiente.
 * Regla de conflictos: por registro gana el cambio más reciente (actualizadoEn).
 *
 * `nube` implementa: subir(tabla, filas) → {rechazados: id[]}, bajar(tabla, desde) → {filas, hasta},
 * subirFoto(id, blob), bajarFoto(id) → Blob|null. Ver remoto-supabase.js.
 */
const enCurso = new WeakMap();

export function sincronizar(repo, nube) {
  if (!enCurso.has(repo)) {
    enCurso.set(repo, hacer(repo, nube).finally(() => enCurso.delete(repo)));
  }
  return enCurso.get(repo);
}

const esSinRed = (e) => Boolean(e?.sinRed) || e instanceof TypeError || /fetch|network|red/i.test(e?.message ?? '');

async function hacer(repo, nube) {
  const cuenta = { bajados: 0, subidos: 0 };
  try {
    // Primera vez en este teléfono: todo lo que ya había se sube (datos de antes de la sincronización).
    if (!(await repo.leerAjuste('syncInicial'))) await encolarTodo(repo);

    const desde = (await repo.leerAjuste('syncDesde')) ?? {};
    const alias = (await repo.leerAjuste('syncAlias')) ?? {};
    for (const tabla of TABLAS_SYNC) {
      const { filas, hasta } = await nube.bajar(tabla, desde[tabla] ?? null);
      for (const f of filas) cuenta.bajados += (await aplicar(repo, tabla, f, alias)) ? 1 : 0;
      desde[tabla] = hasta;
    }
    await unirRepetidos(repo, alias);
    await repo.guardarAjuste('syncAlias', alias);

    for (const tabla of TABLAS_SYNC) cuenta.subidos += await subirTabla(repo, nube, tabla);
    await bajarFotos(repo, nube);

    await repo.guardarAjuste('syncDesde', desde);
    await repo.guardarAjuste('syncInicial', true);
    await repo.guardarAjuste('ultimaSync', Date.now());
    return { ok: true, ...cuenta };
  } catch (e) {
    return { ok: false, sinRed: esSinRed(e), error: e?.message ?? String(e), ...cuenta };
  }
}

async function encolarTodo(repo) {
  for (const tabla of TABLAS_SYNC) {
    for (const id of await repo.db.getAllKeys(tabla)) await repo.pendiente(tabla, id);
  }
}

const marcaLocal = (local, pend) => local?.actualizadoEn ?? pend?.en ?? 0;

/** Aplica una fila de la nube si es más nueva que lo local. Devuelve true si cambió algo. */
async function aplicar(repo, tabla, f, alias) {
  const { db } = repo;
  const clave = `${tabla}:${f.id}`;
  const local = await db.get(tabla, f.id);
  const pend = await db.get('pendientes', clave);
  if (pend && marcaLocal(local, pend) >= f.actualizado_en) return false; // lo local es más nuevo: se sube después
  if (pend) await db.delete('pendientes', clave);

  if (f.borrado || !f.datos) {
    if (!local) return false;
    await db.delete(tabla, f.id);
    if (tabla === 'ofertas' && local.fotoId) await db.delete('fotos', local.fotoId);
    return true;
  }
  if (tabla === 'productos' && alias[f.id]) {
    await repo.pendiente('productos', f.id); // ya se unió a otro: vuelve a quedar borrado
    return false;
  }

  let r = { ...f.datos, id: f.id, actualizadoEn: f.actualizado_en };
  let reescrito = false;
  if ((tabla === 'ofertas' || tabla === 'lista') && alias[r.productoId]) {
    r = { ...r, productoId: alias[r.productoId], actualizadoEn: Date.now() };
    reescrito = true;
  }
  // Un solo precio por producto y mercado, y un solo ítem por producto en la lista: gana el más nuevo.
  const otra = tabla === 'ofertas'
    ? await db.getFromIndex('ofertas', 'porProductoMercado', [r.productoId, r.mercadoId])
    : tabla === 'lista' ? (await db.getAll('lista')).find((i) => i.productoId === r.productoId) : null;
  if (otra && otra.id !== r.id) {
    if ((otra.actualizadoEn ?? 0) >= r.actualizadoEn) {
      await repo.pendiente(tabla, r.id);
      return false;
    }
    await db.delete(tabla, otra.id);
    await repo.pendiente(tabla, otra.id);
  }
  await db.put(tabla, r);
  if (reescrito) await repo.pendiente(tabla, r.id);
  return true;
}

/** Une productos con el mismo nombre (sin mayúsculas, tildes ni espacios de más): gana el de id menor en todos los dispositivos. */
async function unirRepetidos(repo, alias) {
  const { db } = repo;
  const grupos = new Map();
  for (const p of await db.getAll('productos')) {
    const k = normalizarNombre(p.nombre);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }
  const ahora = Date.now();
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    grupo.sort((a, b) => (a.id < b.id ? -1 : 1));
    const [gana, ...pierden] = grupo;
    for (const p of pierden) {
      alias[p.id] = gana.id;
      if (!gana.tipoUnidad && p.tipoUnidad) {
        gana.tipoUnidad = p.tipoUnidad;
        gana.actualizadoEn = ahora;
        await db.put('productos', gana);
        await repo.pendiente('productos', gana.id);
      }
      for (const o of await db.getAllFromIndex('ofertas', 'porProducto', p.id)) {
        const ya = await db.getFromIndex('ofertas', 'porProductoMercado', [gana.id, o.mercadoId]);
        if (ya && (ya.actualizadoEn ?? 0) >= (o.actualizadoEn ?? 0)) {
          await db.delete('ofertas', o.id);
          await repo.pendiente('ofertas', o.id);
          continue;
        }
        if (ya) {
          await db.delete('ofertas', ya.id);
          await repo.pendiente('ofertas', ya.id);
        }
        await db.put('ofertas', { ...o, productoId: gana.id, actualizadoEn: ahora });
        await repo.pendiente('ofertas', o.id);
      }
      const lista = await db.getAll('lista');
      for (const i of lista.filter((x) => x.productoId === p.id)) {
        const ya = lista.find((x) => x.productoId === gana.id);
        if (ya) {
          await db.delete('lista', i.id);
        } else {
          await db.put('lista', { ...i, productoId: gana.id, actualizadoEn: ahora });
        }
        await repo.pendiente('lista', i.id);
      }
      await db.delete('productos', p.id);
      await repo.pendiente('productos', p.id);
    }
  }
}

async function subirTabla(repo, nube, tabla) {
  const { db } = repo;
  const pendientes = (await db.getAll('pendientes')).filter((p) => p.tabla === tabla);
  if (!pendientes.length) return 0;
  const enviados = new Map();
  const filas = [];
  for (const p of pendientes) {
    const rec = await db.get(tabla, p.id);
    if (rec) {
      if (tabla === 'ofertas' && rec.fotoId) await subirFoto(repo, nube, rec.fotoId);
      filas.push({
        id: p.id, datos: rec, actualizado_en: rec.actualizadoEn ?? 0, borrado: false,
        ...(tabla === 'productos' ? { nombre_normalizado: normalizarNombre(rec.nombre) } : {}),
      });
    } else {
      filas.push({
        id: p.id, datos: null, actualizado_en: p.en ?? Date.now(), borrado: true,
        ...(tabla === 'productos' ? { nombre_normalizado: null } : {}),
      });
    }
    enviados.set(p.id, rec?.actualizadoEn ?? null);
  }
  // Primero los borrados: así un producto unido deja libre su nombre antes de subir el que queda.
  filas.sort((a, b) => Number(b.borrado) - Number(a.borrado));
  const { rechazados = [] } = await nube.subir(tabla, filas);
  const malos = new Set(rechazados);
  let subidos = 0;
  for (const [id, marca] of enviados) {
    if (malos.has(id)) continue;
    const ahora = await db.get(tabla, id);
    if ((ahora?.actualizadoEn ?? null) !== marca) continue; // cambió mientras se subía: queda pendiente
    await db.delete('pendientes', `${tabla}:${id}`);
    subidos++;
  }
  return subidos;
}

async function subirFoto(repo, nube, fotoId) {
  const subidas = new Set((await repo.leerAjuste('fotosSubidas')) ?? []);
  if (subidas.has(fotoId)) return;
  const blob = await repo.leerFoto(fotoId);
  if (!blob) return;
  await nube.subirFoto(fotoId, blob);
  subidas.add(fotoId);
  await repo.guardarAjuste('fotosSubidas', [...subidas]);
}

async function bajarFotos(repo, nube) {
  const { db } = repo;
  const subidas = new Set((await repo.leerAjuste('fotosSubidas')) ?? []);
  for (const o of await db.getAll('ofertas')) {
    if (!o.fotoId || (await db.getKey('fotos', o.fotoId))) continue;
    try {
      const blob = await nube.bajarFoto(o.fotoId);
      if (!blob) continue;
      await db.put('fotos', { id: o.fotoId, datos: await blob.arrayBuffer(), tipo: blob.type || 'image/jpeg' });
      subidas.add(o.fotoId);
    } catch (e) {
      if (esSinRed(e)) throw e;
    }
  }
  await repo.guardarAjuste('fotosSubidas', [...subidas]);
}
