import { h, limpiar, campo } from './dom.js';

export const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Pone el producto en la lista: si estaba tachado lo destacha; si ya está, no lo duplica. */
export async function ponerEnLista(repo, productoId) {
  const enLista = (await repo.listarItems()).find((i) => i.productoId === productoId);
  if (!enLista) return repo.guardarItem({ productoId });
  if (!enLista.tachado) return enLista;
  const { compradoEn, ...resto } = enLista;
  void compradoEn;
  return repo.guardarItem({ ...resto, tachado: false });
}

export async function pintarAgregar(raiz, ctx) {
  const { repo } = ctx;
  limpiar(raiz);
  const productos = await repo.listarProductos();
  const items = await repo.listarItems();
  const enLista = new Map(items.map((i) => [i.productoId, i]));

  const buscar = campo({ etiqueta: '¿Qué necesitas?', id: 'buscar', placeholder: 'Ej. Arroz', autocomplete: 'off', enterkeyhint: 'done' });
  const resultados = h('ul', { class: 'resultados' });

  let guardando = false;
  const agregar = async (producto, nombreNuevo) => {
    if (guardando) return;
    guardando = true;
    const p = producto ?? await repo.guardarProducto({ nombre: nombreNuevo });
    await ponerEnLista(repo, p.id);
    ctx.ir('#/lista');
  };

  const pintarResultados = () => {
    const q = normalizar(buscar.input.value);
    resultados.replaceChildren();
    if (!q) return;
    const coincidencias = productos.filter((p) => normalizar(p.nombre).includes(q)).slice(0, 8);
    for (const p of coincidencias) {
      const item = enLista.get(p.id);
      const nota = item && !item.tachado ? ' (ya está en la lista)' : '';
      resultados.append(h('li', {}, h('button', { type: 'button', 'data-producto': p.id, onclick: () => agregar(p) }, p.nombre + nota)));
    }
    if (!productos.some((p) => normalizar(p.nombre) === q)) {
      const texto = buscar.input.value.trim();
      resultados.append(h('li', {}, h('button', { type: 'button', 'data-crear': true, onclick: () => agregar(null, texto) }, `Agregar «${texto}»`)));
    }
  };
  buscar.input.addEventListener('input', pintarResultados);

  const cancelar = h('button', { class: 'boton secundario', type: 'button', onclick: () => ctx.ir('#/lista') }, 'Cancelar');
  raiz.append(
    h('h1', {}, 'Agregar a la lista'),
    buscar.nodo,
    resultados,
    h('p', { class: 'ayuda' }, 'La medida (peso, líquido o unidades) se elige cuando registras el precio.'),
    cancelar,
  );
  buscar.input.focus();
}
