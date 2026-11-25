/**
 * Antes de pintar una vista: en iPhone pedir instalar; sin mercados, crearlos.
 * Ajustes queda libre de mercados para poder entrar con la cuenta y bajar los datos de otro dispositivo.
 * @returns {Promise<null | ['instalar'] | ['mercados']>} null si se puede pintar la vista.
 */
export async function redireccion({ vista, repo, esIOS, instalada, sinInstalar }) {
  if (vista === 'bienvenida') return null;
  if (esIOS && !instalada && !sinInstalar) return ['instalar'];
  if (vista === 'ajustes') return null;
  if (!(await repo.listarMercados()).length) return ['mercados'];
  return null;
}
