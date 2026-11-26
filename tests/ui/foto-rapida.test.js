import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarPrecio } from '../../src/ui/vista-precio.js';
import { pintarProductos } from '../../src/ui/vista-productos.js';

const hoy = '2026-11-24';
let n = 0;
const boton = (nodo, texto) => [...nodo.querySelectorAll('button')].find((b) => b.textContent === texto);
const escribir = (raiz, sel, v) => { const i = raiz.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input')); };
const enviar = (raiz) => raiz.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
const vacio = { fuente: 'gemini', nombre: null, precioNormal: null, precioDescuento: null, porcentaje: null, detalle: null, hasta: null, tamano: null, unidad: null };

async function fotoTag(raiz) {
  const input = raiz.querySelector('#foto-tag');
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'tag.jpg', { type: 'image/jpeg' })] });
  input.dispatchEvent(new Event('change'));
}

async function base() {
  const repo = await abrirDB(`ui-foto-rapida-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1', orden: 0 });
  return { repo, d1 };
}
const ctxCon = (repo, tag) => ({
  repo, hoy: () => hoy, ir: vi.fn(), rutaAnterior: '#/productos',
  leerTag: vi.fn(async () => ({ ...vacio, ...tag })), reducirImagen: async (f) => f,
});

test('las fotos se pueden tomar con la cámara o elegir de la galería', async () => {
  const { repo } = await base();
  const p = await repo.guardarProducto({ nombre: 'Arroz' });
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctxCon(repo, {}), [p.id]);
  for (const input of raiz.querySelectorAll('input[type=file]')) {
    expect(input.hasAttribute('capture')).toBe(false);
    expect(input.getAttribute('accept')).toBe('image/*');
  }
});

test('una sola foto del tag llena también el nombre si está vacío', async () => {
  const { repo } = await base();
  const p = await repo.guardarProducto({ nombre: 'Arroz' });
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctxCon(repo, { nombre: 'Arroz Diana', precioNormal: 4500, tamano: 1000, unidad: 'g' }), [p.id]);
  await fotoTag(raiz);
  await vi.waitFor(() => expect(raiz.querySelector('#nombre').value).toBe('Arroz Diana'));
  expect(raiz.querySelector('#precio').value).toBe('4.500');
  expect(raiz.querySelector('#tamano').value).toBe('1000');
  expect(raiz.textContent).not.toContain('Falta:');
});

test('el nombre del tag no pisa el que ya escribí', async () => {
  const { repo } = await base();
  const p = await repo.guardarProducto({ nombre: 'Arroz' });
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctxCon(repo, { nombre: 'Arroz Diana', precioNormal: 4500 }), [p.id]);
  escribir(raiz, '#nombre', 'Arroz Roa');
  await fotoTag(raiz);
  await vi.waitFor(() => expect(raiz.querySelector('#precio').value).toBe('4.500'));
  expect(raiz.querySelector('#nombre').value).toBe('Arroz Roa');
});

test('tag sin nombre: avisa que falta el nombre', async () => {
  const { repo } = await base();
  const p = await repo.guardarProducto({ nombre: 'Arroz' });
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctxCon(repo, { precioNormal: 4500, tamano: 1000, unidad: 'g' }), [p.id]);
  await fotoTag(raiz);
  await vi.waitFor(() => expect(raiz.textContent).toMatch(/Falta: nombre/));
});

test('producto nuevo con foto en un solo paso: el tag propone el nombre y al guardar crea producto y precio', async () => {
  const { repo, d1 } = await base();
  const ctx = ctxCon(repo, { nombre: 'Café Sello Rojo', precioNormal: 15000, tamano: 500, unidad: 'g' });
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctx, ['nuevo']);
  expect(raiz.querySelector('h1').textContent).toBe('Nuevo producto');
  await fotoTag(raiz);
  await vi.waitFor(() => expect(raiz.querySelector('#producto-nombre').value).toBe('Café Sello Rojo'));
  escribir(raiz, '#producto-nombre', 'Café');
  enviar(raiz);
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/productos'));
  const [p] = await repo.listarProductos();
  expect(p).toMatchObject({ nombre: 'Café', tipoUnidad: 'g' });
  expect((await repo.ofertasPorProducto()).get(p.id)[0]).toMatchObject({ mercadoId: d1.id, nombreReal: 'Café Sello Rojo', precioNormal: 15000, tamano: 500 });
  expect(await repo.listarItems()).toHaveLength(0);
});

test('producto nuevo con un nombre que ya existe usa el existente (sin repetidos)', async () => {
  const { repo } = await base();
  const cafe = await repo.guardarProducto({ nombre: 'Café', tipoUnidad: 'g' });
  const ctx = ctxCon(repo, { nombre: 'Café Águila Roja', precioNormal: 13000, tamano: 500, unidad: 'g' });
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctx, ['nuevo']);
  escribir(raiz, '#producto-nombre', '  cafe ');
  await fotoTag(raiz);
  await vi.waitFor(() => expect(raiz.querySelector('#precio').value).toBe('13.000'));
  enviar(raiz);
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalled());
  expect(await repo.listarProductos()).toHaveLength(1);
  expect((await repo.ofertasPorProducto()).get(cafe.id)[0].nombreReal).toBe('Café Águila Roja');
});

test('producto nuevo sin nombre de producto ni nombre real no se guarda', async () => {
  const { repo } = await base();
  const ctx = ctxCon(repo, {});
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctx, ['nuevo']);
  escribir(raiz, '#tamano', '500 g');
  escribir(raiz, '#precio', '4500');
  enviar(raiz);
  await new Promise((r) => setTimeout(r, 30));
  expect(ctx.ir).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Escribe el nombre del producto');
  expect(await repo.listarProductos()).toHaveLength(0);
});

test('en Productos: Crear lleva al registro de precio y hay un botón para empezar con foto', async () => {
  const { repo } = await base();
  const raiz = document.createElement('div');
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };
  await pintarProductos(raiz, ctx);
  raiz.querySelector('#nuevo-producto').value = 'Atún';
  raiz.querySelector('form.nuevo-producto').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(async () => expect(await repo.listarProductos()).toHaveLength(1));
  const [p] = await repo.listarProductos();
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith(`#/precio/${p.id}`));
  boton(raiz, 'Nuevo producto con foto').click();
  expect(ctx.ir).toHaveBeenCalledWith('#/precio/nuevo');
});
