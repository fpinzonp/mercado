import { compararItem } from './comparar.js';

const masReciente = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.actualizadoEn ?? 0) - (a.actualizadoEn ?? 0));

/**
 * Lo que conviene saber de un producto al ponerlo en la lista:
 * - mejor: dónde sale más barato hoy (mismo criterio que la Lista: precio por g/ml/unidad), y si es solo por descuento;
 * - ultima: la última compra (mercado, fecha, precio pagado y si fue con descuento).
 * @returns {{ mejor: null | {mercadoId, unitario, costo, tamano, conDescuento, soloPorDescuento},
 *             ultima: null | {mercadoId, fecha, precio, precioNormal, conDescuento}}}
 */
export function resumenProducto({ productoId, ofertas, compras, hoy }) {
  const { filas, soloPorDescuento } = compararItem({ productoId }, ofertas, hoy);
  const f = filas[0];
  const mejor = f ? {
    mercadoId: f.oferta.mercadoId,
    unitario: f.unitario,
    costo: f.costo,
    tamano: f.oferta.tamano,
    conDescuento: f.conDescuento,
    soloPorDescuento,
  } : null;
  const c = (compras ?? []).filter((x) => x.productoId === productoId).sort(masReciente)[0];
  const ultima = c ? {
    mercadoId: c.mercadoId, fecha: c.fecha, precio: c.precio ?? null, precioNormal: c.precioNormal ?? null, conDescuento: Boolean(c.conDescuento),
  } : null;
  return { mejor, ultima };
}
