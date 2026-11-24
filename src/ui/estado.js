/** Junta lo que pintan las vistas. */
export async function cargarEstado(repo) {
  const [mercados, productosLista, items, ofertasPorProducto] = await Promise.all([
    repo.listarMercados(),
    repo.listarProductos(),
    repo.listarItems(),
    repo.ofertasPorProducto(),
  ]);
  const ajustes = {};
  for (const c of ['geminiClave', 'geminiModelo', 'ultimoRespaldo', 'ultimoCambio', 'primerCambio', 'mercadoActivo', 'ultimoMercadoPrecio']) {
    ajustes[c] = await repo.leerAjuste(c);
  }
  return {
    mercados,
    mercadosPorId: new Map(mercados.map((m) => [m.id, m])),
    productos: new Map(productosLista.map((p) => [p.id, p])),
    productosLista,
    items,
    ofertasPorProducto,
    ajustes,
  };
}

export function estaInstalada() {
  return navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
