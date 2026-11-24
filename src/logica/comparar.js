/**
 * Oferta: { id, productoId, mercadoId, nombreReal, tamano, precioNormal, fotoId?, actualizado,
 *           precioDescuento?, detalleDescuento?, descuentoHasta? }
 * Item:   { id, productoId, cantidad, tachado, compradoEn? }
 * Fechas: 'YYYY-MM-DD' en hora local; se comparan como texto.
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

export function costoItem(cantidad, oferta, hoy) {
  if (!(cantidad > 0) || !(oferta?.tamano > 0) || !(oferta.precioNormal > 0)) return null;
  const { precio, conDescuento } = precioEfectivo(oferta, hoy);
  const paquetes = Math.ceil(cantidad / oferta.tamano - 1e-9);
  return {
    paquetes,
    costo: paquetes * precio,
    costoNormal: paquetes * oferta.precioNormal,
    unitario: precio / oferta.tamano,
    conDescuento,
  };
}

export function compararItem(item, ofertas, hoy) {
  const filas = (ofertas ?? [])
    .map((oferta) => ({ oferta, ...costoItem(item.cantidad, oferta, hoy) }))
    .filter((f) => f.costo != null)
    .sort((a, b) => a.costo - b.costo);
  if (!filas.length) return { filas: [], soloPorDescuento: false };
  const minHoy = Math.min(...filas.map((f) => f.costo));
  const minNormal = Math.min(...filas.map((f) => f.costoNormal));
  for (const f of filas) {
    f.esMasBaratoHoy = f.costo === minHoy;
    f.esMasBaratoNormal = f.costoNormal === minNormal;
  }
  const soloPorDescuento = !filas.some((f) => f.esMasBaratoHoy && f.esMasBaratoNormal);
  return { filas, soloPorDescuento };
}

function costoEn(item, ofertasPorProducto, mercadoId, hoy) {
  const oferta = (ofertasPorProducto.get(item.productoId) ?? []).find((o) => o.mercadoId === mercadoId);
  return oferta ? costoItem(item.cantidad, oferta, hoy)?.costo ?? null : null;
}

export function totalesPorMercado(items, ofertasPorProducto, mercados, hoy) {
  return mercados
    .map((m) => {
      let total = 0;
      let faltan = 0;
      for (const item of items) {
        const c = costoEn(item, ofertasPorProducto, m.id, hoy);
        if (c == null) faltan++;
        else total += c;
      }
      return { mercadoId: m.id, total, faltan };
    })
    .sort((a, b) => a.faltan - b.faltan || a.total - b.total);
}

export function totalCombinado(items, ofertasPorProducto, mercados, hoy) {
  let total = 0;
  let sinPrecio = 0;
  const conPrecio = [];
  for (const item of items) {
    const { filas } = compararItem(item, ofertasPorProducto.get(item.productoId), hoy);
    if (filas.length) {
      total += filas[0].costo;
      conPrecio.push(item);
    } else sinPrecio++;
  }
  // Ahorro frente al mejor mercado que tiene precio de todo lo que tiene precio en algún lado.
  const completo = conPrecio.length
    ? totalesPorMercado(conPrecio, ofertasPorProducto, mercados, hoy).find((t) => t.faltan === 0)
    : null;
  const ahorro = completo ? completo.total - total : null;
  return { total, sinPrecio, ahorro };
}

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
      diferencia: filaAqui ? filaAqui.costo - baratos[0].costo : null,
    });
  }
  return { aqui, otros };
}
