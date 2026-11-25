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

const PROMPT_TAG = `Eres un asistente que lee el tag (etiqueta) de precio del estante de un supermercado en Colombia.
Mira la foto y responde SOLO con JSON, sin texto adicional, con esta forma:
{"precioNormal": entero o null, "precioDescuento": entero o null, "porcentaje": número o null, "detalle": texto o null,
 "hasta": "AAAA-MM-DD" o null, "tamano": número o null, "unidad": "g" | "kg" | "ml" | "L" | "unidad" | null,
 "precioPorUnidad": número o null, "unidadPrecioPorUnidad": "g" | "kg" | "ml" | "L" | "unidad" | null}
- Precios en pesos colombianos, sin puntos ni signo (ej. 12900). "precioNormal" es el precio sin promoción ("antes"); si no hay promoción, el único precio.
- "precioDescuento" solo si el tag muestra un precio rebajado ("ahora", "oferta"). "porcentaje" si muestra un % de descuento.
- "detalle": la promoción como aparece (ej. "2x1", "Lleve 3 pague 2", "-20% con tarjeta").
- "hasta": la fecha de vigencia de la promoción, si aparece.
- "tamano" es el contenido neto de UNA presentación. "precioPorUnidad" es el precio por gramo, mililitro, kilo, litro o unidad que muchos tags muestran en letra pequeña.
- Si no se ve algo, usa null.`;

/** Texto JSON de la respuesta de generateContent, ya parseado. */
function jsonDeRespuesta(cuerpo) {
  const texto = cuerpo?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const datos = JSON.parse(limpio);
    if (datos && typeof datos === 'object') return datos;
  } catch { /* abajo */ }
  throw new ErrorIA('respuesta_invalida', 'Gemini no devolvió JSON');
}

/** Saca {nombre, tamano, unidad} de la respuesta de generateContent. */
export function parseRespuestaGemini(cuerpo) {
  const datos = jsonDeRespuesta(cuerpo);
  if (!datos || typeof datos.nombre !== 'string' || !datos.nombre.trim()) {
    throw new ErrorIA('respuesta_invalida', 'Gemini no devolvió el nombre');
  }
  return { nombre: datos.nombre.trim(), tamano: datos.tamano ?? null, unidad: datos.unidad ?? null };
}

export async function leerEtiquetaGemini(blob, opciones = {}) {
  return parseRespuestaGemini(await pedirGemini(blob, PROMPT, opciones));
}

/** Datos crudos del tag de precio (se limpian con normalizarTag). */
export async function leerTagGemini(blob, opciones = {}) {
  return jsonDeRespuesta(await pedirGemini(blob, PROMPT_TAG, opciones));
}

async function pedirGemini(blob, prompt, { clave, modelo = 'gemini-flash-latest', fetchImpl = globalThis.fetch, espera = 8000 } = {}) {
  if (!clave) throw new ErrorIA('sin_clave');
  if (globalThis.navigator?.onLine === false) throw new ErrorIA('sin_red');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(clave)}`;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
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
  return cuerpo;
}
