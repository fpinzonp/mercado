import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarAjustes } from '../../src/ui/vista-ajustes.js';

let n = 0;
const boton = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
const escribir = (raiz, sel, v) => { const i = raiz.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input')); };

function nubeFalsa(conSesion = false) {
  let email = conSesion ? 'yo@correo.com' : null;
  return {
    cuenta: vi.fn(async () => (email ? { email } : null)),
    enviarCodigo: vi.fn(async () => {}),
    verificarCodigo: vi.fn(async (correo, codigo) => {
      if (codigo !== '123456') throw new Error('Token has expired or is invalid');
      email = correo;
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

test('sin sesión: pide el correo, envía el código y entra con él', async () => {
  const nube = nubeFalsa();
  const { raiz, sync } = await pintar(nube);
  expect(raiz.textContent).toContain('Tus dispositivos');
  escribir(raiz, '#correo', 'yo@correo.com');
  boton(raiz, 'Enviarme un código').click();
  await vi.waitFor(() => expect(nube.enviarCodigo).toHaveBeenCalledWith('yo@correo.com'));
  await vi.waitFor(() => expect(raiz.querySelector('#codigo')).toBeTruthy());
  escribir(raiz, '#codigo', '123456');
  boton(raiz, 'Entrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Conectado como yo@correo.com'));
  expect(sync.correr).toHaveBeenCalled();
});

test('un código equivocado muestra un error claro', async () => {
  const nube = nubeFalsa();
  const { raiz } = await pintar(nube);
  escribir(raiz, '#correo', 'yo@correo.com');
  boton(raiz, 'Enviarme un código').click();
  await vi.waitFor(() => expect(raiz.querySelector('#codigo')).toBeTruthy());
  escribir(raiz, '#codigo', '000000');
  boton(raiz, 'Entrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('El código no sirve o ya venció'));
});

test('un correo inválido no se envía', async () => {
  const nube = nubeFalsa();
  const { raiz } = await pintar(nube);
  escribir(raiz, '#correo', 'yo');
  boton(raiz, 'Enviarme un código').click();
  await new Promise((r) => setTimeout(r, 20));
  expect(nube.enviarCodigo).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Escribe un correo válido');
});

test('con sesión: sincronizar ahora y cerrar sesión', async () => {
  const nube = nubeFalsa(true);
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
  const nube = nubeFalsa(true);
  const { raiz } = await pintar(nube, { correr: vi.fn(async () => ({ ok: false, sinRed: true })) });
  boton(raiz, 'Sincronizar ahora').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Sin señal: tus cambios quedan guardados en el teléfono'));
});
