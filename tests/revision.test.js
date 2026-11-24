// Pruebas de los hallazgos de la revisión final.
import 'fake-indexeddb/auto';
import { test, expect, vi, afterEach } from 'vitest';
import { abrirDB } from '../src/datos/db.js';
import { exportarRespaldo, importarRespaldo } from '../src/datos/respaldo.js';
import { leerEtiquetaGemini } from '../src/ia/gemini.js';
import { guardarRespaldo } from '../src/ui/vista-ajustes.js';
import { pintarAgregar } from '../src/ui/vista-agregar.js';
import { pintarLista } from '../src/ui/vista-lista.js';
import { pintarPrecio } from '../src/ui/vista-precio.js';

const hoy = '2026-11-24';
let n = 0;
const nuevaDB = () => abrirDB(`revision-${n++}`);

afterEach(() => vi.unstubAllGlobals());

async function conDatos() {
  const repo = await nuevaDB();
  const d1 = await repo.guardarMercado({ nombre: 'D1' });
  const arroz = await repo.guardarProducto({ nombre: 'Arroz', tipoUnidad: 'g' });
  return { repo, d1, arroz };
}

// I-1
test.each([
  [{ version: 1, mercados: [{ nombre: 'sin id' }] }],
  [{ version: 1, fotos: [{ id: 'a', base64: '%%%' }] }],
  [{ version: 1, ofertas: [{ id: 'o', precioNormal: 1 }] }],
])('importar un respaldo dañado no borra nada (%#)', async (malo) => {
  const { repo } = await conDatos();
  await expect(importarRespaldo(repo, malo)).rejects.toThrow('Este archivo no es un respaldo de Mercado');
  expect(await repo.listarMercados()).toHaveLength(1);
  expect(await repo.listarProductos()).toHaveLength(1);
});

// I-2
test('Gemini se corta a los segundos y cuenta como sin señal', async () => {
  vi.useFakeTimers();
  // fetch que nunca responde salvo que lo aborten
  const fetchImpl = (url, init) => new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('t', 'AbortError'))));
  const p = leerEtiquetaGemini(new Blob(['x']), { clave: 'k', modelo: 'm', fetchImpl, espera: 8000 });
  let resultado = 'pendiente';
  p.then(() => { resultado = 'ok'; }, (e) => { resultado = e.codigo; });
  await vi.advanceTimersByTimeAsync(8001);
  vi.useRealTimers();
  expect(resultado).toBe('sin_red');
});

test('sin conexión no llama a Gemini', async () => {
  vi.stubGlobal('navigator', { ...navigator, onLine: false });
  const fetchImpl = vi.fn();
  await expect(leerEtiquetaGemini(new Blob(['x']), { clave: 'k', modelo: 'm', fetchImpl })).rejects.toMatchObject({ codigo: 'sin_red' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

// I-3
test('si compartir falla, el respaldo se descarga y se marca', async () => {
  const { repo } = await conDatos();
  vi.stubGlobal('navigator', {
    ...navigator,
    canShare: () => true,
    share: async () => { throw new DOMException('no', 'NotAllowedError'); },
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  expect(await guardarRespaldo(repo)).toBe(true);
  expect(clic).toHaveBeenCalled();
  expect(await repo.leerAjuste('ultimoRespaldo')).toMatch(/^\d{4}/);
  clic.mockRestore();
});

// I-4
test('cambiar la foto de una oferta borra la anterior; borrar mercado borra sus fotos; el respaldo solo lleva fotos usadas', async () => {
  const { repo, d1, arroz } = await conDatos();
  const f1 = await repo.guardarFoto(new Blob(['1']));
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 4500, fotoId: f1 }, hoy);
  const f2 = await repo.guardarFoto(new Blob(['2']));
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 4600, fotoId: f2 }, hoy);
  expect(await repo.leerFoto(f1)).toBeUndefined();
  expect(await repo.leerFoto(f2)).toBeDefined();
  await repo.guardarFoto(new Blob(['huerfana']));
  expect((await exportarRespaldo(repo)).fotos.map((f) => f.id)).toEqual([f2]);
  await repo.borrarMercado(d1.id);
  expect(await repo.leerFoto(f2)).toBeUndefined();
});

// I-5
test('agregar un producto que estaba tachado lo destacha y reemplaza la cantidad', async () => {
  const { repo, arroz } = await conDatos();
  const item = await repo.guardarItem({ productoId: arroz.id, cantidad: 2000 });
  await repo.tacharItem(item.id, 'd1');
  const raiz = document.createElement('div');
  const ctx = { repo, hoy: () => hoy, ir: vi.fn() };
  await pintarAgregar(raiz, ctx);
  const b = raiz.querySelector('#buscar');
  b.value = 'arroz';
  b.dispatchEvent(new Event('input'));
  raiz.querySelector(`[data-producto="${arroz.id}"]`).click();
  raiz.querySelector('#cantidad').value = '1 kg';
  raiz.querySelector('form.cantidad').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalled());
  const [i] = await repo.listarItems();
  expect(i).toMatchObject({ tachado: false, cantidad: 1000 });
  expect(i.compradoEn).toBeUndefined();
});

// I-6
test('la oferta con descuento muestra cuánto se ahorra', async () => {
  const { repo, d1, arroz } = await conDatos();
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, tamano: 1000, precioNormal: 5000, precioDescuento: 4000, descuentoHasta: '2026-11-30' }, hoy);
  await repo.guardarItem({ productoId: arroz.id, cantidad: 2000 });
  const raiz = document.createElement('div');
  await pintarLista(raiz, { repo, hoy: () => hoy, ir: vi.fn() });
  expect(raiz.textContent).toContain('ahorras $2.000');
});

// Precio: M-4 doble toque, M-3 OCR no borra nombre, M-1 fecha pasada, I-2 no pisar lo escrito
async function vistaPrecio(leer) {
  const { repo, d1, arroz } = await conDatos();
  await repo.guardarOferta({ productoId: arroz.id, mercadoId: d1.id, nombreReal: 'Arroz Diana', tamano: 1000, precioNormal: 4500 }, hoy);
  const ctx = { repo, hoy: () => hoy, ir: vi.fn(), leerProducto: vi.fn(leer), reducirImagen: async (f) => f };
  const raiz = document.createElement('div');
  await pintarPrecio(raiz, ctx, [arroz.id]);
  return { repo, ctx, raiz, arroz };
}
const tomarFoto = (raiz) => {
  const input = raiz.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'f.jpg')] });
  input.dispatchEvent(new Event('change'));
};

test('doble toque en Guardar precio guarda una sola vez y sin errores', async () => {
  const { repo, ctx, raiz, arroz } = await vistaPrecio(async () => ({ fuente: 'manual' }));
  const form = raiz.querySelector('form');
  const errores = vi.fn();
  window.addEventListener('unhandledrejection', errores);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(ctx.ir).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 30));
  expect((await repo.ofertasPorProducto()).get(arroz.id)).toHaveLength(1);
  expect(errores).not.toHaveBeenCalled();
});

test('la lectura OCR no borra el nombre ya guardado', async () => {
  const { raiz } = await vistaPrecio(async () => ({ fuente: 'ocr', palabras: ['ARROZ'] }));
  tomarFoto(raiz);
  await vi.waitFor(() => expect(raiz.querySelectorAll('.palabras button')).toHaveLength(1));
  expect(raiz.querySelector('#nombre').value).toBe('Arroz Diana');
});

test('una lectura tardía no pisa lo que el usuario ya escribió', async () => {
  let soltar;
  const { raiz } = await vistaPrecio(() => new Promise((r) => { soltar = r; }));
  tomarFoto(raiz);
  await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
  const nombre = raiz.querySelector('#nombre');
  nombre.value = 'Arroz Roa';
  nombre.dispatchEvent(new Event('input'));
  soltar({ fuente: 'gemini', nombre: 'Arroz Diana Premium', tamano: 500, unidad: 'g' });
  await vi.waitFor(() => expect(raiz.querySelector('#tamano').value).toBe('500'));
  expect(nombre.value).toBe('Arroz Roa');
});

test('rechaza un descuento con fecha ya vencida', async () => {
  const { ctx, raiz } = await vistaPrecio(async () => ({ fuente: 'manual' }));
  const sw = raiz.querySelector('#tiene-descuento');
  sw.checked = true;
  sw.dispatchEvent(new Event('change'));
  raiz.querySelector('#precio-descuento').value = '4000';
  raiz.querySelector('#hasta').value = '2026-11-01';
  raiz.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  expect(ctx.ir).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('La fecha ya pasó');
});

// M-7
test('la base funciona sin crypto.randomUUID (http en la red local)', async () => {
  const original = globalThis.crypto;
  vi.stubGlobal('crypto', { getRandomValues: (a) => original.getRandomValues(a) });
  const repo = await nuevaDB();
  const m = await repo.guardarMercado({ nombre: 'D1' });
  expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
});
