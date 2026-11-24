// Página desechable para probar Tesseract en el iPhone (se borra en la Task 11).
import { reducirImagen } from './img/reducir.js';
import { leerTextoLocal } from './ia/ocr.js';
import { detectarTamano } from './logica/tamano.js';

const $ = (id) => document.getElementById(id);

$('foto').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const t0 = performance.now();
  try {
    $('estado').textContent = 'Reduciendo foto…';
    const blob = await reducirImagen(file);
    $('vista').src = URL.createObjectURL(blob);
    $('estado').textContent = 'Leyendo texto (la primera vez descarga ~6 MB)…';
    const { texto } = await leerTextoLocal(blob);
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    $('estado').textContent = `Listo en ${s} s`;
    $('texto').textContent = texto || '(vacío)';
    $('tamano').textContent = JSON.stringify(detectarTamano(texto));
  } catch (err) {
    $('estado').textContent = 'Falló: ' + (err?.message || err);
  }
  e.target.value = '';
});
