import { parsePrecio, parseNumero, tipoDeUnidad, convertir } from './unidades.js';
import { detectarTamano, normalizarLectura } from './tamano.js';

/**
 * Lectura del tag de precio del estante.
 * Resultado: { precioNormal, precioDescuento, porcentaje, detalle, hasta, tamano, unidad } — null lo que no se sepa.
 */

const PROMO = /antes|ahora|ahorr|oferta|promo|desc|dto|%|\d\s*x\s*\d|lleve|pague/i;
const VIGENCIA = /(?:hasta|vigencia|v[aá]lid[oa]|vence)\D{0,15}?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/i;

/** Nombre de unidad del precio por unidad ("gramo", "ml", "kilo"...) → clave que entiende convertir(). */
function claveUnidad(palabra) {
  const p = String(palabra ?? '').toLowerCase();
  if (p === 'g' || p.startsWith('gr')) return 'g';
  if (p === 'kg' || p.startsWith('kilo')) return 'kg';
  if (p === 'ml' || p === 'cc' || p.startsWith('milil')) return 'ml';
  if (p === 'l' || p === 'lt' || p.startsWith('litro')) return 'l';
  if (p === 'u' || p.startsWith('un')) return 'un';
  return null;
}

/** Precio por unidad base (g, ml o unidad) a partir de un precio por g/kg/ml/L/un. */
function porUnidadBase(valor, unidad) {
  const tipo = tipoDeUnidad(unidad);
  const factor = tipo ? convertir(1, unidad, tipo) : null;
  return factor && valor > 0 ? { unitario: valor / factor, tipo } : null;
}

function fechaValida(dia, mes, anio, hoy) {
  const d = Number(dia);
  const m = Number(mes);
  let a = anio ? Number(anio) : Number(hoy.slice(0, 4));
  if (a < 100) a += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const f = new Date(a, m - 1, d);
  if (f.getMonth() !== m - 1) return null;
  const texto = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return texto >= hoy ? texto : null;
}

/** Deja los datos coherentes: descuento menor que el normal, fecha no vencida, tamaño deducido del precio por unidad. */
function completar(r, hoy) {
  const out = {
    precioNormal: r.precioNormal ?? null,
    precioDescuento: r.precioDescuento ?? null,
    porcentaje: null,
    detalle: r.detalle ? String(r.detalle).trim() || null : null,
    hasta: null,
    tamano: r.tamano ?? null,
    unidad: r.unidad ?? null,
  };
  if (out.precioDescuento && (!out.precioNormal || out.precioDescuento >= out.precioNormal)) out.precioDescuento = null;
  if (!out.precioDescuento && r.porcentaje > 0 && r.porcentaje < 100) out.porcentaje = r.porcentaje;
  if (typeof r.hasta === 'string') {
    const m = r.hasta.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    out.hasta = m ? fechaValida(m[3], m[2], m[1], hoy) : null;
  }
  if (!out.tamano && r.unitario && out.precioNormal) {
    out.tamano = Math.round(out.precioNormal / r.unitario.unitario);
    out.unidad = r.unitario.tipo;
  }
  return out;
}

/** Interpreta el texto que leyó el teléfono (OCR) del tag de precio. */
export function interpretarTag(texto, hoy) {
  let t = String(texto ?? '');
  let unitario = null;

  // "$/ml 4,20"
  t = t.replace(/\$\s*\/\s*([a-z]+)\.?\s*([\d.,]+)/gi, (todo, u, v) => {
    unitario ??= porUnidadBase(parseNumero(v), claveUnidad(u));
    return ' ';
  });

  const precios = [];
  for (const m of t.matchAll(/\$\s*(\d[\d.,]*)/g)) {
    const crudo = m[1].replace(/[.,]$/, '');
    const antes = t.slice(Math.max(0, m.index - 30), m.index);
    const despues = t.slice(m.index + m[0].length, m.index + m[0].length + 20);
    const etiquetaUnidad = antes.match(/(?:precio|valor)\s*(?:por|x)\s*(?:1\s*)?([\p{L}]+)\.?\s*:?\s*$/iu)
      ?? despues.match(/^\s*(?:\/|x|por|c\/)\s*(?:1\s*)?([\p{L}]+)/iu);
    const conDecimales = /,\d{1,2}$/.test(crudo);
    if (etiquetaUnidad || conDecimales) {
      unitario ??= porUnidadBase(parseNumero(crudo), claveUnidad(etiquetaUnidad?.[1]) ?? 'g');
      continue;
    }
    if (/ahorr\p{L}*\s*:?\s*$/iu.test(antes)) continue;
    const v = parsePrecio(crudo);
    if (!v || v < 50) continue;
    const marca = /antes\s*:?\s*$/i.test(antes) ? 'antes' : /ahora\s*:?\s*$/i.test(antes) ? 'ahora' : null;
    precios.push({ v, marca });
  }

  const promo = PROMO.test(t);
  const distintos = [...new Set(precios.map((p) => p.v))];
  let precioNormal = precios.find((p) => p.marca === 'antes')?.v ?? null;
  let precioDescuento = precios.find((p) => p.marca === 'ahora')?.v ?? null;
  if (promo && distintos.length >= 2) {
    precioNormal ??= Math.max(...distintos);
    precioDescuento ??= Math.min(...distintos);
  } else if (distintos.length) {
    precioNormal ??= Math.max(...distintos);
  }

  const detalle = t.match(/lleve\s+\d+\s+pague\s+\d+/i)?.[0]
    ?? t.match(/\b\d+\s*x\s*\d+\b/i)?.[0]
    ?? t.match(/\d{1,2}\s*%\s*(?:dto|desc\p{L}*|off)?/iu)?.[0]
    ?? null;
  const pct = t.match(/(\d{1,2})\s*%/);
  const v = t.match(VIGENCIA);
  const tam = detectarTamano(t);

  return completar({
    precioNormal,
    precioDescuento,
    porcentaje: pct ? Number(pct[1]) : null,
    detalle,
    hasta: v ? fechaValida(v[1], v[2], v[3], hoy) : null,
    tamano: tam?.tamano ?? null,
    unidad: tam?.unidad ?? null,
    unitario,
  }, hoy);
}

/** Limpia la respuesta de Gemini para el tag de precio. */
export function normalizarTag(d, hoy) {
  const precio = (x) => (x == null ? null : parsePrecio(String(x)));
  const lectura = normalizarLectura({ tamano: d?.tamano, unidad: d?.unidad }, null);
  const pu = typeof d?.precioPorUnidad === 'number' ? d.precioPorUnidad : parseNumero(d?.precioPorUnidad);
  return completar({
    precioNormal: precio(d?.precioNormal),
    precioDescuento: precio(d?.precioDescuento),
    porcentaje: Number(d?.porcentaje) || null,
    detalle: d?.detalle ?? null,
    hasta: d?.hasta ?? null,
    tamano: lectura.tamano,
    unidad: lectura.tamano ? lectura.tipo : null,
    unitario: pu ? porUnidadBase(pu, d?.unidadPrecioPorUnidad || 'g') : null,
  }, hoy);
}
