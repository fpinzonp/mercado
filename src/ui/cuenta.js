import { h, campo } from './dom.js';

const MENSAJES = [
  [/invalid login|credentials/i, 'Correo o contraseña incorrectos.'],
  [/not confirmed/i, 'Falta confirmar el correo: abre el correo de Supabase y toca el enlace; luego vuelve aquí y toca Entrar.'],
  [/already registered|exists/i, 'Ese correo ya tiene cuenta: toca Entrar.'],
  [/signups? not allowed|disabled/i, 'No se pueden crear cuentas nuevas. Entra con tu cuenta.'],
  [/rate|limit|seconds/i, 'Demasiados intentos seguidos. Espera unos minutos.'],
  [/fetch|network/i, 'Sin señal. La primera vez necesitas conexión para entrar.'],
];

/**
 * Formulario de entrar / crear cuenta. alEntrar() se llama con la sesión ya abierta.
 * @param {{ nube, alEntrar: () => Promise<void> }} opciones
 */
export function formCuenta({ nube, alEntrar }) {
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
      estado.textContent = MENSAJES.find(([re]) => re.test(m))?.[1] ?? `No se pudo: ${m}`;
    }
    ocupado = false;
  };
  const entrar = accion(async ({ email, pass }) => {
    await nube.entrar(email, pass);
    estado.textContent = 'Bajando tus datos…';
    await alEntrar();
  });
  const crear = accion(async ({ email, pass }) => {
    const { necesitaConfirmar } = await nube.crearCuenta(email, pass);
    if (necesitaConfirmar) {
      estado.textContent = `Te enviamos un correo para confirmar la cuenta a ${email}. Abre el enlace (puede abrir Safari; no importa), vuelve aquí y toca Entrar.`;
      return;
    }
    await alEntrar();
  });

  const form = h('form', { class: 'cuenta', novalidate: true },
    correo.nodo, clave.nodo,
    h('div', { class: 'acciones-lista' },
      h('button', { class: 'boton', type: 'button', onclick: () => entrar() }, 'Entrar'),
      h('button', { class: 'boton secundario', type: 'button', onclick: crear }, 'Crear cuenta'),
    ),
    estado,
  );
  form.addEventListener('submit', (ev) => { ev.preventDefault(); entrar(); });
  return form;
}
