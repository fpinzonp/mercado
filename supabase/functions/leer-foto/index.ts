// Supabase Edge Function "leer-foto": lee la foto del producto o del tag de precio con Gemini.
// La clave de Gemini vive aquí como secreto (GEMINI_API_KEY); nunca llega al teléfono.
// Solo responde a usuarios con sesión (Supabase verifica el JWT antes de llegar aquí).

const PROMPTS: Record<string, string> = {
  producto: `Eres un asistente que lee etiquetas de productos de supermercado en Colombia.
Mira la foto y responde SOLO con JSON, sin texto adicional, con esta forma:
{"nombre": "marca y producto, sin el tamaño (ej. \\"Arroz Diana\\")", "tamano": número o null, "unidad": "g" | "kg" | "ml" | "L" | "unidad" | null}
- "tamano" es el contenido neto de UNA presentación (ej. 500 para 500 g, 1 para 1 kg, 30 para 30 huevos).
- Si no se ve algo, usa null. Escribe el nombre en español, como aparece en el empaque.`,
  tag: `Eres un asistente que lee el tag (etiqueta) de precio del estante de un supermercado en Colombia.
Mira la foto y responde SOLO con JSON, sin texto adicional, con esta forma:
{"nombre": "marca y producto como aparece en el tag, sin el tamaño (ej. \\"Arroz Diana\\")" o null,
 "precioNormal": entero o null, "precioDescuento": entero o null, "porcentaje": número o null, "detalle": texto o null,
 "hasta": "AAAA-MM-DD" o null, "tamano": número o null, "unidad": "g" | "kg" | "ml" | "L" | "unidad" | null,
 "precioPorUnidad": número o null, "unidadPrecioPorUnidad": "g" | "kg" | "ml" | "L" | "unidad" | null}
- Precios en pesos colombianos, sin puntos ni signo (ej. 12900). "precioNormal" es el precio sin promoción ("antes"); si no hay promoción, el único precio.
- "precioDescuento" solo si el tag muestra un precio rebajado ("ahora", "oferta"). "porcentaje" si muestra un % de descuento.
- "detalle": la promoción como aparece (ej. "2x1", "Lleve 3 pague 2", "-20% con tarjeta").
- "hasta": la fecha de vigencia de la promoción, si aparece.
- "tamano" es el contenido neto de UNA presentación. "precioPorUnidad" es el precio por gramo, mililitro, kilo, litro o unidad que muchos tags muestran en letra pequeña.
- Si no se ve algo, usa null.`,
};

const ORIGENES = ['https://fpinzonp.github.io', 'http://localhost:5173', 'http://localhost:4173'];
const MAX_BASE64 = 4_000_000; // ~3 MB de imagen; la app manda fotos de 800 px (~100 KB)

function cors(req: Request) {
  const origen = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const h = cors(req);
  const json = (cuerpo: unknown, status: number) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...h, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405);

  // Solo usuarios con sesión: se valida el token con Supabase Auth (además del chequeo de JWT de la plataforma).
  const autorizacion = req.headers.get('authorization') ?? '';
  const base = Deno.env.get('SUPABASE_URL') ?? 'https://ycyurqnghgpdpqeuxtke.supabase.co';
  const apikey = Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_-313rz240qB2ie2Kgv3UlQ_tPW_NkIu';
  const usuario = autorizacion.startsWith('Bearer ')
    ? await fetch(`${base}/auth/v1/user`, { headers: { Authorization: autorizacion, apikey } })
    : null;
  if (!usuario?.ok) return json({ error: 'sin_sesion' }, 401);

  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) return json({ error: 'no_configurado' }, 503);

  let pedido: { tipo?: string; mimeType?: string; data?: string };
  try {
    pedido = await req.json();
  } catch {
    return json({ error: 'pedido_invalido' }, 400);
  }
  const prompt = PROMPTS[pedido.tipo ?? ''];
  if (!prompt || typeof pedido.data !== 'string' || !pedido.data || pedido.data.length > MAX_BASE64) {
    return json({ error: 'pedido_invalido' }, 400);
  }
  const mimeType = /^image\/(jpeg|png|webp|heic|heif)$/.test(pedido.mimeType ?? '') ? pedido.mimeType : 'image/jpeg';
  const cuerpo = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: pedido.data } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  // Gemini gratis a veces responde 503 (sobrecargado) o 500: se reintenta y, si sigue, se prueba otro modelo.
  // GEMINI_MODELS (opcional) = lista separada por comas, en orden de preferencia.
  const modelos = (Deno.env.get('GEMINI_MODELS') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest,gemini-flash-lite-latest')
    .split(',').map((m) => m.trim()).filter(Boolean);
  const intentos = modelos.flatMap((m, i) => (i === 0 ? [m, m] : [m]));
  let ultimo = 0;
  for (const [i, modelo] of intentos.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 700));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: cuerpo,
    });
    if (r.ok) return new Response(await r.text(), { status: 200, headers: { ...h, 'Content-Type': 'application/json' } });
    ultimo = r.status;
    await r.body?.cancel();
    if (r.status === 429) return json({ error: 'limite' }, 429);
    if (r.status !== 503 && r.status !== 500 && r.status !== 404) break; // clave mala u otro error: no sirve reintentar
  }
  return json({ error: 'gemini', status: ultimo }, 502);
});
