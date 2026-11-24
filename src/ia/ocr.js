// Lectura de texto en el propio teléfono con Tesseract.js (respaldo cuando Gemini no responde).
let workerPromesa = null;

async function obtenerWorker() {
  if (!workerPromesa) {
    workerPromesa = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL(import.meta.env.BASE_URL + 'tesseract/', location.href).href;
      return createWorker('spa', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base,
        gzip: true,
      });
    })().catch((e) => {
      workerPromesa = null;
      throw e;
    });
  }
  return workerPromesa;
}

/** @returns {Promise<{texto: string, palabras: string[]}>} */
export async function leerTextoLocal(blob) {
  const worker = await obtenerWorker();
  const { data } = await worker.recognize(blob);
  const texto = data.text ?? '';
  const vistas = new Set();
  const palabras = [];
  for (const p of texto.split(/\s+/)) {
    const limpia = p.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
    if (limpia.length < 2) continue;
    const clave = limpia.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    palabras.push(limpia);
  }
  return { texto, palabras };
}
