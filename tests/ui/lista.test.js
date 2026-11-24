import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarLista } from '../../src/ui/vista-lista.js';
import { pintarAgregar } from '../../src/ui/vista-agregar.js';

const hoy = '2026-11-24';
let n = 0;

async function escenario() {
  const repo = await abrirDB(`ui-lista-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1', orden: 0 });
  const exito = await repo.guardarMercado({ nombre: 'Éxito', orden: 1 });
  const ara = await repo.guardarMercado({ nombre: 'Ara', orden: 2 });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: exito.id, nombreReal: 'Arroz Roa', tamano: 500, precioNormal: 2400 }, hoy);
  await repo.guardarOferta({
    productoId: arroz.id, mercadoId: ara.id, nombreReal: 'Arroz Roa', tamano: 1000, precioNormal: 5000,
    precioDescuento: 4000, detalleDescuento: '−20%', descuentoHasta: '2026-11-30',
  }, hoy);
  const item = await repo.guardarItem({ productoId: arroz.id, cantidad: 2000 });
  const ctx = { repo, hoy: () => hoy, ir: vi.fn(), refrescar: vi.fn() };
  return { repo, ctx, d1, ara, arroz, item };
}

const filaDe = (raiz, mercado) =>
  [...raiz.querySelectorAll('.oferta')].find((f) => f.querySelector('.donde').textContent === mercado);

test('la lista muestra costos, unitario, descuento y marcas', async () => {
  const { ctx } = await escenario();
  const raiz = document.createElement('div');
  await pintarLista(raiz, ctx);
  const texto = raiz.textContent;
  expect(texto).toContain('$9.000');
  expect(texto).toContain('$4,50/g');
  expect(texto).toContain('$8.000');
  expect(filaDe(raiz, 'Ara').querySelector('s').textContent).toBe('$5.000');
  expect(filaDe(raiz, 'Ara').textContent).toContain('✓ hoy');
  expect(filaDe(raiz, 'D1').textContent).toContain('✓ normal');
  expect(texto).toContain('Arroz · 2 kg');
});

test('la franja de totales marca al ganador', async () => {
  const { ctx } = await escenario();
  const raiz = document.createElement('div');
  await pintarLista(raiz, ctx);
  const gana = raiz.querySelector('.tag.gana');
  expect(gana.textContent).toContain('Ara');
  expect(gana.textContent).toContain('$8.000');
});

test('tachar desde la lista pregunta el mercado con el más barato preseleccionado', async () => {
  const { ctx, repo, ara, item } = await escenario();
  const raiz = document.createElement('div');
  document.body.append(raiz);
  await pintarLista(raiz, ctx);
  raiz.querySelector('.item input[type=checkbox]').click();
  const hoja = document.querySelector('.hoja');
  expect(hoja.textContent).toContain('¿Dónde lo compraste?');
  expect(hoja.querySelector('input[type=radio]:checked').value).toBe(ara.id);
  hoja.querySelector('button.boton').click();
  await vi.waitFor(async () => expect((await repo.listarItems())[0]).toMatchObject({ id: item.id, tachado: true, compradoEn: ara.id }));
  raiz.remove();
});

test('lista vacía invita a agregar', async () => {
  const repo = await abrirDB(`ui-lista-${n++}`);
  await repo.guardarMercado({ nombre: 'D1' });
  const raiz = document.createElement('div');
  await pintarLista(raiz, { repo, hoy: () => hoy, ir: vi.fn() });
  expect(raiz.textContent).toContain('Tu lista está vacía');
});

test('agregar producto nuevo con cantidad', async () => {
  const repo = await abrirDB(`ui-lista-${n++}`);
  const raiz = document.createElement('div');
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };
  await pintarAgregar(raiz, ctx);
  const buscar = raiz.querySelector('#buscar');
  buscar.value = 'Leche';
  buscar.dispatchEvent(new Event('input'));
  raiz.querySelector('[data-crear]').click();
  raiz.querySelector('input[value=ml]').click();
  raiz.querySelector('#cantidad').value = '6 L';
  raiz.querySelector('form.cantidad').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  const [p] = await repo.listarProductos();
  expect(p).toMatchObject({ nombre: 'Leche', tipoUnidad: 'ml' });
  expect((await repo.listarItems())[0]).toMatchObject({ productoId: p.id, cantidad: 6000 });
});

test('agregar un producto que ya está en la lista suma la cantidad; cantidad inválida muestra error', async () => {
  const { repo, ctx, arroz } = await escenario();
  const raiz = document.createElement('div');
  await pintarAgregar(raiz, ctx);
  const buscar = raiz.querySelector('#buscar');
  buscar.value = 'arroz';
  buscar.dispatchEvent(new Event('input'));
  raiz.querySelector(`[data-producto="${arroz.id}"]`).click();
  raiz.querySelector('#cantidad').value = '0';
  raiz.querySelector('form.cantidad').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
  expect(raiz.textContent).toContain('Escribe una cantidad mayor que cero');
  raiz.querySelector('#cantidad').value = '500 g';
  raiz.querySelector('form.cantidad').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  const items = await repo.listarItems();
  expect(items).toHaveLength(1);
  expect(items[0].cantidad).toBe(2500);
});
