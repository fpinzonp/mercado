/**
 * Antes de pintar una vista, en este orden: instalar (iPhone), entrar con la cuenta, crear mercados.
 * Nada de la app se ve sin sesión.
 * @returns {Promise<null | ['instalar'] | ['cuenta'] | ['mercados']>} null si se puede pintar la vista.
 */
export async function redireccion({ vista, paso, repo, esIOS, instalada, sinInstalar, conectado }) {
  if (vista === 'bienvenida' && (paso === 'instalar' || paso === 'cuenta')) return null;
  if (esIOS && !instalada && !sinInstalar) return ['instalar'];
  if (!conectado) return ['cuenta'];
  if (vista === 'bienvenida') return null;
  if (!(await repo.listarMercados()).length) return ['mercados'];
  return null;
}
