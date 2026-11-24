import { descuentoVigente } from './comparar.js';

const CAMPOS_DESCUENTO = ['precioDescuento', 'detalleDescuento', 'descuentoHasta'];

/**
 * Combina la oferta guardada con lo que el usuario acaba de registrar.
 * - Si lo nuevo trae precioDescuento (número o null), reemplaza todo el descuento.
 * - Si no lo trae, el descuento anterior se conserva solo si sigue vigente hoy.
 */
export function fusionarOferta(anterior, nueva, hoy) {
  const r = { ...(anterior ?? {}), ...nueva, actualizado: hoy };
  const traeDescuento = Object.prototype.hasOwnProperty.call(nueva, 'precioDescuento');

  if (traeDescuento) {
    for (const c of CAMPOS_DESCUENTO) if (!(c in nueva) || nueva[c] == null || nueva[c] === '') delete r[c];
    if (!(nueva.precioDescuento > 0)) for (const c of CAMPOS_DESCUENTO) delete r[c];
  } else if (anterior && !descuentoVigente(anterior, hoy)) {
    for (const c of CAMPOS_DESCUENTO) delete r[c];
  } else if (anterior) {
    // vigente: se conserva con su fecha original (si no tenía 'hasta', vence el día en que se registró)
    if (!anterior.descuentoHasta && anterior.precioDescuento > 0) r.descuentoHasta = anterior.actualizado;
  }
  return r;
}
