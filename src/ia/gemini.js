export class ErrorIA extends Error {
  /** @param {'sin_clave'|'sin_red'|'limite'|'clave_invalida'|'respuesta_invalida'} codigo */
  constructor(codigo, mensaje) {
    super(mensaje || codigo);
    this.name = 'ErrorIA';
    this.codigo = codigo;
  }
}

const PROMPT = `Eres un asistente que lee etiquetas de productos de supermercado en Colombia.
Mira la foto y responde SOLO con JSON, sin texto adicional, con esta forma:
{"nombre": "marca y producto, sin el tamaño (ej. \\"Arroz Diana\\")", "tamano": número o null, "unidad": "g" | "kg" | "ml" | "L" | "unidad" | null}
- "tamano" es el contenido neto de UNA presentación (ej. 500 para 500 g, 1 para 1 kg, 30 para 30 huevos).
- Si no se ve algo, usa null. Escribe el nombre en español, como aparece en el empaque.`;

async function aBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Saca {nombre, tamano, unidad} de la respuesta de generateContent. */
export function parseRespuestaGemini(cuerpo) {
  const texto = cuerpo?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let datos;
  try {
    datos = JSON.parse(limpio);
  } catch {
    throw new ErrorIA('respuesta_invalida', 'Gemini no devolvió JSON');
  }
  if (!datos || typeof datos.nombre !== 'string' || !datos.nombre.trim()) {
    throw new ErrorIA('respuesta_invalida', 'Gemini no devolvió el nombre');
  }
  return { nombre: datos.nombre.trim(), tamano: datos.tamano ?? null, unidad: datos.unidad ?? null };
}

export async function leerEtiquetaGemini(blob, { clave, modelo = 'gemini-flash-latest', fetchImpl = globalThis.fetch, espera = 8000 } = {}) {
  if (!clave) throw new ErrorIA('sin_clave');
  if (globalThis.navigator?.onLine === false) throw new ErrorIA('sin_red');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(clave)}`;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: PROMPT },
        { inlineData: { mimeType: blob.type || 'image/jpeg', data: await aBase64(blob) } },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  // Con mala señal en el mercado, no esperar más de unos segundos: mejor pasar a la lectura del teléfono.
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), espera);
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: corte.signal });
  } catch {
    throw new ErrorIA('sin_red');
  } finally {
    clearTimeout(reloj);
  }
  if (res.status === 429) throw new ErrorIA('limite');
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new ErrorIA('clave_invalida');
  if (!res.ok) throw new ErrorIA('respuesta_invalida', `HTTP ${res.status}`);

  let cuerpo;
  try {
    cuerpo = await res.json();
  } catch {
    throw new ErrorIA('respuesta_invalida');
  }
  return parseRespuestaGemini(cuerpo);
}
