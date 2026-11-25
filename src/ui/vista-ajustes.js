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

/** Iniciar sesión con un código por correo y sincronizar entre dispositivos. */
async function seccionDispositivos(ctx) {
  const nube = await ctx.obtenerNube?.().catch(() => null);
  if (!nube) return null;
  const seccion = h('section', { class: 'bloque dispositivos' });

  const pintar = async () => {
    const cuenta = await nube.cuenta().catch(() => null);
    seccion.replaceChildren(h('h2', {}, 'Tus dispositivos'));
    if (cuenta) {
      const estado = h('p', { role: 'status' }, `Última sincronización: ${haceCuanto(await ctx.repo.leerAjuste('ultimaSync'))}.`);
      let ocupado = false;
      seccion.append(
        h('p', {}, `Conectado como ${cuenta.email}. Tus datos se guardan también en la nube y se sincronizan solos.`),
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
        h('button', { class: 'boton secundario', type: 'button', onclick: async () => { await nube.salir(); await pintar(); } }, 'Cerrar sesión'),
      );
      return;
    }

    const correo = campo({ etiqueta: 'Tu correo', id: 'correo', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'nombre@correo.com' });
    const clave = campo({ etiqueta: 'Contraseña', id: 'clave', type: 'password', autocomplete: 'current-password', ayuda: 'Al menos 8 caracteres. La misma en todos tus dispositivos.' });
    const estado = h('p', { class: 'ayuda', role: 'status' });
    correo.input.addEventListener('input', () => correo.mostrarError(''));
    clave.input.addEventListener('input', () => clave.mostrarError(''));
    const validar = () => {
      const email = correo.input.value.trim();
      const pass = clave.input.value;
      const okCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      correo.mostrarError(okCorreo ? '' : 'Escribe un correo válido, por ejemplo nombre@correo.com.');
      clave.mostrarError(pass.length >= 8 ? '' : 'La contraseña debe tener al menos 8 caracteres.');
      return okCorreo && pass.length >= 8 ? { email, pass } : null;
    };
    let ocupado = false;
    const accion = (fn) => async () => {
      const datos = validar();
      if (!datos || ocupado) return;
      ocupado = true;
      estado.textContent = 'Un momento…';
      try {
        await fn(datos);
      } catch (e) {
        const m = e?.message ?? '';
        estado.textContent = /invalid login|credentials/i.test(m) ? 'Correo o contraseña incorrectos.'
          : /not confirmed/i.test(m) ? 'Falta confirmar el correo: abre el correo de Supabase y toca el enlace; luego vuelve aquí y toca Entrar.'
            : /already registered|exists/i.test(m) ? 'Ese correo ya tiene cuenta: toca Entrar.'
              : /rate|limit|seconds/i.test(m) ? 'Demasiados intentos seguidos. Espera unos minutos.'
                : /fetch|network/i.test(m) ? 'Sin señal. Inténtalo cuando tengas conexión.'
                  : `No se pudo: ${m}`;
      }
      ocupado = false;
    };
    // Primera vez en este dispositivo: baja los datos y, si ya hay mercados, lleva a la lista.
    const despuesDeEntrar = async () => {
      estado.textContent = 'Bajando tus datos…';
      const r = await ctx.sync?.correr();
      if ((await ctx.repo.listarMercados()).length && r?.ok) {
        aviso('Listo: tus datos están en este dispositivo');
        ctx.ir('#/lista');
      }
    };
    const entrar = accion(async ({ email, pass }) => {
      await nube.entrar(email, pass);
      await pintar();
      await despuesDeEntrar();
    });
    const crear = accion(async ({ email, pass }) => {
      const { necesitaConfirmar } = await nube.crearCuenta(email, pass);
      if (necesitaConfirmar) {
        estado.textContent = `Te enviamos un correo para confirmar la cuenta a ${email}. Abre el enlace (puede abrir Safari; no importa), vuelve aquí y toca Entrar.`;
        return;
      }
      await pintar();
      await despuesDeEntrar();
    });
    seccion.append(
      h('p', {}, 'Entra con tu correo para tener la misma lista, precios y fotos en todos tus dispositivos. Sin señal la app sigue funcionando y sube los cambios después.'),
      correo.nodo, clave.nodo,
      h('div', { class: 'acciones-lista' },
        h('button', { class: 'boton', type: 'button', onclick: entrar }, 'Entrar'),
        h('button', { class: 'boton secundario', type: 'button', onclick: crear }, 'Crear cuenta'),
      ),
      estado,
    );
  };
  await pintar();
  return seccion;
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

  const dispositivos = await seccionDispositivos(ctx);
  raiz.append(
    h('h1', {}, 'Ajustes'),
    dispositivos,
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
      h('p', {}, 'Borra mercados, productos, precios, fotos y la lista de este teléfono. Lo guardado en la nube no se borra.'),
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
