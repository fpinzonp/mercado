import { h, limpiar, campo, abrirHoja, aviso } from './dom.js';
import { exportarRespaldo, importarRespaldo } from '../datos/respaldo.js';
import { hoyLocal } from '../logica/fechas.js';

/** Comparte o descarga el respaldo y marca ultimoRespaldo. Lo usa también el aviso de la Lista. */
export async function guardarRespaldo(repo) {
  try {
    const datos = await exportarRespaldo(repo);
    const nombre = `mercado-respaldo-${hoyLocal()}.json`;
    const archivo = new File([JSON.stringify(datos)], nombre, { type: 'application/json' });
    let compartido = false;
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Respaldo de Mercado' });
        compartido = true;
      } catch (e) {
        if (e?.name === 'AbortError') return false;
        // p. ej. NotAllowedError si armar el archivo tardó demasiado: se descarga en su lugar
      }
    }
    if (!compartido) {
      const a = h('a', { href: URL.createObjectURL(archivo), download: nombre });
      document.body.append(a);
      a.click();
      a.remove();
    }
    await repo.guardarAjuste('ultimoRespaldo', hoyLocal());
    return true;
  } catch {
    aviso('No se pudo guardar el respaldo. Inténtalo otra vez desde Ajustes.');
    return false;
  }
}

const MENSAJE_SYNC = (r) => {
  if (!r) return '';
  if (r.ok) return `Sincronizado. Bajé ${r.bajados ?? 0} y subí ${r.subidos ?? 0} cambios.`;
  if (r.sinRed) return 'Sin señal: tus cambios quedan guardados en el teléfono y se suben cuando vuelva.';
  return `No se pudo sincronizar (${r.error ?? 'error desconocido'}). Se vuelve a intentar solo.`;
};
const haceCuanto = (ms) => {
  if (!ms) return 'nunca';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

/** Tu cuenta: estado de la sincronización, sincronizar ahora y cerrar sesión (borra este teléfono). */
async function seccionCuenta(ctx) {
  const nube = await ctx.obtenerNube?.().catch(() => null);
  const cuenta = nube ? await nube.cuenta().catch(() => null) : null;
  if (!cuenta) return null;
  const { repo } = ctx;
  const estado = h('p', { role: 'status' }, `Última sincronización: ${haceCuanto(await repo.leerAjuste('ultimaSync'))}.`);
  let ocupado = false;

  const salir = async () => {
    estado.textContent = 'Subiendo los últimos cambios…';
    const r = await ctx.sync?.correr();
    const sinSubir = await repo.db.count('pendientes');
    const cerrar = abrirHoja('¿Cerrar sesión?', h('div', {},
      h('p', {}, 'Se borran la lista, los precios y las fotos de este teléfono. Siguen guardados en tu cuenta: al volver a entrar se bajan de nuevo.'),
      sinSubir ? h('p', { class: 'error' }, `Hay ${sinSubir} ${sinSubir === 1 ? 'cambio' : 'cambios'} sin subir${r?.sinRed ? ' (no hay señal)' : ''}. Si cierras sesión ahora se pierden.`) : null,
      h('button', {
        class: 'boton peligro',
        onclick: async () => {
          await nube.salir();
          await repo.borrarTodo();
          cerrar();
          ctx.ir('#/bienvenida/cuenta');
        },
      }, 'Cerrar sesión y borrar este teléfono'),
      h('button', { class: 'boton secundario', onclick: () => cerrar() }, 'Cancelar'),
    ));
    estado.textContent = MENSAJE_SYNC(r);
  };

  return h('section', { class: 'bloque cuenta' },
    h('h2', {}, 'Tu cuenta'),
    h('p', {}, `Conectado como ${cuenta.email}. Tus datos se guardan en la nube y se sincronizan solos entre tus dispositivos.`),
    estado,
    h('button', {
      class: 'boton', type: 'button',
      onclick: async () => {
        if (ocupado) return;
        ocupado = true;
        estado.textContent = 'Sincronizando…';
        estado.textContent = MENSAJE_SYNC(await ctx.sync?.correr());
        ocupado = false;
      },
    }, 'Sincronizar ahora'),
    h('button', { class: 'boton secundario', type: 'button', onclick: salir }, 'Cerrar sesión'),
  );
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

  const dispositivos = await seccionCuenta(ctx);
  raiz.append(
    h('h1', {}, 'Ajustes'),
    dispositivos,
    h('section', { class: 'bloque' }, h('h2', {}, 'Mercados'), listaMercados, formNuevo),
    h('section', { class: 'bloque' },
      h('h2', {}, 'Respaldo'),
      h('p', {}, 'Guarda una copia de tu lista, precios y fotos en Archivos o iCloud. Tus datos ya se guardan en la nube; esto es una copia extra.'),
      h('button', { class: 'boton', onclick: async () => { if (await guardarRespaldo(repo)) aviso('Respaldo guardado'); } }, 'Exportar respaldo'),
      h('label', { class: 'boton secundario', for: 'importar' }, 'Importar respaldo'), archivo,
    ),
  );
}

