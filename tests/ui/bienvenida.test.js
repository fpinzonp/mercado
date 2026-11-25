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

test('en un dispositivo nuevo se puede ir a entrar con la cuenta sin crear mercados', async () => {
  const repo = await abrirDB('ui-bienvenida-3');
  const raiz = document.createElement('div');
  const ctx = { repo, ir: vi.fn() };
  await pintarBienvenida(raiz, ctx, ['mercados']);
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Ya uso Mercado en otro dispositivo').click();
  expect(ctx.ir).toHaveBeenCalledWith('#/ajustes');
});

test('guardián: sin mercados manda a crearlos, salvo en Ajustes (para entrar y bajar los datos)', async () => {
  const { redireccion } = await import('../../src/ui/guardian.js');
  const repo = await abrirDB('ui-bienvenida-4');
  const base = { repo, esIOS: false, instalada: false, sinInstalar: false };
  expect(await redireccion({ ...base, vista: 'lista' })).toEqual(['mercados']);
  expect(await redireccion({ ...base, vista: 'ajustes' })).toBeNull();
  expect(await redireccion({ ...base, vista: 'bienvenida' })).toBeNull();
  expect(await redireccion({ ...base, vista: 'ajustes', esIOS: true })).toEqual(['instalar']);
  expect(await redireccion({ ...base, vista: 'ajustes', esIOS: true, sinInstalar: true })).toBeNull();
  await repo.guardarMercado({ nombre: 'D1' });
  expect(await redireccion({ ...base, vista: 'lista' })).toBeNull();
});
