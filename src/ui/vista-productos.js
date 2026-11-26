import { h, limpiar, campo, aviso } from './dom.js';
import { cargarEstado } from './estado.js';
import { compararItem } from '../logica/comparar.js';
import { formatoUnitario } from '../logica/unidades.js';
import { normalizar, ponerEnLista } from './vista-agregar.js';

/** Todos los productos, estén o no en la lista: dónde salen más baratos, anotar precios y ponerlos en la lista. */
export async function pintarProductos(raiz, ctx) {
  const { repo } = ctx;
  const hoy = ctx.hoy();
  const e = await cargarEstado(repo);
  limpiar(raiz);
  const repintar = () => pintarProductos(raiz, ctx);
  const itemDe = new Map(e.items.map((i) => [i.productoId, i]));

  // Crear un producto sin ponerlo en la lista
  const nuevo = campo({ etiqueta: 'Nuevo producto', id: 'nuevo-producto', placeholder: 'Ej. Atún', autocomplete: 'off' });
  const formNuevo = h('form', { class: 'en-linea nuevo-producto', novalidate: true }, nuevo.nodo, h('button', { class: 'boton', type: 'submit' }, 'Crear'));
  nuevo.input.addEventListener('input', () => nuevo.mostrarError(''));
  let creando = false;
  formNuevo.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (creando) return;
    const nombre = nuevo.input.value.trim();
    if (!nombre) { nuevo.mostrarError('Escribe el nombre del producto.'); return; }
    const existe = e.productosLista.find((p) => normalizar(p.nombre) === normalizar(nombre));
    if (existe) { nuevo.mostrarError(`Ya tienes «${existe.nombre}».`); return; }
    creando = true;
    const p = await repo.guardarProducto({ nombre });
    ctx.ir(`#/precio/${p.id}`); // directo a registrar su precio y su foto
  });

  const buscar = campo({ etiqueta: 'Buscar', id: 'buscar-producto', placeholder: 'Ej. arroz', autocomplete: 'off', enterkeyhint: 'search' });

  const filas = e.productosLista.map((p) => {
    const ofertas = e.ofertasPorProducto.get(p.id) ?? [];
    const { filas: comp } = compararItem({ productoId: p.id }, ofertas, hoy);
    const mejor = comp[0];
    const resumen = mejor
      ? `Más barato en ${e.mercadosPorId.get(mejor.oferta.mercadoId)?.nombre ?? '—'} · ${formatoUnitario(mejor.costo, mejor.oferta.tamano, p.tipoUnidad)}`
        + (comp.length > 1 ? ` · precio en ${comp.length} mercados` : '')
      : 'Sin precios todavía';
    const item = itemDe.get(p.id);
    const enLista = Boolean(item && !item.tachado);
    let ocupado = false;
    const una = (fn) => async () => { if (ocupado) return; ocupado = true; await fn(); repintar(); };
    return h('li', { class: 'item producto', 'data-buscar': normalizar(p.nombre) },
      h('div', { class: 'item-cabeza' },
        h('span', { class: 'producto-nombre item-nombre' }, p.nombre),
        enLista ? h('span', { class: 'en-lista' }, 'En la lista') : h('span'),
      ),
      h('p', { class: 'nota-otro' }, resumen),
      h('div', { class: 'acciones-producto' },
        h('button', { class: 'boton-texto', type: 'button', onclick: () => ctx.ir(`#/precio/${p.id}`) }, ofertas.length ? 'Actualizar precio' : 'Agregar precio'),
        enLista
          ? h('button', { class: 'boton-texto peligro', type: 'button', onclick: una(async () => { const copia = { ...item }; await repo.borrarItem(item.id); aviso(`Quitaste ${p.nombre} de la lista`, { accion: 'Deshacer', alTocar: async () => { await repo.guardarItem(copia); repintar(); } }); }) }, 'Quitar de la lista')
          : h('button', { class: 'boton-texto', type: 'button', onclick: una(() => ponerEnLista(repo, p.id)) }, 'Agregar a la lista'),
      ),
    );
  });

  buscar.input.addEventListener('input', () => {
    const q = normalizar(buscar.input.value);
    for (const li of filas) li.hidden = Boolean(q) && !li.dataset.buscar.includes(q);
  });

  raiz.append(
    h('h1', {}, 'Productos'),
    h('p', { class: 'ayuda' }, 'Todos tus productos, estén o no en la lista. Anota sus precios para saber dónde comprarlos el próximo mes.'),
    formNuevo,
    h('button', { class: 'boton secundario', type: 'button', onclick: () => ctx.ir('#/precio/nuevo') }, 'Nuevo producto con foto'),
  );
  if (!filas.length) {
    raiz.append(h('div', { class: 'vacio' }, h('p', {}, 'Todavía no tienes productos. Crea uno aquí o agrégalo desde la lista.')));
    return;
  }
  raiz.append(buscar.nodo, h('ul', { class: 'items' }, filas));
}
