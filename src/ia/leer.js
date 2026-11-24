import { leerEtiquetaGemini } from './gemini.js';
import { leerTextoLocal } from './ocr.js';
import { detectarTamano } from '../logica/tamano.js';

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
