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
  expect(filaDe(raiz, 'D1').querySelector('.costo').textContent).toBe('$4.500');
  expect(filaDe(raiz, 'D1').textContent).toContain('$4,50/g');
  expect(filaDe(raiz, 'Ara').querySelector('.costo').textContent).toBe('$4.000');
  expect(filaDe(raiz, 'Ara').querySelector('s').textContent).toBe('$5.000');
  expect(filaDe(raiz, 'Ara').textContent).toContain('✓ hoy');
  expect(filaDe(raiz, 'D1').textContent).toContain('✓ normal');
  // El orden es por precio por gramo: Ara $4,00, D1 $4,50, Éxito $4,80 (aunque su paquete cueste menos).
  expect([...raiz.querySelectorAll('.oferta .donde')].map((d) => d.textContent)).toEqual(['Ara', 'D1', 'Éxito']);
});

test('un ítem viejo con cantidad se muestra solo con el nombre', async () => {
  const { ctx } = await escenario();
  const raiz = document.createElement('div');
  await pintarLista(raiz, ctx);
  expect(raiz.querySelector('.item-nombre').textContent).toBe('Arroz');
  expect(raiz.textContent).not.toContain('2 kg');
});

test('la franja de totales marca al ganador', async () => {
  const { ctx } = await escenario();
  const raiz = document.createElement('div');
  await pintarLista(raiz, ctx);
  const gana = raiz.querySelector('.tag.gana');
  expect(gana.textContent).toContain('Ara');
  expect(gana.textContent).toContain('$4.000');
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

const buscarEn = (raiz, texto) => {
  const b = raiz.querySelector('#buscar');
  b.value = texto;
  b.dispatchEvent(new Event('input'));
};

test('agregar un producto nuevo pide solo el nombre y lo crea sin tipo de medida', async () => {
  const repo = await abrirDB(`ui-lista-${n++}`);
  const raiz = document.createElement('div');
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };
  await pintarAgregar(raiz, ctx);
  expect(raiz.querySelector('#cantidad')).toBeNull();
  buscarEn(raiz, 'Leche');
  raiz.querySelector('[data-crear]').click();
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  const [p] = await repo.listarProductos();
  expect(p.nombre).toBe('Leche');
  expect(p.tipoUnidad).toBeUndefined();
  const [i] = await repo.listarItems();
  expect(i).toMatchObject({ productoId: p.id, tachado: false });
  expect(i.cantidad).toBeUndefined();
});

test('agregar a la lista un producto del catálogo lo reutiliza', async () => {
  const repo = await abrirDB(`ui-lista-${n++}`);
  const cafe = await repo.guardarProducto({ nombre: 'Café', tipoUnidad: 'g' });
  const raiz = document.createElement('div');
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };
  await pintarAgregar(raiz, ctx);
  buscarEn(raiz, 'cafe');
  expect(raiz.querySelector('[data-crear]')).toBeNull();
  raiz.querySelector(`[data-producto="${cafe.id}"]`).click();
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  expect(await repo.listarProductos()).toHaveLength(1);
  expect((await repo.listarItems()).map((i) => i.productoId)).toEqual([cafe.id]);
});

test('agregar un producto que ya está en la lista no lo duplica', async () => {
  const { repo, ctx, arroz } = await escenario();
  const raiz = document.createElement('div');
  await pintarAgregar(raiz, ctx);
  buscarEn(raiz, 'arroz');
  const boton = raiz.querySelector(`[data-producto="${arroz.id}"]`);
  expect(boton.textContent).toContain('ya está en la lista');
  boton.click();
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  expect(await repo.listarItems()).toHaveLength(1);
});

test('agregar: se puede cancelar sin elegir nada y vuelve a la lista sin guardar', async () => {
  const { repo, ctx } = await escenario();
  const raiz = document.createElement('main');
  await pintarAgregar(raiz, ctx);
  buscarEn(raiz, 'Pan');
  const cancelar = [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar');
  expect(cancelar).toBeTruthy();
  cancelar.click();
  expect(ctx.ir).toHaveBeenCalledWith('#/lista');
  expect(await repo.listarItems()).toHaveLength(1);
  expect(await repo.listarProductos()).toHaveLength(1);
});
