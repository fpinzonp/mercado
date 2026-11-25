import { h, limpiar, campo } from './dom.js';

/** params[0]: 'instalar' | 'mercados' */
export async function pintarBienvenida(raiz, ctx, params = []) {
  limpiar(raiz);
  if (params[0] === 'instalar') return pasoInstalar(raiz, ctx);
  return pasoMercados(raiz, ctx);
}

function pasoInstalar(raiz, ctx) {
  raiz.append(
    h('section', { class: 'bienvenida' },
      h('h1', {}, 'Instala Mercado en tu iPhone'),
      h('p', {}, 'Safari puede borrar los datos de las páginas que no están instaladas. Instalada, tu lista y tus precios quedan guardados y funciona sin señal.'),
      h('ol', { class: 'pasos' },
        h('li', {}, 'Toca el botón Compartir de Safari (el cuadrado con la flecha hacia arriba).'),
        h('li', {}, 'Elige "Agregar a pantalla de inicio".'),
        h('li', {}, 'Abre Mercado desde el ícono nuevo.'),
      ),
      h('button', {
        class: 'boton secundario',
        onclick: () => {
          sessionStorage.setItem('sinInstalar', '1');
          ctx.ir('#/bienvenida/mercados');
        },
      }, 'Seguir en Safari por ahora'),
      h('p', { class: 'ayuda' }, 'Solo para probar: en Safari los datos se pueden perder.'),
    ),
  );
}

function pasoMercados(raiz, ctx) {
  const campos = [1, 2, 3, 4].map((n) => campo({
    etiqueta: `Mercado ${n}${n > 1 ? ' (opcional)' : ''}`,
    id: `mercado-${n}`,
    placeholder: ['Ej. D1', 'Ej. Ara', 'Ej. Éxito', 'Ej. Olímpica'][n - 1],
    autocomplete: 'off',
  }));
  const form = h('form', { class: 'bienvenida', novalidate: true },
    h('h1', {}, '¿Dónde haces mercado?'),
    h('p', {}, 'Escribe los mercados donde comparas precios. Puedes cambiarlos después en Ajustes.'),
    campos.map((c) => c.nodo),
    h('button', { class: 'boton', type: 'submit' }, 'Guardar mercados'),
    h('button', { class: 'boton secundario', type: 'button', onclick: () => ctx.ir('#/ajustes') }, 'Ya uso Mercado en otro dispositivo'),
    h('p', { class: 'ayuda' }, 'Entra con tu cuenta y se bajan tus mercados, productos, precios y lista.'),
  );
  campos[0].input.addEventListener('input', () => campos[0].mostrarError(''));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombres = campos.map((c) => c.input.value.trim()).filter(Boolean);
    if (!nombres.length) {
      campos[0].mostrarError('Escribe al menos un mercado.');
      campos[0].input.focus();
      return;
    }
    for (const [i, nombre] of nombres.entries()) await ctx.repo.guardarMercado({ nombre, orden: i });
    ctx.ir('#/lista');
  });
  raiz.append(form);
}
