import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarComprar } from '../../src/ui/vista-comprar.js';

const hoy = '2026-11-24';
let n = 0;

async function escenario() {
  const repo = await abrirDB(`ui-comprar-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1', orden: 0 });
  const exito = await repo.guardarMercado({ nombre: 'Éxito', orden: 1 });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: exito.id, nombreReal: 'Arroz Roa', tamano: 500, precioNormal: 2400 }, hoy);
  const item = await repo.guardarItem({ productoId: arroz.id, cantidad: 2000 });
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };
  return { repo, ctx, d1, exito, arroz, item };
}

test('sin mercado activo pide elegirlo', async () => {
  const { repo, ctx, exito } = await escenario();
  const raiz = document.createElement('div');
  await pintarComprar(raiz, ctx);
  expect(raiz.textContent).toContain('¿En qué mercado estás?');
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Éxito').click();
  await vi.waitFor(async () => expect(await repo.leerAjuste('mercadoActivo')).toBe(exito.id));
});

test('en Éxito el arroz va a "más barato en otro mercado" y tachar registra Éxito', async () => {
  const { repo, ctx, exito, item } = await escenario();
  await repo.guardarAjuste('mercadoActivo', exito.id);
  const raiz = document.createElement('div');
  await pintarComprar(raiz, ctx);
  expect(raiz.textContent).toContain('Estás en Éxito');
  expect(raiz.querySelector('.aqui .item')).toBeNull();
  const otros = raiz.querySelector('details.otros');
  expect(otros.querySelector('summary').textContent).toContain('Más barato en otro mercado (1)');
  expect(otros.textContent).toContain('D1');
  expect(otros.textContent).toContain('$600');
  otros.querySelector('input[type=checkbox]').click();
  await vi.waitFor(async () => expect((await repo.listarItems())[0]).toMatchObject({ id: item.id, tachado: true, compradoEn: exito.id }));
});

test('en D1 el arroz está en "cómpralo aquí" con su costo', async () => {
  const { repo, ctx, d1 } = await escenario();
  await repo.guardarAjuste('mercadoActivo', d1.id);
  const raiz = document.createElement('div');
  await pintarComprar(raiz, ctx);
  const aqui = raiz.querySelector('.aqui');
  expect(aqui.textContent).toContain('Arroz');
  expect(aqui.textContent).toContain('$9.000');
});

test('todo tachado muestra mensaje y Terminar borra el mercado activo', async () => {
  const { repo, ctx, d1, item } = await escenario();
  await repo.guardarAjuste('mercadoActivo', d1.id);
  await repo.tacharItem(item.id, d1.id);
  const raiz = document.createElement('div');
  await pintarComprar(raiz, ctx);
  expect(raiz.textContent).toContain('Ya tienes todo lo de la lista');
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Terminar').click();
  await vi.waitFor(async () => expect(await repo.leerAjuste('mercadoActivo')).toBeUndefined());
});
