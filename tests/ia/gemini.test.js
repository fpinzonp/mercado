import { test, expect } from 'vitest';
import { leerEtiquetaGemini, leerTagGemini, parseRespuestaGemini, ErrorIA } from '../../src/ia/gemini.js';

const ok = (texto) => async () => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
});
const blob = () => new Blob(['x'], { type: 'image/jpeg' });

test('lee JSON aunque venga entre cercas', async () => {
  const r = await leerEtiquetaGemini(blob(), {
    token: 't', fetchImpl: ok('```json\n{"nombre":"Arroz Diana","tamano":1,"unidad":"kg"}\n```'),
  });
  expect(r).toEqual({ nombre: 'Arroz Diana', tamano: 1, unidad: 'kg' });
});

test('llama a la función del servidor con la sesión, sin ninguna clave de Gemini', async () => {
  let url, init;
  await leerEtiquetaGemini(blob(), {
    token: 'TOKEN-SESION',
    fetchImpl: async (u, i) => { url = u; init = i; return ok('{"nombre":"X"}')(); },
  });
  expect(url).toBe('https://ycyurqnghgpdpqeuxtke.supabase.co/functions/v1/leer-foto');
  expect(init.headers.Authorization).toBe('Bearer TOKEN-SESION');
  const cuerpo = JSON.parse(init.body);
  expect(cuerpo).toMatchObject({ tipo: 'producto', mimeType: 'image/jpeg' });
  expect(cuerpo.data).toBeTruthy();
  expect(url + init.body).not.toMatch(/key=|AIza/);
});

test('el tag de precio pide el tipo "tag"', async () => {
  let cuerpo;
  const r = await leerTagGemini(blob(), {
    token: 't',
    fetchImpl: async (u, i) => { cuerpo = JSON.parse(i.body); return ok('{"precioNormal":12900,"precioDescuento":9990}')(); },
  });
  expect(cuerpo.tipo).toBe('tag');
  expect(r).toMatchObject({ precioNormal: 12900, precioDescuento: 9990 });
});

test.each([
  [{ token: null }, 'sin_sesion'],
  [{ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }, 'sin_red'],
  [{ fetchImpl: async () => ({ ok: false, status: 429 }) }, 'limite'],
  [{ fetchImpl: async () => ({ ok: false, status: 401 }) }, 'sin_sesion'],
  [{ fetchImpl: async () => ({ ok: false, status: 503 }) }, 'no_configurado'],
  [{ fetchImpl: async () => ({ ok: false, status: 404 }) }, 'no_configurado'],
  [{ fetchImpl: async () => ({ ok: false, status: 502 }) }, 'respuesta_invalida'],
  [{ fetchImpl: ok('no sé qué producto es') }, 'respuesta_invalida'],
  [{ fetchImpl: ok('{"tamano":1}') }, 'respuesta_invalida'],
])('errores %#', async (opts, codigo) => {
  const p = leerEtiquetaGemini(blob(), { token: 't', ...opts });
  await expect(p).rejects.toBeInstanceOf(ErrorIA);
  await expect(p).rejects.toMatchObject({ codigo });
});

test('parseRespuestaGemini sin candidatos', () => {
  expect(() => parseRespuestaGemini({})).toThrow(ErrorIA);
});
