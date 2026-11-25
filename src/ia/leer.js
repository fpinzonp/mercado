import { leerEtiquetaGemini, leerTagGemini } from './gemini.js';
import { leerTextoLocal } from './ocr.js';
import { detectarTamano } from '../logica/tamano.js';
import { interpretarTag, normalizarTag } from '../logica/tag.js';
import { hoyLocal } from '../logica/fechas.js';

const AVISOS = {
  limite: 'Se acabó el cupo gratis de Gemini por ahora (límite de uso); usé la lectura del teléfono.',
  clave_invalida: 'Gemini rechazó la clave. Revísala en Ajustes; por ahora usé la lectura del teléfono.',
  respuesta_invalida: 'Gemini no entendió la foto; usé la lectura del teléfono.',
};

/**
 * Gemini primero; si falla, Tesseract en el teléfono; si eso falla, manual.
 * @returns {Promise<{fuente:'gemini'|'ocr'|'manual', nombre?, tamano?, unidad?, palabras?, aviso?}>}
 */
export async function leerProducto(blob, { clave, modelo } = {}, deps = {}) {
  const gemini = deps.gemini ?? leerEtiquetaGemini;
  const ocr = deps.ocr ?? leerTextoLocal;

  let aviso;
  try {
    const r = await gemini(blob, { clave, modelo });
    return { fuente: 'gemini', ...r };
  } catch (e) {
    aviso = AVISOS[e?.codigo];
  }

  try {
    const { texto, palabras } = await ocr(blob);
    const t = detectarTamano(texto);
    const r = { fuente: 'ocr', palabras, ...(t ?? {}) };
    if (aviso) r.aviso = aviso;
    return r;
  } catch {
    return { fuente: 'manual', aviso: 'No pude leer la etiqueta; escribe el nombre.' };
  }
}

/**
 * Lee el tag de precio del estante: Gemini, luego el teléfono, luego manual.
 * @returns {Promise<{fuente, precioNormal, precioDescuento, porcentaje, detalle, hasta, tamano, unidad, aviso?}>}
 */
export async function leerTag(blob, { clave, modelo, hoy = hoyLocal() } = {}, deps = {}) {
  const gemini = deps.gemini ?? leerTagGemini;
  const ocr = deps.ocr ?? leerTextoLocal;

  let aviso;
  try {
    return { fuente: 'gemini', ...normalizarTag(await gemini(blob, { clave, modelo }), hoy) };
  } catch (e) {
    aviso = AVISOS[e?.codigo];
  }
  try {
    const { texto } = await ocr(blob);
    return { fuente: 'ocr', ...interpretarTag(texto, hoy), ...(aviso ? { aviso } : {}) };
  } catch {
    return { fuente: 'manual', ...normalizarTag(null, hoy), aviso: 'No pude leer el tag; escribe el precio.' };
  }
}
