import { SUPABASE_URL, SUPABASE_CLAVE } from '../datos/config.js';

/**
 * Lectura de fotos con IA a través de la función "leer-foto" de Supabase.
 * La clave de Gemini y las instrucciones viven en el servidor (supabase/functions/leer-foto);
 * el teléfono solo manda la foto con la sesión del usuario.
 */
export class ErrorIA extends Error {
  /** @param {'sin_sesion'|'sin_red'|'limite'|'no_configurado'|'respuesta_invalida'} codigo */
  constructor(codigo, mensaje) {
    super(mensaje || codigo);
    this.name = 'ErrorIA';
    this.codigo = codigo;
  }
}

const URL_FUNCION = `${SUPABASE_URL}/functions/v1/leer-foto`;

async function aBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Texto JSON de la respuesta de generateContent, ya parseado. */
function jsonDeRespuesta(cuerpo) {
  const texto = cuerpo?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const datos = JSON.parse(limpio);
    if (datos && typeof datos === 'object') return datos;
  } catch { /* abajo */ }
  throw new ErrorIA('respuesta_invalida', 'La IA no devolvió JSON');
}

/** Saca {nombre, tamano, unidad} de la respuesta. */
export function parseRespuestaGemini(cuerpo) {
  const datos = jsonDeRespuesta(cuerpo);
  if (typeof datos.nombre !== 'string' || !datos.nombre.trim()) {
    throw new ErrorIA('respuesta_invalida', 'La IA no devolvió el nombre');
  }
  return { nombre: datos.nombre.trim(), tamano: datos.tamano ?? null, unidad: datos.unidad ?? null };
}

export async function leerEtiquetaGemini(blob, opciones = {}) {
  return parseRespuestaGemini(await pedir(blob, 'producto', opciones));
}

/** Datos crudos del tag de precio (se limpian con normalizarTag). */
export async function leerTagGemini(blob, opciones = {}) {
  return jsonDeRespuesta(await pedir(blob, 'tag', opciones));
}

async function pedir(blob, tipo, { token, fetchImpl = globalThis.fetch, espera = 20000 } = {}) {
  if (!token) throw new ErrorIA('sin_sesion');
  if (globalThis.navigator?.onLine === false) throw new ErrorIA('sin_red');
  const body = JSON.stringify({ tipo, mimeType: blob.type || 'image/jpeg', data: await aBase64(blob) });

  // Con mala señal en el mercado, no esperar demasiado: mejor pasar a la lectura del teléfono.
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), espera);
  let res;
  try {
    res = await fetchImpl(URL_FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_CLAVE },
      body,
      signal: corte.signal,
    });
  } catch {
    throw new ErrorIA('sin_red');
  } finally {
    clearTimeout(reloj);
  }
  if (res.status === 429) throw new ErrorIA('limite');
  if (res.status === 401 || res.status === 403) throw new ErrorIA('sin_sesion');
  if (res.status === 503 || res.status === 404) throw new ErrorIA('no_configurado');
  if (!res.ok) {
    const detalle = await res.json?.().catch(() => null);
    throw new ErrorIA('respuesta_invalida', detalle?.status ? `Gemini respondió ${detalle.status}` : `HTTP ${res.status}`);
  }
  let cuerpo;
  try {
    cuerpo = await res.json();
  } catch {
    throw new ErrorIA('respuesta_invalida');
  }
  return cuerpo;
}
