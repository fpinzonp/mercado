// Datos y respaldos de antes del cambio (ítems con cantidad, productos con tipo al crearlos).
import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../src/datos/db.js';
import { exportarRespaldo, importarRespaldo } from '../src/datos/respaldo.js';
import { pintarLista } from '../src/ui/vista-lista.js';
import { pintarComprar } from '../src/ui/vista-comprar.js';
import { pintarProductos } from '../src/ui/vista-productos.js';

const hoy = '2026-11-24';
let n = 0;

const respaldoViejo = {
  version: 1,
  exportado: '2026-11-24',
  mercados: [{ id: 'm1', nombre: 'D1', orden: 0 }, { id: 'm2', nombre: 'Éxito', orden: 1 }],
  productos: [{ id: 'p1', nombre: 'Arroz', tipoUnidad: 'g' }, { id: 'p2', nombre: 'Leche', tipoUnidad: 'ml' }],
  ofertas: [
    { id: 'o1', productoId: 'p1', mercadoId: 'm1', nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500, actualizado: hoy },
    { id: 'o2', productoId: 'p1', mercadoId: 'm2', nombreReal: 'Arroz Roa', tamano: 500, precioNormal: 2400, actualizado: hoy },
  ],
  lista: [
    { id: 'i1', productoId: 'p1', cantidad: 2000, tachado: false, creado: 1 },
    { id: 'i2', productoId: 'p2', cantidad: 6000, tachado: true, compradoEn: 'm1', creado: 2 },
  ],
  fotos: [],
};

test('un respaldo de antes del cambio se importa y se ve sin cantidades', async () => {
  const repo = await abrirDB(`compat-${n++}`);
  await importarRespaldo(repo, structuredClone(respaldoViejo));
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };

  const lista = document.createElement('div');
  await pintarLista(lista, ctx);
  expect([...lista.querySelectorAll('.item-nombre')].map((s) => s.textContent)).toEqual(['Arroz', 'Leche']);
  expect(lista.textContent).not.toMatch(/2 kg|6 L/);
  expect(lista.querySelector('.tag.gana').textContent).toContain('D1');

  await repo.guardarAjuste('mercadoActivo', 'm1');
  const comprar = document.createElement('div');
  await pintarComprar(comprar, ctx);
  expect(comprar.querySelector('.aqui').textContent).toContain('Arroz');

  const productos = document.createElement('div');
  await pintarProductos(productos, ctx);
  expect(productos.querySelectorAll('.producto')).toHaveLength(2);
});

test('los datos viejos se conservan tal cual (no se pierde la cantidad guardada)', async () => {
  const repo = await abrirDB(`compat-${n++}`);
  await importarRespaldo(repo, structuredClone(respaldoViejo));
  const datos = await exportarRespaldo(repo);
  expect(datos.lista.find((i) => i.id === 'i1').cantidad).toBe(2000);
  expect(datos.productos.find((p) => p.id === 'p2').tipoUnidad).toBe('ml');
});

test('un producto sin tipo de medida sale y vuelve en el respaldo', async () => {
  const repo = await abrirDB(`compat-${n++}`);
  await repo.guardarMercado({ nombre: 'D1' });
  const cafe = await repo.guardarProducto({ nombre: 'Café' });
  await repo.guardarItem({ productoId: cafe.id });
  const datos = JSON.parse(JSON.stringify(await exportarRespaldo(repo)));
  await repo.borrarTodo();
  await importarRespaldo(repo, datos);
  const [p] = await repo.listarProductos();
  expect(p.nombre).toBe('Café');
  expect(p.tipoUnidad).toBeUndefined();
  expect(await repo.listarItems()).toHaveLength(1);
});
