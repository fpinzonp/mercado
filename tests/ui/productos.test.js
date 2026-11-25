import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarProductos } from '../../src/ui/vista-productos.js';

const hoy = '2026-11-24';
let n = 0;

async function escenario() {
  const repo = await abrirDB(`ui-productos-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1', orden: 0 });
  const exito = await repo.guardarMercado({ nombre: 'Éxito', orden: 1 });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  const cafe = await repo.guardarProducto({ nombre: 'Café' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: exito.id, nombreReal: 'Arroz Roa', tamano: 500, precioNormal: 2400 }, hoy);
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };
  const raiz = document.createElement('div');
  await pintarProductos(raiz, ctx);
  return { repo, ctx, raiz, arroz, cafe };
}

const filaDe = (raiz, nombre) =>
  [...raiz.querySelectorAll('.producto')].find((f) => f.querySelector('.producto-nombre').textContent === nombre);
const boton = (nodo, texto) => [...nodo.querySelectorAll('button')].find((b) => b.textContent === texto);

test('muestra todos los productos aunque no estén en la lista, con dónde salen más baratos', async () => {
  const { raiz } = await escenario();
  expect(filaDe(raiz, 'Arroz').textContent).toContain('Más barato en D1');
  expect(filaDe(raiz, 'Arroz').textContent).toContain('$4,50/g');
  expect(filaDe(raiz, 'Café').textContent).toContain('Sin precios todavía');
});

test('crear un producto nuevo no lo pone en la lista', async () => {
  const { repo, raiz } = await escenario();
  const nombre = raiz.querySelector('#nuevo-producto');
  nombre.value = 'Atún';
  raiz.querySelector('form.nuevo-producto').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(async () => expect((await repo.listarProductos()).map((p) => p.nombre)).toContain('Atún'));
  expect(await repo.listarItems()).toHaveLength(0);
  await vi.waitFor(() => expect(filaDe(raiz, 'Atún')).toBeTruthy());
});

test('crear un producto con un nombre que ya existe no lo duplica', async () => {
  const { repo, raiz } = await escenario();
  raiz.querySelector('#nuevo-producto').value = ' arroz ';
  raiz.querySelector('form.nuevo-producto').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  expect(await repo.listarProductos()).toHaveLength(2);
  expect(raiz.textContent).toContain('Ya tienes «Arroz»');
});

test('agregar a la lista y quitar de la lista desde Productos', async () => {
  const { repo, raiz, cafe } = await escenario();
  boton(filaDe(raiz, 'Café'), 'Agregar a la lista').click();
  await vi.waitFor(async () => expect((await repo.listarItems()).map((i) => i.productoId)).toEqual([cafe.id]));
  await vi.waitFor(() => expect(boton(filaDe(raiz, 'Café'), 'Quitar de la lista')).toBeTruthy());
  expect(filaDe(raiz, 'Café').textContent).toContain('En la lista');
  boton(filaDe(raiz, 'Café'), 'Quitar de la lista').click();
  await vi.waitFor(async () => expect(await repo.listarItems()).toHaveLength(0));
});

test('agregar precio abre el registro de precio de ese producto', async () => {
  const { ctx, raiz, cafe } = await escenario();
  boton(filaDe(raiz, 'Café'), 'Agregar precio').click();
  expect(ctx.ir).toHaveBeenCalledWith(`#/precio/${cafe.id}`);
});

test('buscar filtra los productos sin tildes ni mayúsculas', async () => {
  const { raiz } = await escenario();
  const b = raiz.querySelector('#buscar-producto');
  b.value = 'CAFE';
  b.dispatchEvent(new Event('input'));
  expect(filaDe(raiz, 'Café').hidden).toBe(false);
  expect(filaDe(raiz, 'Arroz').hidden).toBe(true);
});

test('con precio guardado el botón dice Actualizar precio', async () => {
  const { raiz } = await escenario();
  expect(boton(filaDe(raiz, 'Arroz'), 'Actualizar precio')).toBeTruthy();
  expect(boton(filaDe(raiz, 'Café'), 'Agregar precio')).toBeTruthy();
});
