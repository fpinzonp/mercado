import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarAjustes } from '../../src/ui/vista-ajustes.js';

let n = 0;
const boton = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
const escribir = (raiz, sel, v) => { const i = raiz.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input')); };

function nubeFalsa({ conSesion = false, pideConfirmar = false } = {}) {
  let email = conSesion ? 'yo@correo.com' : null;
  return {
    cuenta: vi.fn(async () => (email ? { email } : null)),
    entrar: vi.fn(async (correo, clave) => {
      if (clave !== 'secreta123') throw new Error('Invalid login credentials');
      email = correo;
    }),
    crearCuenta: vi.fn(async (correo) => {
      if (!pideConfirmar) email = correo;
      return { necesitaConfirmar: pideConfirmar };
    }),
    salir: vi.fn(async () => { email = null; }),
  };
}

async function pintar(nube, sync = { correr: vi.fn(async () => ({ ok: true, bajados: 2, subidos: 3 })) }) {
  const repo = await abrirDB(`ui-ajustes-sync-${n++}`);
  const raiz = document.createElement('div');
  const ctx = { repo, hoy: () => '2026-11-24', ir: vi.fn(), refrescar: vi.fn(), obtenerNube: async () => nube, sync };
  await pintarAjustes(raiz, ctx);
  return { raiz, ctx, sync };
}

test('sin sesión: entra con correo y contraseña y sincroniza', async () => {
  const nube = nubeFalsa();
  const { raiz, sync } = await pintar(nube);
  expect(raiz.textContent).toContain('Tus dispositivos');
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'secreta123');
  boton(raiz, 'Entrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Conectado como yo@correo.com'));
  expect(nube.entrar).toHaveBeenCalledWith('yo@correo.com', 'secreta123');
  expect(sync.correr).toHaveBeenCalled();
});

test('contraseña equivocada muestra un error claro', async () => {
  const { raiz } = await pintar(nubeFalsa());
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'otra-cosa');
  boton(raiz, 'Entrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Correo o contraseña incorrectos'));
});

test('crear cuenta: si hay que confirmar el correo lo explica', async () => {
  const nube = nubeFalsa({ pideConfirmar: true });
  const { raiz } = await pintar(nube);
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'secreta123');
  boton(raiz, 'Crear cuenta').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Te enviamos un correo para confirmar'));
  expect(nube.crearCuenta).toHaveBeenCalledWith('yo@correo.com', 'secreta123');
});

test('crear cuenta sin confirmación entra de una vez', async () => {
  const { raiz } = await pintar(nubeFalsa());
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'secreta123');
  boton(raiz, 'Crear cuenta').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Conectado como yo@correo.com'));
});

test('valida correo y contraseña antes de enviar', async () => {
  const nube = nubeFalsa();
  const { raiz } = await pintar(nube);
  escribir(raiz, '#correo', 'yo');
  escribir(raiz, '#clave', '123');
  boton(raiz, 'Entrar').click();
  await new Promise((r) => setTimeout(r, 20));
  expect(nube.entrar).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Escribe un correo válido');
  expect(raiz.textContent).toContain('al menos 8 caracteres');
});

test('con sesión: sincronizar ahora y cerrar sesión', async () => {
  const nube = nubeFalsa({ conSesion: true });
  const { raiz, sync } = await pintar(nube);
  expect(raiz.textContent).toContain('Conectado como yo@correo.com');
  boton(raiz, 'Sincronizar ahora').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Sincronizado'));
  expect(sync.correr).toHaveBeenCalled();
  boton(raiz, 'Cerrar sesión').click();
  await vi.waitFor(() => expect(raiz.querySelector('#correo')).toBeTruthy());
  expect(nube.salir).toHaveBeenCalled();
});

test('sin señal lo dice sin alarmar', async () => {
  const { raiz } = await pintar(nubeFalsa({ conSesion: true }), { correr: vi.fn(async () => ({ ok: false, sinRed: true })) });
  boton(raiz, 'Sincronizar ahora').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Sin señal: tus cambios quedan guardados en el teléfono'));
});
