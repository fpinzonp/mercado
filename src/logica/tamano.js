import { convertir, parseNumero, tipoDeUnidad } from './unidades.js';

const PATRON = /(?:^|[^\p{L}\d])x?\s*(\d[\d.,]*)\s*(kg|kilos?|gramos|grs?|g|ml|cc|litros?|lt|l|unidades|unidad|unds?|un)(?![\p{L}])/giu;

const TIPOS = ['g', 'ml', 'unidad'];

/** Primer "número + unidad" del texto, convertido a unidad interna. */
export function detectarTamano(texto) {
  for (const m of String(texto ?? '').matchAll(PATRON)) {
    const n = parseNumero(m[1].replace(/[.,]$/, ''));
    if (n == null || n <= 0) continue;
    for (const tipo of TIPOS) {
      const tamano = convertir(n, m[2], tipo);
      if (tamano != null) return { tamano, unidad: tipo };
    }
  }
  return null;
}

/**
 * Ajusta lo que leyó la IA al tipo de medida del producto; tamaño null si no encaja.
 * Si el producto aún no tiene tipo, lo deduce de la unidad leída (tipo null si no se sabe).
 */
export function normalizarLectura(lectura, tipoUnidad) {
  const nombre = String(lectura?.nombre ?? '').trim().replace(/\s+/g, ' ');
  const tipo = tipoUnidad || tipoDeUnidad(lectura?.unidad);
  const n = typeof lectura?.tamano === 'number' ? lectura.tamano : parseNumero(lectura?.tamano);
  const tamano = n > 0 && tipo ? convertir(n, lectura?.unidad || tipo, tipo) : null;
  return { nombre, tamano, tipo: tipo ?? null };
}
