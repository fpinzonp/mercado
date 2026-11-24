import { h, limpiar, campo, abrirHoja, aviso } from './dom.js';
import { exportarRespaldo, importarRespaldo } from '../datos/respaldo.js';
import { hoyLocal } from '../logica/fechas.js';

/** Comparte o descarga el respaldo y marca ultimoRespaldo. Lo usa también el aviso de la Lista. */
export async function guardarRespaldo(repo) {
  const datos = await exportarRespaldo(repo);
  const nombre = `mercado-respaldo-${hoyLocal()}.json`;
  const archivo = new File([JSON.stringify(datos)], nombre, { type: 'application/json' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Respaldo de Mercado' });
    } catch (e) {
      if (e?.name === 'AbortError') return false;
      throw e;
    }
  } else {
    const a = h('a', { href: URL.createObjectURL(archivo), download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
  }
  await repo.guardarAjuste('ultimoRespaldo', hoyLocal());
  return true;
}

export async function pintarAjustes(raiz, ctx) {
  const { repo } = ctx;
  limpiar(raiz);
  const mercados = await repo.listarMercados();

  // Mercados
  const listaMercados = h('ul', { class: 'filas' },
    mercados.map((m) => {
      const input = h('input', { value: m.nombre, 'aria-label': `Nombre de ${m.nombre}` });
      input.addEventListener('change', async () => {
        const nombre = input.value.trim();
        if (!nombre) { input.value = m.nombre; return; }
        await repo.guardarMercado({ ...m, nombre });
        aviso('Nombre guardado');
      });
      return h('li', { class: 'fila-mercado' }, input,
        h('button', {
          class: 'boton-texto peligro',
          onclick: () => {
            const cerrar = abrirHoja(`¿Borrar ${m.nombre}?`, h('div', {},
              h('p', {}, `Se borran también los precios que anotaste en ${m.nombre}.`),
              h('button', { class: 'boton peligro', onclick: async () => { await repo.borrarMercado(m.id); cerrar(); ctx.refrescar(); } }, `Borrar ${m.nombre}`),
              h('button', { class: 'boton secundario', onclick: () => cerrar() }, 'Cancelar'),
            ));
          },
        }, 'Borrar'));
    }),
  );
  const nuevo = campo({ etiqueta: 'Agregar mercado', id: 'nuevo-mercado', placeholder: 'Ej. Olímpica', autocomplete: 'off' });
  const formNuevo = h('form', { class: 'en-linea' }, nuevo.nodo, h('button', { class: 'boton', type: 'submit' }, 'Agregar'));
  formNuevo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = nuevo.input.value.trim();
    if (!nombre) { nuevo.mostrarError('Escribe el nombre del mercado.'); return; }
    await repo.guardarMercado({ nombre });
    ctx.refrescar();
  });

  // Gemini
  const clave = campo({
    etiqueta: 'Clave de Gemini', id: 'clave', type: 'password', autocomplete: 'off',
    value: (await repo.leerAjuste('geminiClave')) ?? '',
    ayuda: 'Sirve para leer el nombre del producto en la foto. Es gratis y solo se guarda en este teléfono.',
  });
  const modelo = campo({ etiqueta: 'Modelo de Gemini', id: 'modelo', autocomplete: 'off', value: await repo.leerAjuste('geminiModelo') });
  clave.input.addEventListener('change', async () => { await repo.guardarAjuste('geminiClave', clave.input.value.trim() || null); aviso('Clave guardada'); });
  modelo.input.addEventListener('change', async () => { await repo.guardarAjuste('geminiModelo', modelo.input.value.trim() || null); aviso('Modelo guardado'); });

  // Respaldo
  const archivo = h('input', { type: 'file', accept: 'application/json,.json', id: 'importar', class: 'oculto' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0];
    if (!f) return;
    try {
      await importarRespaldo(repo, JSON.parse(await f.text()));
      aviso('Respaldo importado');
      ctx.ir('#/lista');
    } catch (e) {
      aviso(e instanceof SyntaxError ? 'Este archivo no es un respaldo de Mercado' : e.message);
    }
    archivo.value = '';
  });

  raiz.append(
    h('h1', {}, 'Ajustes'),
    h('section', { class: 'bloque' }, h('h2', {}, 'Mercados'), listaMercados, formNuevo),
    h('section', { class: 'bloque' },
      h('h2', {}, 'Leer fotos con Gemini'),
      h('ol', { class: 'pasos' },
        h('li', {}, 'Abre ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'Google AI Studio'), ' con tu cuenta de Google.'),
        h('li', {}, 'Toca "Create API key" y copia la clave.'),
        h('li', {}, 'Pégala aquí abajo.'),
      ),
      clave.nodo, modelo.nodo,
    ),
    h('section', { class: 'bloque' },
      h('h2', {}, 'Respaldo'),
      h('p', {}, 'Guarda una copia de tu lista, precios y fotos en Archivos o iCloud. La clave de Gemini no se incluye.'),
      h('button', { class: 'boton', onclick: async () => { if (await guardarRespaldo(repo)) aviso('Respaldo guardado'); } }, 'Exportar respaldo'),
      h('label', { class: 'boton secundario', for: 'importar' }, 'Importar respaldo'), archivo,
    ),
    h('section', { class: 'bloque' },
      h('h2', {}, 'Borrar todo'),
      h('p', {}, 'Borra mercados, productos, precios, fotos y la lista de este teléfono.'),
      h('button', { class: 'boton peligro', onclick: () => confirmarBorrarTodo(ctx) }, 'Borrar todo'),
    ),
  );
}

function confirmarBorrarTodo(ctx) {
  const c = campo({ etiqueta: 'Escribe BORRAR para confirmar', id: 'confirmar-borrar', autocomplete: 'off' });
  const boton = h('button', { class: 'boton peligro', disabled: true }, 'Borrar todos los datos');
  c.input.addEventListener('input', () => { boton.disabled = c.input.value.trim() !== 'BORRAR'; });
  const cerrar = abrirHoja('¿Borrar todos los datos?', h('div', {},
    h('p', {}, 'No se puede deshacer. Exporta un respaldo antes si quieres conservar algo.'),
    c.nodo, boton,
    h('button', { class: 'boton secundario', onclick: () => cerrar() }, 'Cancelar'),
  ));
  boton.addEventListener('click', async () => {
    await ctx.repo.borrarTodo();
    cerrar();
    ctx.ir('#/bienvenida/mercados');
  });
}
