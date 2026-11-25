import { h, limpiar, abrirHoja, aviso } from './dom.js';
import { cargarEstado } from './estado.js';
import { compararItem, totalesPorMercado, totalCombinado, descuentoVigente } from '../logica/comparar.js';
import { formatoCOP, formatoCantidad, formatoUnitario } from '../logica/unidades.js';
import { formatoDiaMes } from '../logica/fechas.js';
import { necesitaRecordatorio } from '../datos/respaldo.js';
import { guardarRespaldo } from './vista-ajustes.js';

/** Fila de una oferta: mercado, nombre real, precio (con descuento), costo, unitario y marcas. */
export function filaOferta(fila, { producto, mercado, soloPorDescuento, hoy, alTocar }) {
  const o = fila.oferta;
  const vigente = descuentoVigente(o, hoy);
  const marcas = [];
  if (soloPorDescuento) {
    if (fila.esMasBaratoHoy) marcas.push(h('span', { class: 'marca hoy' }, '✓ hoy'));
    if (fila.esMasBaratoNormal) marcas.push(h('span', { class: 'marca normal' }, '✓ normal'));
  } else if (fila.esMasBaratoHoy) {
    marcas.push(h('span', { class: 'marca mejor' }, '✓ más barato'));
  }
  const detalle = [
    vigente ? h('s', {}, formatoCOP(o.precioNormal)) : null,
    h('span', { class: 'num' }, formatoUnitario(vigente ? o.precioDescuento : o.precioNormal, o.tamano, producto.tipoUnidad)),
  ];
  if (vigente) {
    const partes = [
      o.detalleDescuento,
      fila.costoNormal > fila.costo ? `ahorras ${formatoCOP(fila.costoNormal - fila.costo)}` : null,
      `hasta ${formatoDiaMes(o.descuentoHasta || o.actualizado)}`,
    ].filter(Boolean);
    detalle.push(h('span', { class: 'promo' }, `🏷 ${partes.join(' ')}`));
  } else if (o.precioDescuento > 0) {
    detalle.push(h('span', { class: 'tuvo' }, `tuvo descuento: ${formatoCOP(o.precioDescuento)} (${formatoDiaMes(o.descuentoHasta || o.actualizado)})`));
  }
  detalle.push(...marcas);

  const contenido = [
    h('span', {}, h('span', { class: 'donde' }, mercado?.nombre ?? '—'), ' ',
      h('span', { class: 'real' }, [o.nombreReal, formatoCantidad(o.tamano, producto.tipoUnidad)].filter(Boolean).join(' '))),
    h('span', { class: `costo${vigente ? ' promo' : ''}` }, formatoCOP(fila.costo)),
    h('span', { class: 'detalle' }, detalle),
  ];
  const li = h('li', { class: 'oferta' });
  if (alTocar) {
    li.append(h('button', { class: 'ver', type: 'button', 'aria-label': `Ver precio en ${mercado?.nombre}`, onclick: () => alTocar(o) }, contenido));
  } else li.append(...contenido);
  return li;
}

export async function verFoto(repo, oferta, mercado) {
  const blob = await repo.leerFoto(oferta.fotoId);
  const contenido = h('div', {},
    blob ? h('img', { class: 'foto-previa', src: URL.createObjectURL(blob), alt: oferta.nombreReal || 'Foto del producto' })
      : h('p', {}, 'Este precio no tiene foto.'),
    h('p', {}, `Actualizado el ${formatoDiaMes(oferta.actualizado)}.`),
  );
  const cerrar = abrirHoja(`${oferta.nombreReal || 'Producto'} en ${mercado?.nombre ?? ''}`, contenido);
  contenido.append(h('button', { class: 'boton secundario', onclick: () => cerrar() }, 'Cerrar'));
}

export async function pintarLista(raiz, ctx) {
  const { repo } = ctx;
  const hoy = ctx.hoy();
  const e = await cargarEstado(repo);
  limpiar(raiz);
  const repintar = () => pintarLista(raiz, ctx);

  if (necesitaRecordatorio({ ...e.ajustes, hoy })) {
    raiz.append(h('div', { class: 'aviso-respaldo' },
      h('p', {}, 'Hace más de dos semanas que no guardas un respaldo de tus precios.'),
      h('button', { class: 'boton', onclick: async () => { if (await guardarRespaldo(repo)) repintar(); } }, 'Exportar respaldo'),
    ));
  }

  raiz.append(h('h1', {}, 'Lista de mercado'));

  if (!e.items.length) {
    raiz.append(h('div', { class: 'vacio' },
      h('p', {}, 'Tu lista está vacía. Agrega lo que necesitas comprar; solo hace falta el nombre.'),
      h('button', { class: 'boton', onclick: () => ctx.ir('#/agregar') }, 'Agregar producto'),
    ));
    return;
  }

  const comparaciones = new Map(e.items.map((it) => [it.id, compararItem(it, e.ofertasPorProducto.get(it.productoId), hoy)]));
  const conPrecio = e.items.filter((it) => comparaciones.get(it.id).filas.length);

  // Franja de etiquetas por mercado
  if (conPrecio.length) {
    const totales = totalesPorMercado(conPrecio, e.ofertasPorProducto, e.mercados, hoy);
    const ganador = totales.find((t) => t.faltan === 0)?.mercadoId;
    raiz.append(h('div', { class: 'etiquetas', role: 'list', 'aria-label': 'Total de la lista por mercado' },
      totales.map((t) => h('div', { class: `tag${t.mercadoId === ganador ? ' gana' : ''}`, role: 'listitem' },
        h('span', { class: 'mercado' }, e.mercadosPorId.get(t.mercadoId)?.nombre, t.mercadoId === ganador ? ' ✓' : ''),
        h('span', { class: 'precio' }, formatoCOP(t.total)),
        t.faltan ? h('span', { class: 'faltan' }, `faltan ${t.faltan} ${t.faltan === 1 ? 'precio' : 'precios'}`) : null,
      )),
    ));
    raiz.append(h('p', { class: 'ayuda' }, 'Cada producto cuenta con la misma cantidad en todos los mercados.'));
    const comb = totalCombinado(e.items, e.ofertasPorProducto, e.mercados, hoy);
    raiz.append(h('p', { class: 'combinado' },
      'Repartiendo la compra: ', h('strong', {}, formatoCOP(comb.total)),
      comb.ahorro > 0 ? `, ahorras ${formatoCOP(comb.ahorro)}` : '',
      comb.sinPrecio ? ` (${comb.sinPrecio} sin precio)` : '',
    ));
  }

  const orden = [...e.items.filter((i) => !i.tachado), ...e.items.filter((i) => i.tachado)];
  raiz.append(h('ul', { class: 'items' }, orden.map((item) => {
    const producto = e.productos.get(item.productoId);
    if (!producto) return null;
    const comp = comparaciones.get(item.id);
    const check = h('input', { type: 'checkbox', checked: item.tachado, 'aria-label': `Tachar ${producto.nombre}` });
    check.addEventListener('click', (ev) => {
      if (item.tachado) {
        repo.tacharItem(item.id, null).then(repintar);
        return;
      }
      ev.preventDefault();
      preguntarMercado({ item, producto, comp, e, repo, alTerminar: repintar });
    });
    const comprado = item.tachado && item.compradoEn ? e.mercadosPorId.get(item.compradoEn)?.nombre : null;
    return h('li', { class: `item${item.tachado ? ' tachado' : ''}` },
      h('div', { class: 'item-cabeza' },
        check,
        h('span', { class: 'item-nombre' }, producto.nombre),
        h('button', {
          class: 'boton-texto peligro', 'aria-label': `Quitar ${producto.nombre} de la lista`,
          onclick: async () => {
            const copia = { ...item };
            await repo.borrarItem(item.id);
            repintar();
            aviso(`Quitaste ${producto.nombre}`, { accion: 'Deshacer', alTocar: async () => { await repo.guardarItem(copia); repintar(); } });
          },
        }, 'Quitar'),
      ),
      comprado ? h('p', { class: 'comprado-en' }, `Comprado en ${comprado}`) : null,
      item.tachado ? null : ofertasDe(comp, { producto, e, hoy, repo }),
      item.tachado ? null : h('button', { class: 'boton-texto agregar-precio', onclick: () => ctx.ir(`#/precio/${producto.id}`) }, '+ Agregar precio'),
    );
  })));

  raiz.append(h('div', { class: 'acciones-lista' },
    h('button', { class: 'boton', onclick: () => ctx.ir('#/agregar') }, 'Agregar producto'),
    h('button', { class: 'boton secundario', onclick: () => preguntarNuevaLista(repo, repintar) }, 'Nueva lista'),
  ));
}

/**
 * A la vista solo lo que importa en el mercado: el más barato (y el más barato sin descuento si gana por promo).
 * El resto de precios queda plegado.
 */
function ofertasDe(comp, { producto, e, hoy, repo }) {
  if (!comp.filas.length) return null;
  const fila = (f) => filaOferta(f, {
    producto, mercado: e.mercadosPorId.get(f.oferta.mercadoId), soloPorDescuento: comp.soloPorDescuento, hoy,
    alTocar: (o) => verFoto(repo, o, e.mercadosPorId.get(o.mercadoId)),
  });
  const visibles = comp.filas.filter((f, i) => i === 0 || f.esMasBaratoHoy || (comp.soloPorDescuento && f.esMasBaratoNormal));
  const resto = comp.filas.filter((f) => !visibles.includes(f));
  return [
    h('ul', { class: 'ofertas' }, visibles.map(fila)),
    resto.length ? h('details', { class: 'mas-precios' },
      h('summary', {}, `Ver ${resto.length} ${resto.length === 1 ? 'precio más' : 'precios más'}`),
      h('ul', { class: 'ofertas-mas' }, resto.map(fila)),
    ) : null,
  ];
}

function preguntarMercado({ item, producto, comp, e, repo, alTerminar }) {
  const masBarato = comp.filas.find((f) => f.esMasBaratoHoy)?.oferta.mercadoId ?? e.mercados[0]?.id;
  const opciones = h('fieldset', { class: 'opciones', style: 'grid-template-columns: 1fr 1fr' },
    h('legend', {}, producto.nombre),
    e.mercados.map((m) => h('label', {},
      h('input', { type: 'radio', name: 'compradoEn', value: m.id, checked: m.id === masBarato }),
      h('span', {}, m.nombre))),
  );
  const contenido = h('div', {}, opciones);
  const cerrar = abrirHoja('¿Dónde lo compraste?', contenido);
  contenido.append(
    h('button', {
      class: 'boton',
      onclick: async () => {
        const elegido = contenido.querySelector('input[name=compradoEn]:checked')?.value ?? null;
        await repo.tacharItem(item.id, elegido);
        cerrar();
        alTerminar();
      },
    }, 'Tachar'),
    h('button', { class: 'boton secundario', onclick: () => cerrar() }, 'Cancelar'),
  );
}

function preguntarNuevaLista(repo, alTerminar) {
  const contenido = h('div', {}, h('p', {}, 'Los productos y los precios que anotaste se conservan.'));
  const cerrar = abrirHoja('Nueva lista', contenido);
  const hacer = (modo) => async () => { await repo.nuevaLista(modo); cerrar(); alTerminar(); };
  contenido.append(
    h('button', { class: 'boton', onclick: hacer('destachar') }, 'Destachar todo y repetir la lista'),
    h('button', { class: 'boton secundario', onclick: hacer('vaciar') }, 'Vaciar la lista'),
    h('button', { class: 'boton-texto', onclick: () => cerrar() }, 'Cancelar'),
  );
}
