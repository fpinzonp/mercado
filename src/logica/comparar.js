/**
 * Oferta: { id, productoId, mercadoId, nombreReal, tamano, precioNormal, fotoId?, actualizado,
 *           precioDescuento?, detalleDescuento?, descuentoHasta? }
 * Item:   { id, productoId, tachado, compradoEn? }  (ítems viejos pueden traer `cantidad`; ya no se usa)
 * Fechas: 'YYYY-MM-DD' en hora local; se comparan como texto.
 *
 * Sin cantidad, "más barato" es el menor precio por g, ml o unidad. Los totales por mercado cuentan
 * la MISMA cantidad de cada producto en todos los mercados (el tamaño típico de su presentación),
 * para que un paquete pequeño no haga ganar a un mercado más caro.
 */

export function descuentoVigente(oferta, hoy) {
  if (!(oferta?.precioDescuento > 0)) return false;
  const hasta = oferta.descuentoHasta || oferta.actualizado;
  return Boolean(hasta) && hoy <= hasta;
}

export function precioEfectivo(oferta, hoy) {
  return descuentoVigente(oferta, hoy)
    ? { precio: oferta.precioDescuento, conDescuento: true }
    : { precio: oferta.precioNormal, conDescuento: false };
}

/** Precio de una presentación y precio por unidad, hoy y sin descuento; null si la oferta está incompleta. */
export function precioOferta(oferta, hoy) {
  if (!(oferta?.tamano > 0) || !(oferta.precioNormal > 0)) return null;
  const { precio, conDescuento } = precioEfectivo(oferta, hoy);
  return {
    costo: precio,
    costoNormal: oferta.precioNormal,
    unitario: precio / oferta.tamano,
    unitarioNormal: oferta.precioNormal / oferta.tamano,
    conDescuento,
  };
}

const igual = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);

export function compararItem(item, ofertas, hoy) {
  const filas = (ofertas ?? [])
    .map((oferta) => ({ oferta, ...precioOferta(oferta, hoy) }))
    .filter((f) => f.costo != null)
    .sort((a, b) => a.unitario - b.unitario || a.costo - b.costo);
  if (!filas.length) return { filas: [], soloPorDescuento: false };
  const minHoy = Math.min(...filas.map((f) => f.unitario));
  const minNormal = Math.min(...filas.map((f) => f.unitarioNormal));
  for (const f of filas) {
    f.esMasBaratoHoy = igual(f.unitario, minHoy);
    f.esMasBaratoNormal = igual(f.unitarioNormal, minNormal);
  }
  const soloPorDescuento = !filas.some((f) => f.esMasBaratoHoy && f.esMasBaratoNormal);
  return { filas, soloPorDescuento };
}

/** Cantidad con la que se compara un producto entre mercados: el tamaño típico (mediana baja) de sus presentaciones. */
export function cantidadReferencia(ofertas) {
  const tamanos = (ofertas ?? []).map((o) => o.tamano).filter((t) => t > 0).sort((a, b) => a - b);
  return tamanos.length ? tamanos[Math.floor((tamanos.length - 1) / 2)] : null;
}

/** Lo que cuesta la cantidad de referencia del producto en ese mercado; null si no hay precio ahí. */
function costoReferencia(item, ofertasPorProducto, mercadoId, hoy) {
  const ofertas = ofertasPorProducto.get(item.productoId) ?? [];
  const p = precioOferta(ofertas.find((o) => o.mercadoId === mercadoId), hoy);
  return p ? Math.round(p.unitario * cantidadReferencia(ofertas)) : null;
}

export function totalesPorMercado(items, ofertasPorProducto, mercados, hoy) {
  return mercados
    .map((m) => {
      let total = 0;
      let faltan = 0;
      for (const item of items) {
        const c = costoReferencia(item, ofertasPorProducto, m.id, hoy);
        if (c == null) faltan++;
        else total += c;
      }
      return { mercadoId: m.id, total, faltan };
    })
    .sort((a, b) => a.faltan - b.faltan || a.total - b.total);
}

/** Llevando cada producto donde sale más barato. `ahorro` compara con el mejor mercado que tiene precio de todo. */
export function totalCombinado(items, ofertasPorProducto, mercados, hoy) {
  let total = 0;
  let sinPrecio = 0;
  const conPrecio = [];
  for (const item of items) {
    const ofertas = ofertasPorProducto.get(item.productoId);
    const { filas } = compararItem(item, ofertas, hoy);
    if (filas.length) {
      total += Math.round(filas[0].unitario * cantidadReferencia(ofertas));
      conPrecio.push(item);
    } else sinPrecio++;
  }
  const completo = conPrecio.length
    ? totalesPorMercado(conPrecio, ofertasPorProducto, mercados, hoy).find((t) => t.faltan === 0)
    : null;
  const ahorro = completo ? completo.total - total : null;
  return { total, sinPrecio, ahorro };
}

/** Qué conviene llevar aquí. En `otros`, `porcentaje` es cuánto más caro sale aquí por unidad (null si aquí no hay precio). */
export function repartirCompra(items, ofertasPorProducto, mercadoId, hoy) {
  const aqui = [];
  const otros = [];
  for (const item of items) {
    if (item.tachado) continue;
    const { filas } = compararItem(item, ofertasPorProducto.get(item.productoId), hoy);
    const baratos = filas.filter((f) => f.esMasBaratoHoy);
    if (!filas.length || baratos.some((f) => f.oferta.mercadoId === mercadoId)) {
      aqui.push(item);
      continue;
    }
    const filaAqui = filas.find((f) => f.oferta.mercadoId === mercadoId);
    otros.push({
      item,
      mercadoId: baratos[0].oferta.mercadoId,
      porcentaje: filaAqui ? Math.max(1, Math.round((filaAqui.unitario / baratos[0].unitario - 1) * 100)) : null,
    });
  }
  return { aqui, otros };
}
