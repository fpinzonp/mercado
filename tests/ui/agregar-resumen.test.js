import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarAgregar } from '../../src/ui/vista-agregar.js';

const hoy = '2026-11-24';
let n = 0;

async function escenario() {
  const repo = await abrirDB(`ui-agregar-resumen-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1', orden: 0 });
  const ara = await repo.guardarMercado({ nombre: 'Ara', orden: 1 });
  const exito = await repo.guardarMercado({ nombre: 'Éxito', orden: 2 });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 4500 }, hoy);
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: ara.id, tamano: 1000, precioNormal: 5000, precioDescuento: 4000, descuentoHasta: '2026-11-30' }, hoy);
  const sal = await repo.guardarProducto({ nombre: 'Sal' });
  return { repo, d1, ara, exito, arroz, sal };
}

async function buscar(repo, texto) {
  const raiz = document.createElement('div');
  await pintarAgregar(raiz, { repo, hoy: () => hoy, ir: vi.fn() });
  const b = raiz.querySelector('#buscar');
  b.value = texto;
  b.dispatchEvent(new Event('input'));
  return raiz.querySelector('[data-producto]');
}

test('al buscar un producto muestra dónde conviene y la última compra con descuento', async () => {
  const { repo, ara, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, ara.id, hoy);
  await repo.nuevaLista('vaciar');
  const boton = await buscar(repo, 'arr');
  expect(boton.querySelector('.res-mejor').textContent).toBe('Más barato: Ara · $4,00/g (por descuento)');
  expect(boton.querySelector('.res-ultima').textContent).toBe('Última compra: Ara, 24/11 · con descuento $4.000');
});

test('la última compra a precio completo lo dice', async () => {
  const { repo, d1, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, d1.id, hoy);
  const boton = await buscar(repo, 'arroz');
  expect(boton.querySelector('.res-ultima').textContent).toBe('Última compra: D1, 24/11 · precio normal $4.500');
});

test('comprado donde no había precio guardado', async () => {
  const { repo, exito, arroz } = await escenario();
  const item = await repo.guardarItem({ productoId: arroz.id });
  await repo.tacharItem(item.id, exito.id, hoy);
  const boton = await buscar(repo, 'arroz');
  expect(boton.querySelector('.res-ultima').textContent).toBe('Última compra: Éxito, 24/11 · sin precio registrado');
});

test('producto sin precios y nunca comprado lo dice en una línea corta', async () => {
  const { repo } = await escenario();
  const boton = await buscar(repo, 'sal');
  expect(boton.querySelector('.res-mejor').textContent).toBe('Sin precios guardados');
  expect(boton.querySelector('.res-ultima').textContent).toBe('Nunca lo has comprado');
});

test('al elegirlo, la confirmación repite dónde conviene', async () => {
  const { repo, arroz } = await escenario();
  const boton = await buscar(repo, 'arroz');
  const raiz = boton.closest('div');
  boton.click();
  await vi.waitFor(() => expect(raiz.querySelector('.agregado').textContent).toContain('Más barato: Ara · $4,00/g (por descuento)'));
  void arroz;
});
