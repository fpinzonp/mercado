import { sincronizar } from './sync.js';

/**
 * Sincroniza solo: al abrir la app, al volver a ella, cuando vuelve la señal y unos segundos después de cada cambio.
 * Sin sesión no hace nada. alTerminar(resultado) avisa a la interfaz.
 */
export function iniciarAutoSync(repo, nube, { alTerminar, espera = 3000 } = {}) {
  let reloj = null;
  let ultimo = null;
  const correr = async () => {
    clearTimeout(reloj);
    if (!(await nube.conectado())) return null;
    ultimo = await sincronizar(repo, nube);
    alTerminar?.(ultimo);
    return ultimo;
  };
  const pronto = () => {
    clearTimeout(reloj);
    reloj = setTimeout(correr, espera);
  };
  repo.alCambiar(pronto);
  globalThis.addEventListener?.('online', correr);
  globalThis.document?.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') correr();
  });
  return { correr, pronto, ultimo: () => ultimo };
}
