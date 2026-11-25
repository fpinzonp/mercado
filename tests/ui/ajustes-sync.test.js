import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarAjustes } from '../../src/ui/vista-ajustes.js';

let n = 0;
const boton = (nodo, texto) => [...nodo.querySelectorAll('button')].find((b) => b.textContent === texto);

function nubeFalsa() {
  let email = 'yo@correo.com';
  return {
    cuenta: vi.fn(async () => (email ? { email } : null)),
    salir: vi.fn(async () => { email = null; }),
  };
}

async function pintar(nube, sync = { correr: vi.fn(async () => ({ ok: true, bajados: 2, subidos: 3 })) }) {
  const repo = await abrirDB(`ui-ajustes-sync-${n++}`);
  await repo.guardarMercado({ nombre: 'D1' });
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const ctx = { repo, hoy: () => '2026-11-24', ir: vi.fn(), refrescar: vi.fn(), obtenerNube: async () => nube, sync };
  await pintarAjustes(raiz, ctx);
  return { raiz, ctx, sync, repo };
}

test('Ajustes no muestra nada de Gemini ni claves', async () => {
  const { raiz } = await pintar(nubeFalsa());
  expect(raiz.textContent).not.toMatch(/gemini|clave/i);
  expect(raiz.querySelector('input[type=password]')).toBeNull();
  raiz.remove();
});

test('Tu cuenta: muestra el correo y sincroniza ahora', async () => {
  const { raiz, sync } = await pintar(nubeFalsa());
  expect(raiz.textContent).toContain('Conectado como yo@correo.com');
  boton(raiz, 'Sincronizar ahora').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Sincronizado'));
  expect(sync.correr).toHaveBeenCalled();
  raiz.remove();
});

test('sin señal lo dice sin alarmar', async () => {
  const { raiz } = await pintar(nubeFalsa(), { correr: vi.fn(async () => ({ ok: false, sinRed: true })) });
  boton(raiz, 'Sincronizar ahora').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Sin señal: tus cambios quedan guardados en el teléfono'));
  raiz.remove();
});

test('cerrar sesión sube lo pendiente, avisa y borra los datos de este teléfono', async () => {
  const nube = nubeFalsa();
  const { raiz, ctx, repo, sync } = await pintar(nube, { correr: vi.fn(async () => ({ ok: false, sinRed: true })) });
  boton(raiz, 'Cerrar sesión').click();
  const hoja = await vi.waitFor(() => { const x = document.querySelector('.hoja'); expect(x).toBeTruthy(); return x; });
  expect(sync.correr).toHaveBeenCalled();
  expect(hoja.textContent).toMatch(/Hay \d+ cambios? sin subir/);
  boton(hoja, 'Cerrar sesión y borrar este teléfono').click();
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/bienvenida/cuenta'));
  expect(nube.salir).toHaveBeenCalled();
  expect(await repo.listarMercados()).toHaveLength(0);
  raiz.remove();
});
