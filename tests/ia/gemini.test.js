import { test, expect } from 'vitest';
import { leerEtiquetaGemini, parseRespuestaGemini, ErrorIA } from '../../src/ia/gemini.js';

const ok = (texto) => async () => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
});
const blob = () => new Blob(['x'], { type: 'image/jpeg' });

test('lee JSON aunque venga entre cercas', async () => {
  const r = await leerEtiquetaGemini(blob(), {
    clave: 'k', modelo: 'm',
    fetchImpl: ok('```json\n{"nombre":"Arroz Diana","tamano":1,"unidad":"kg"}\n```'),
  });
  expect(r).toEqual({ nombre: 'Arroz Diana', tamano: 1, unidad: 'kg' });
});

test('envía la imagen y la clave a Gemini', async () => {
  let url, cuerpo;
  await leerEtiquetaGemini(blob(), {
    clave: 'CLAVE', modelo: 'gemini-flash-latest',
    fetchImpl: async (u, init) => { url = u; cuerpo = JSON.parse(init.body); return ok('{"nombre":"X"}')(); },
  });
  expect(url).toContain('models/gemini-flash-latest:generateContent');
  expect(url).toContain('key=CLAVE');
  const partes = cuerpo.contents[0].parts;
  expect(partes.some((p) => p.inlineData?.mimeType === 'image/jpeg' && p.inlineData.data)).toBe(true);
  expect(cuerpo.generationConfig.responseMimeType).toBe('application/json');
});

test.each([
  [{ clave: '' }, 'sin_clave'],
  [{ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }, 'sin_red'],
  [{ fetchImpl: async () => ({ ok: false, status: 429 }) }, 'limite'],
  [{ fetchImpl: async () => ({ ok: false, status: 400 }) }, 'clave_invalida'],
  [{ fetchImpl: async () => ({ ok: false, status: 403 }) }, 'clave_invalida'],
  [{ fetchImpl: async () => ({ ok: false, status: 500 }) }, 'respuesta_invalida'],
  [{ fetchImpl: ok('no sé qué producto es') }, 'respuesta_invalida'],
  [{ fetchImpl: ok('{"tamano":1}') }, 'respuesta_invalida'],
])('errores %#', async (opts, codigo) => {
  const p = leerEtiquetaGemini(blob(), { clave: 'k', modelo: 'm', ...opts });
  await expect(p).rejects.toBeInstanceOf(ErrorIA);
  await expect(p).rejects.toMatchObject({ codigo });
});

test('parseRespuestaGemini sin candidatos', () => {
  expect(() => parseRespuestaGemini({})).toThrow(ErrorIA);
});
