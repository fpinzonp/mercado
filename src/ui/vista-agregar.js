import { h, limpiar, campo } from './dom.js';
import { normalizarNombre } from '../logica/nombres.js';
import { resumenProducto } from '../logica/resumen.js';
import { formatoCOP, formatoUnitario } from '../logica/unidades.js';
import { formatoDiaMes } from '../logica/fechas.js';

export const normalizar = normalizarNombre;

/**
 * Pone el producto en la lista: si estaba tachado lo destacha; si ya está, no lo duplica.
 * @returns {Promise<{item, yaEstaba: boolean}>}
 */
export async function ponerEnLista(repo, productoId) {
  const enLista = (await repo.listarItems()).find((i) => i.productoId === productoId);
  if (!enLista) return { item: await repo.guardarItem({ productoId }), yaEstaba: false };
  if (!enLista.tachado) return { item: enLista, yaEstaba: true };
  const { compradoEn, ...resto } = enLista;
  void compradoEn;
  return { item: await repo.guardarItem({ ...resto, tachado: false }), yaEstaba: false };
}

export async function pintarAgregar(raiz, ctx) {
  const { repo } = ctx;
  limpiar(raiz);
  const productos = await repo.listarProductos();
  const enLista = new Map((await repo.listarItems()).map((i) => [i.productoId, i]));
  const [ofertasPorProducto, compras, mercados] = await Promise.all([repo.ofertasPorProducto(), repo.listarCompras(), repo.listarMercados()]);
  const nombreMercado = (id) => mercados.find((m) => m.id === id)?.nombre ?? 'otro mercado';
  const hoy = ctx.hoy?.() ?? undefined;

  /** Dos líneas cortas: dónde conviene hoy y cómo fue la última compra. */
  const textos = (p) => {
    const { mejor, ultima } = resumenProducto({ productoId: p.id, ofertas: ofertasPorProducto.get(p.id), compras, hoy });
    const lineaMejor = mejor
      ? `Más barato: ${nombreMercado(mejor.mercadoId)} · ${formatoUnitario(mejor.costo, mejor.tamano, p.tipoUnidad)}${mejor.soloPorDescuento ? ' (por descuento)' : ''}`
      : 'Sin precios guardados';
    const pago = !ultima ? null
      : ultima.precio == null ? 'sin precio registrado'
        : ultima.conDescuento ? `con descuento ${formatoCOP(ultima.precio)}` : `precio normal ${formatoCOP(ultima.precio)}`;
    const lineaUltima = ultima
      ? `Última compra: ${nombreMercado(ultima.mercadoId)}, ${formatoDiaMes(ultima.fecha)} · ${pago}`
      : 'Nunca lo has comprado';
    return { lineaMejor, lineaUltima, promo: Boolean(mejor?.soloPorDescuento), conPrecio: Boolean(mejor) };
  };
  const resumen = (p) => {
    const t = textos(p);
    return [
      h('span', { class: `res-mejor${t.promo ? ' promo' : ''}` }, t.lineaMejor),
      h('span', { class: 'res-ultima' }, t.lineaUltima),
    ];
  };

  const buscar = campo({ etiqueta: '¿Qué necesitas?', id: 'buscar', placeholder: 'Ej. Arroz', autocomplete: 'off', enterkeyhint: 'done' });
  const form = h('form', { class: 'buscar', novalidate: true }, buscar.nodo);
  const resultados = h('ul', { class: 'resultados' });
  const hecho = h('p', { class: 'agregado', role: 'status' });
  const salir = h('button', { class: 'boton secundario', type: 'button', onclick: () => ctx.ir('#/lista') }, 'Cancelar');

  let guardando = false;
  const agregar = async (producto, nombreNuevo) => {
    if (guardando || (!producto && !nombreNuevo)) return;
    guardando = true;
    try {
      let p = producto;
      if (!p) {
        p = await repo.guardarProducto({ nombre: nombreNuevo });
        productos.push(p);
      }
      const { item, yaEstaba } = await ponerEnLista(repo, p.id);
      enLista.set(p.id, item);
      const donde = producto && textos(p).conPrecio ? ` ${textos(p).lineaMejor}.` : '';
      hecho.textContent = yaEstaba ? `Ya estaba en la lista: «${p.nombre}».${donde}` : `Agregaste «${p.nombre}».${donde} Escribe el siguiente o toca Listo.`;
      salir.textContent = 'Listo';
      buscar.input.value = '';
      pintarResultados();
      buscar.input.focus();
    } finally {
      guardando = false;
    }
  };

  function pintarResultados() {
    const q = normalizar(buscar.input.value);
    resultados.replaceChildren();
    if (!q) return;
    const coincidencias = productos.filter((p) => normalizar(p.nombre).includes(q)).slice(0, 8);
    for (const p of coincidencias) {
      const item = enLista.get(p.id);
      const nota = item && !item.tachado ? ' (ya está en la lista)' : '';
      resultados.append(h('li', {}, h('button', { type: 'button', class: 'resultado', 'data-producto': p.id, onclick: () => agregar(p) },
        h('span', { class: 'res-nombre' }, p.nombre + nota),
        resumen(p),
      )));
    }
    if (!productos.some((p) => normalizar(p.nombre) === q)) {
      const texto = buscar.input.value.trim().replace(/\s+/g, ' ');
      resultados.append(h('li', {}, h('button', { type: 'button', 'data-crear': true, onclick: () => agregar(null, texto) }, `Agregar «${texto}»`)));
    }
  }
  buscar.input.addEventListener('input', pintarResultados);

  // Enter (o "listo" en el teclado del iPhone): el producto con ese nombre exacto, o uno nuevo.
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = normalizar(buscar.input.value);
    if (!q) return;
    const exacto = productos.find((p) => normalizar(p.nombre) === q);
    agregar(exacto ?? null, exacto ? undefined : buscar.input.value.trim().replace(/\s+/g, ' '));
  });

  raiz.append(
    h('h1', {}, 'Agregar a la lista'),
    form,
    resultados,
    hecho,
    h('p', { class: 'ayuda' }, 'La medida (peso, líquido o unidades) se elige cuando registras el precio.'),
    salir,
  );
  buscar.input.focus();
}
