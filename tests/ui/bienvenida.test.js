import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarBienvenida } from '../../src/ui/vista-bienvenida.js';

test('crear mercados en la bienvenida y pasar a la lista', async () => {
  const repo = await abrirDB('ui-bienvenida');
  const raiz = document.createElement('div');
  const ctx = { repo, ir: vi.fn() };
  await pintarBienvenida(raiz, ctx, ['mercados']);
  const inputs = raiz.querySelectorAll('input');
  inputs[0].value = 'D1';
  inputs[1].value = 'Ara';
  raiz.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  expect((await repo.listarMercados()).map((m) => m.nombre)).toEqual(['D1', 'Ara']);
});

test('sin ningún mercado muestra error y no guarda', async () => {
  const repo = await abrirDB('ui-bienvenida-2');
  const raiz = document.createElement('div');
  const ctx = { repo, ir: vi.fn() };
  await pintarBienvenida(raiz, ctx, ['mercados']);
  raiz.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
  expect(ctx.ir).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Escribe al menos un mercado');
});

test('guardián: primero instalar (iPhone), luego la cuenta, luego los mercados; nada se ve sin sesión', async () => {
  const { redireccion } = await import('../../src/ui/guardian.js');
  const repo = await abrirDB('ui-bienvenida-4');
  const base = { repo, esIOS: false, instalada: false, sinInstalar: false, conectado: false };
  for (const vista of ['lista', 'ajustes', 'productos', 'precio']) {
    expect(await redireccion({ ...base, vista })).toEqual(['cuenta']);
  }
  expect(await redireccion({ ...base, vista: 'bienvenida', paso: 'mercados' })).toEqual(['cuenta']);
  expect(await redireccion({ ...base, vista: 'bienvenida', paso: 'cuenta' })).toBeNull();
  expect(await redireccion({ ...base, vista: 'lista', esIOS: true })).toEqual(['instalar']);
  expect(await redireccion({ ...base, vista: 'lista', conectado: true })).toEqual(['mercados']);
  expect(await redireccion({ ...base, vista: 'ajustes', conectado: true })).toEqual(['mercados']);
  await repo.guardarMercado({ nombre: 'D1' });
  expect(await redireccion({ ...base, vista: 'lista', conectado: true })).toBeNull();
});

// Paso de cuenta
const boton = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
const escribir = (raiz, sel, v) => { const i = raiz.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input')); };
let k = 0;
function nubeFalsa({ pideConfirmar = false } = {}) {
  return {
    entrar: vi.fn(async (correo, clave) => { if (clave !== 'secreta123') throw new Error('Invalid login credentials'); }),
    crearCuenta: vi.fn(async () => ({ necesitaConfirmar: pideConfirmar })),
  };
}
async function pasoCuenta(nube, { conMercados = false } = {}) {
  const repo = await abrirDB(`ui-cuenta-${k++}`);
  const sync = { correr: vi.fn(async () => { if (conMercados) await repo.guardarMercado({ nombre: 'D1' }); return { ok: true }; }) };
  const ctx = { repo, ir: vi.fn(), obtenerNube: async () => nube, sync };
  const raiz = document.createElement('div');
  await pintarBienvenida(raiz, ctx, ['cuenta']);
  return { raiz, ctx, sync };
}

test('lo primero es entrar: con datos en la nube lleva a la lista', async () => {
  const nube = nubeFalsa();
  const { raiz, ctx, sync } = await pasoCuenta(nube, { conMercados: true });
  expect(raiz.textContent).toContain('Entra a Mercado');
  expect(raiz.textContent).not.toMatch(/gemini/i);
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'secreta123');
  boton(raiz, 'Entrar').click();
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  expect(nube.entrar).toHaveBeenCalledWith('yo@correo.com', 'secreta123');
  expect(sync.correr).toHaveBeenCalled();
});

test('cuenta nueva sin datos lleva a crear los mercados', async () => {
  const { raiz, ctx } = await pasoCuenta(nubeFalsa());
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'secreta123');
  boton(raiz, 'Crear cuenta').click();
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/bienvenida/mercados'));
});

test('crear cuenta que pide confirmar el correo lo explica', async () => {
  const { raiz, ctx } = await pasoCuenta(nubeFalsa({ pideConfirmar: true }));
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'secreta123');
  boton(raiz, 'Crear cuenta').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Te enviamos un correo para confirmar'));
  expect(ctx.ir).not.toHaveBeenCalled();
});

test('contraseña equivocada y datos inválidos muestran errores claros', async () => {
  const nube = nubeFalsa();
  const { raiz } = await pasoCuenta(nube);
  escribir(raiz, '#correo', 'yo');
  escribir(raiz, '#clave', '123');
  boton(raiz, 'Entrar').click();
  await new Promise((r) => setTimeout(r, 20));
  expect(nube.entrar).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Escribe un correo válido');
  expect(raiz.textContent).toContain('al menos 8 caracteres');
  escribir(raiz, '#correo', 'yo@correo.com');
  escribir(raiz, '#clave', 'otra-cosa');
  boton(raiz, 'Entrar').click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Correo o contraseña incorrectos'));
});
