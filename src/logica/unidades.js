const UNIDADES = {
  g: ['g', 1], gr: ['g', 1], grs: ['g', 1], gramos: ['g', 1],
  kg: ['g', 1000], kilo: ['g', 1000], kilos: ['g', 1000],
  ml: ['ml', 1], cc: ['ml', 1],
  l: ['ml', 1000], lt: ['ml', 1000], litro: ['ml', 1000], litros: ['ml', 1000],
  u: ['unidad', 1], un: ['unidad', 1], und: ['unidad', 1], unds: ['unidad', 1],
  unidad: ['unidad', 1], unidades: ['unidad', 1],
};

/** Número con coma decimal y/o punto de miles → Number, o null. */
export function parseNumero(texto) {
  let t = String(texto ?? '').trim();
  if (!t) return null;
  if (t.includes(',')) {
    t = t.split('.').join('').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.split('.').join('');
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Precio COP entero > 0, o null. Los puntos son miles; lo que va tras la coma se descarta. */
export function parsePrecio(texto) {
  let t = String(texto ?? '').replace(/[$\s]/g, '');
  if (!t) return null;
  t = t.split(',')[0].split('.').join('');
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Convierte valor+unidad a la unidad interna del producto; null si no es compatible. */
export function convertir(valor, unidad, tipoUnidad) {
  const clave = String(unidad ?? '').trim().toLowerCase().replace(/[.]+$/, '');
  const u = UNIDADES[clave];
  if (!u || u[0] !== tipoUnidad || !(valor > 0)) return null;
  return Math.round(valor * u[1] * 1000) / 1000;
}

/** "2 kg", "1,5 L", "500" → cantidad en unidad interna (> 0), o null. */
export function parseCantidad(texto, tipoUnidad) {
  const m = String(texto ?? '').trim().match(/^([\d.,]+)\s*([a-zA-Z]*)[.]?$/);
  if (!m) return null;
  const n = parseNumero(m[1]);
  if (n === null || n <= 0) return null;
  if (!m[2]) return n;
  return convertir(n, m[2], tipoUnidad);
}

const conMiles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function formatoCOP(n) {
  return '$' + conMiles(n);
}

const decimal = (n, max) => {
  const r = Math.round(n * 10 ** max) / 10 ** max;
  return String(r).replace('.', ',');
};

export function formatoCantidad(n, tipoUnidad) {
  if (tipoUnidad === 'unidad') return `${decimal(n, 2)} un`;
  const grande = tipoUnidad === 'g' ? 'kg' : 'L';
  if (n >= 1000) return `${decimal(n / 1000, 3)} ${grande}`;
  return `${decimal(n, 2)} ${tipoUnidad}`;
}

export const sufijoUnidad = (tipoUnidad) => (tipoUnidad === 'unidad' ? 'un' : tipoUnidad);

export function formatoUnitario(precio, tamano, tipoUnidad) {
  const v = (precio / tamano).toFixed(2).replace('.', ',');
  return `$${v}/${sufijoUnidad(tipoUnidad)}`;
}
