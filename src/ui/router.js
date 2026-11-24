/**
 * Rutas por hash: '#/lista', '#/precio/:productoId', ...
 * rutas: { lista: (raiz, ctx, params) => Promise<void>, precio: ... }
 */
export function iniciarRouter(raiz, rutas, ctx, porDefecto = 'lista') {
  let anterior = null;
  async function pintar() {
    const [nombre, ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const vista = rutas[nombre] ? nombre : porDefecto;
    ctx.rutaAnterior = anterior;
    anterior = location.hash || `#/${porDefecto}`;
    document.body.dataset.vista = vista;
    for (const a of document.querySelectorAll('[data-nav]')) {
      a.toggleAttribute('aria-current', a.dataset.nav === vista);
    }
    try {
      await rutas[vista](raiz, ctx, params.map(decodeURIComponent));
    } catch (e) {
      console.error(e);
      raiz.textContent = 'Algo falló al abrir esta pantalla. Vuelve a la lista e inténtalo otra vez.';
    }
    window.scrollTo?.(0, 0);
  }
  window.addEventListener('hashchange', pintar);
  ctx.ir = (ruta) => {
    if (location.hash === ruta) pintar();
    else location.hash = ruta;
  };
  ctx.refrescar = pintar;
  return pintar();
}
