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
