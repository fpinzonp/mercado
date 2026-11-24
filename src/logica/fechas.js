const dos = (n) => String(n).padStart(2, '0');

/** Fecha local del teléfono como 'YYYY-MM-DD'. */
export function hoyLocal(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

const aUTC = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Días de a hasta b (b − a). */
export function diasEntre(a, b) {
  return Math.round((aUTC(b) - aUTC(a)) / 86400000);
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export function formatoDiaMes(fecha) {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}
