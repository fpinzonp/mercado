import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';
import { abrirDB } from '../../src/datos/db.js';
import { pintarPrecio } from '../../src/ui/vista-precio.js';

const hoy = '2026-11-24';
let n = 0;

async function escenario(leer = async () => ({ fuente: 'gemini', nombre: 'Arroz Diana', tamano: 1, unidad: 'kg' })) {
  const repo = await abrirDB(`ui-precio-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1', orden: 0 });
  await repo.guardarMercado({ nombre: 'Ara', orden: 1 });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  const ctx = {
    repo, hoy: () => hoy, ir: vi.fn(),
    leerProducto: vi.fn(leer),
    reducirImagen: vi.fn(async (f) => f),
  };
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctx, [arroz.id]);
  return { repo, ctx, raiz, d1, arroz };
}

async function tomarFoto(raiz) {
  const input = raiz.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] });
  input.dispatchEvent(new Event('change'));
}

const escribir = (raiz, sel, valor) => {
  const i = raiz.querySelector(sel);
  i.value = valor;
  i.dispatchEvent(new Event('input'));
};
const enviar = (raiz) => raiz.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));

test('foto leída por Gemini + precio con descuento en %', async () => {
  const { repo, ctx, raiz, d1, arroz } = await escenario();
  await tomarFoto(raiz);
  await vi.waitFor(() => expect(raiz.querySelector('#nombre').value).toBe('Arroz Diana'));
  expect(raiz.querySelector('#tamano').value).toBe('1000');
  escribir(raiz, '#precio', '4.500');
  const sw = raiz.querySelector('#tiene-descuento');
  sw.checked = true;
  sw.dispatchEvent(new Event('change'));
  escribir(raiz, '#porcentaje', '20');
  enviar(raiz);
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledWith('#/lista'));
  const [o] = (await repo.ofertasPorProducto()).get(arroz.id);
  expect(o).toMatchObject({ mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500, precioDescuento: 3600 });
  expect(o.fotoId).toBeTruthy();
});

test('precio vacío no guarda y muestra error', async () => {
  const { repo, ctx, raiz, arroz } = await escenario();
  escribir(raiz, '#nombre', 'Arroz Diana');
  escribir(raiz, '#tamano', '1 kg');
  enviar(raiz);
  await new Promise((r) => setTimeout(r, 30));
  expect(ctx.ir).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Escribe el precio');
  expect((await repo.ofertasPorProducto()).get(arroz.id)).toBeUndefined();
});

test('descuento mayor o igual al normal da error', async () => {
  const { ctx, raiz } = await escenario();
  escribir(raiz, '#nombre', 'Arroz Diana');
  escribir(raiz, '#tamano', '1000');
  escribir(raiz, '#precio', '4500');
  const sw = raiz.querySelector('#tiene-descuento');
  sw.checked = true;
  sw.dispatchEvent(new Event('change'));
  escribir(raiz, '#precio-descuento', '4500');
  enviar(raiz);
  await new Promise((r) => setTimeout(r, 30));
  expect(ctx.ir).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('El precio con descuento debe ser menor que el normal');
});

test('lectura OCR muestra palabras que se suman al nombre y el aviso', async () => {
  const { raiz } = await escenario(async () => ({
    fuente: 'ocr', palabras: ['ARROZ', 'DIANA', 'Premium'], tamano: 500, unidad: 'g', aviso: 'Se acabó el cupo gratis',
  }));
  await tomarFoto(raiz);
  await vi.waitFor(() => expect(raiz.querySelectorAll('.palabras button')).toHaveLength(3));
  raiz.querySelectorAll('.palabras button')[0].click();
  raiz.querySelectorAll('.palabras button')[1].click();
  expect(raiz.querySelector('#nombre').value).toBe('ARROZ DIANA');
  expect(raiz.querySelector('#tamano').value).toBe('500');
  expect(raiz.textContent).toContain('Se acabó el cupo gratis');
});

test('unidad incompatible deja el tamaño vacío', async () => {
  const { raiz } = await escenario(async () => ({ fuente: 'gemini', nombre: 'Leche', tamano: 1, unidad: 'L' }));
  await tomarFoto(raiz);
  await vi.waitFor(() => expect(raiz.querySelector('#nombre').value).toBe('Leche'));
  expect(raiz.querySelector('#tamano').value).toBe('');
});

test('oferta existente llega prellenada', async () => {
  const repo = await abrirDB(`ui-precio-${n++}`);
  const d1 = await repo.guardarMercado({ nombre: 'D1' });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, { repo, hoy: () => hoy, ir: vi.fn() }, [arroz.id]);
  expect(raiz.querySelector('#nombre').value).toBe('Arroz Diana');
  expect(raiz.querySelector('#precio').value).toBe('4.500');
});
