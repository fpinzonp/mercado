import { h, limpiar, campo } from './dom.js';
import { parseCantidad, formatoCantidad } from '../logica/unidades.js';

const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const TIPOS = [
  ['g', 'Peso', 'Ej. 2 kg o 500 g'],
  ['ml', 'Líquido', 'Ej. 1 L o 750 ml'],
  ['unidad', 'Unidades', 'Ej. 30'],
];

export async function pintarAgregar(raiz, ctx) {
  const { repo } = ctx;
  limpiar(raiz);
  const productos = await repo.listarProductos();
  const items = await repo.listarItems();

  const buscar = campo({ etiqueta: '¿Qué necesitas?', id: 'buscar', placeholder: 'Ej. Arroz', autocomplete: 'off', enterkeyhint: 'search' });
  const resultados = h('ul', { class: 'resultados' });
  const zonaCantidad = h('div');

  const pintarResultados = () => {
    const q = normalizar(buscar.input.value);
    resultados.replaceChildren();
    if (!q) return;
    const coincidencias = productos.filter((p) => normalizar(p.nombre).includes(q)).slice(0, 8);
    for (const p of coincidencias) {
      resultados.append(h('li', {}, h('button', { type: 'button', 'data-producto': p.id, onclick: () => elegir(p) }, p.nombre)));
    }
    if (!productos.some((p) => normalizar(p.nombre) === q)) {
      const texto = buscar.input.value.trim();
      resultados.append(h('li', {}, h('button', { type: 'button', 'data-crear': true, onclick: () => elegir(null, texto) }, `Crear «${texto}»`)));
    }
  };
  buscar.input.addEventListener('input', pintarResultados);

  function elegir(producto, nombreNuevo) {
    resultados.replaceChildren();
    buscar.nodo.hidden = true;
    const enLista = producto ? items.find((i) => i.productoId === producto.id) : null;
    const cantidad = campo({ etiqueta: 'Cantidad', id: 'cantidad', autocomplete: 'off', inputmode: 'decimal' });
    let tipo = producto?.tipoUnidad ?? null;
    const ayudaCantidad = () => TIPOS.find((t) => t[0] === tipo)?.[2] ?? 'Elige primero cómo se mide.';
    const ayuda = h('p', { class: 'ayuda' }, ayudaCantidad());
    cantidad.nodo.insertBefore(ayuda, cantidad.nodo.querySelector('.error'));

    const tipoError = h('p', { class: 'error', role: 'alert', hidden: true });
    const selectorTipo = producto ? null : h('fieldset', { class: 'opciones' },
      h('legend', {}, '¿Cómo se mide?'),
      TIPOS.map(([valor, etiqueta]) => {
        const radio = h('input', { type: 'radio', name: 'tipo', value: valor });
        radio.addEventListener('change', () => { tipo = valor; ayuda.textContent = ayudaCantidad(); tipoError.hidden = true; });
        return h('label', {}, radio, h('span', {}, etiqueta));
      }),
    );

    const form = h('form', { class: 'cantidad', novalidate: true },
      h('h2', {}, producto ? producto.nombre : nombreNuevo),
      enLista ? h('p', { class: 'ayuda' }, enLista.tachado
        ? `Estaba tachado en la lista; se vuelve a poner con esta cantidad.`
        : `Ya está en la lista (${formatoCantidad(enLista.cantidad, producto.tipoUnidad)}); se suma.`) : null,
      selectorTipo, tipoError,
      cantidad.nodo,
      h('button', { class: 'boton', type: 'submit' }, 'Agregar a la lista'),
      h('button', { class: 'boton secundario', type: 'button', onclick: () => pintarAgregar(raiz, ctx) }, 'Elegir otro producto'),
    );
    cantidad.input.addEventListener('input', () => cantidad.mostrarError(''));
    const validar = () => {
      tipo = form.querySelector('input[name=tipo]:checked')?.value ?? tipo;
      if (!tipo) return false;
      const n = parseCantidad(cantidad.input.value, tipo);
      cantidad.mostrarError(n ? '' : `Escribe una cantidad mayor que cero, por ejemplo ${ayudaCantidad().replace(/^Ej\. /, '')}.`);
      return n;
    };
    cantidad.input.addEventListener('blur', () => { if (cantidad.input.value) validar(); });

    let guardando = false;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (guardando) return;
      tipo = form.querySelector('input[name=tipo]:checked')?.value ?? tipo;
      if (!tipo) {
        tipoError.textContent = 'Elige si se mide por peso, líquido o unidades.';
        tipoError.hidden = false;
        return;
      }
      const n = validar();
      if (!n) { cantidad.input.focus(); return; }
      guardando = true;
      const p = producto ?? await repo.guardarProducto({ nombre: nombreNuevo, tipoUnidad: tipo });
      if (enLista?.tachado) {
        const { compradoEn, ...resto } = enLista;
        void compradoEn;
        await repo.guardarItem({ ...resto, tachado: false, cantidad: n });
      } else if (enLista) await repo.guardarItem({ ...enLista, cantidad: enLista.cantidad + n });
      else await repo.guardarItem({ productoId: p.id, cantidad: n });
      ctx.ir('#/lista');
    });
    zonaCantidad.replaceChildren(form);
    (producto ? cantidad.input : form.querySelector('input'))?.focus?.();
  }

  const cancelar = h('button', { class: 'boton secundario', type: 'button', onclick: () => ctx.ir('#/lista') }, 'Cancelar');
  raiz.append(h('h1', {}, 'Agregar a la lista'), buscar.nodo, resultados, zonaCantidad, cancelar);
  buscar.input.focus();
}
