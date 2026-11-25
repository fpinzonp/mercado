import { h, limpiar } from './dom.js';
import { cargarEstado } from './estado.js';
import { repartirCompra, precioOferta } from '../logica/comparar.js';
import { formatoCOP, formatoCantidad, formatoUnitario } from '../logica/unidades.js';

export async function pintarComprar(raiz, ctx) {
  const { repo } = ctx;
  const hoy = ctx.hoy();
  const e = await cargarEstado(repo);
  limpiar(raiz);
  const repintar = () => pintarComprar(raiz, ctx);
  const activo = e.mercadosPorId.get(e.ajustes.mercadoActivo);

  if (!activo) {
    raiz.append(
      h('h1', {}, '¿En qué mercado estás?'),
      h('p', {}, 'Te muestro primero lo que conviene comprar aquí.'),
      h('div', { class: 'mercados-elegir' }, e.mercados.map((m) => h('button', {
        class: 'boton secundario',
        onclick: async () => { await repo.guardarAjuste('mercadoActivo', m.id); repintar(); },
      }, m.nombre))),
    );
    return;
  }

  const { aqui, otros } = repartirCompra(e.items, e.ofertasPorProducto, activo.id, hoy);
  const tachados = e.items.filter((i) => i.tachado);

  const filaItem = (item, extra) => {
    const producto = e.productos.get(item.productoId);
    if (!producto) return null;
    const oferta = (e.ofertasPorProducto.get(item.productoId) ?? []).find((o) => o.mercadoId === activo.id);
    const costo = oferta ? precioOferta(oferta, hoy) : null;
    const check = h('input', { type: 'checkbox', checked: item.tachado, 'aria-label': `Tachar ${producto.nombre}` });
    check.addEventListener('click', async () => {
      await repo.tacharItem(item.id, item.tachado ? null : activo.id);
      repintar();
    });
    return h('li', { class: `item${item.tachado ? ' tachado' : ''}` },
      h('div', { class: 'item-cabeza' },
        check,
        h('span', { class: 'item-nombre' }, producto.nombre),
        costo ? h('span', { class: 'costo precio' }, formatoCOP(costo.costo)) : h('span'),
      ),
      oferta && costo && !item.tachado ? h('p', { class: 'nota-otro' }, [
        [oferta.nombreReal, formatoCantidad(oferta.tamano, producto.tipoUnidad)].filter(Boolean).join(' '),
        formatoUnitario(costo.costo, oferta.tamano, producto.tipoUnidad),
        costo.conDescuento ? 'con descuento' : null,
      ].filter(Boolean).join(' · ')) : null,
      extra,
      !oferta && !item.tachado
        ? h('button', { class: 'boton-texto agregar-precio', onclick: () => ctx.ir(`#/precio/${producto.id}`) }, `+ Agregar precio en ${activo.nombre}`)
        : null,
    );
  };

  raiz.append(h('div', { class: 'estas-en' },
    h('h1', {}, `Estás en ${activo.nombre}`),
    h('span', {},
      h('button', { class: 'boton-texto', onclick: async () => { await repo.guardarAjuste('mercadoActivo', null); repintar(); } }, 'Cambiar'),
      ' ',
      h('button', {
        class: 'boton-texto',
        onclick: async () => { await repo.guardarAjuste('mercadoActivo', null); ctx.ir('#/lista'); },
      }, 'Terminar'),
    ),
  ));

  if (!aqui.length && !otros.length) {
    raiz.append(h('div', { class: 'vacio' },
      h('p', {}, e.items.length ? 'Ya tienes todo lo de la lista.' : 'Tu lista está vacía.'),
      h('button', { class: 'boton secundario', onclick: () => ctx.ir('#/lista') }, 'Ver la lista'),
    ));
  } else {
    raiz.append(
      h('section', { class: 'aqui' },
        h('h2', {}, 'Cómpralo aquí'),
        aqui.length
          ? h('ul', { class: 'items' }, aqui.map((i) => filaItem(i)))
          : h('p', { class: 'ayuda' }, `Nada de lo que falta sale más barato en ${activo.nombre}.`),
      ),
    );
    if (otros.length) {
      raiz.append(h('details', { class: 'otros' },
        h('summary', {}, `Más barato en otro mercado (${otros.length})`),
        h('ul', { class: 'items' }, otros.map(({ item, mercadoId, porcentaje }) => {
          const donde = e.mercadosPorId.get(mercadoId)?.nombre ?? 'otro mercado';
          const nota = porcentaje == null
            ? `Sin precio aquí; más barato en ${donde}.`
            : `Aquí sale ${porcentaje}% más caro que en ${donde}.`;
          return filaItem(item, h('p', { class: 'nota-otro' }, nota));
        })),
      ));
    }
  }

  if (tachados.length) {
    raiz.append(h('details', { class: 'otros' },
      h('summary', {}, `Ya en el carrito (${tachados.length})`),
      h('ul', { class: 'items' }, tachados.map((i) => filaItem(i))),
    ));
  }
}
