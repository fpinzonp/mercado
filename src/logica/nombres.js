/** "  Café   Sello " → "cafe sello": así se reconoce el mismo producto escrito distinto. */
export const normalizarNombre = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');
