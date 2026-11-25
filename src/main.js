import './ui/estilos.css';
import { abrirDB } from './datos/db.js';
import { hoyLocal } from './logica/fechas.js';
import { iniciarRouter } from './ui/router.js';
import { estaInstalada, esIOS } from './ui/estado.js';
import { pintarBienvenida } from './ui/vista-bienvenida.js';
import { pintarAjustes } from './ui/vista-ajustes.js';

const vistas = {
  bienvenida: pintarBienvenida,
  ajustes: pintarAjustes,
};
// Las demás vistas se registran a medida que existen (Tasks 8–10).
const opcionales = {
  lista: () => import('./ui/vista-lista.js').then((m) => m.pintarLista),
  agregar: () => import('./ui/vista-agregar.js').then((m) => m.pintarAgregar),
  productos: () => import('./ui/vista-productos.js').then((m) => m.pintarProductos),
  precio: () => import('./ui/vista-precio.js').then((m) => m.pintarPrecio),
  comprar: () => import('./ui/vista-comprar.js').then((m) => m.pintarComprar),
};
for (const [nombre, cargar] of Object.entries(opcionales)) {
  vistas[nombre] = async (raiz, ctx, params) => (await cargar())(raiz, ctx, params);
}

async function arrancar() {
  const raiz = document.getElementById('app');
  const repo = await abrirDB();
  const ctx = { repo, hoy: () => hoyLocal() };

  // Antes de pintar cualquier vista: instalar (iPhone) y crear mercados.
  const guardian = async (nombre, vista) => async (r, c, p) => {
    if (nombre !== 'bienvenida') {
      if (esIOS() && !estaInstalada() && !sessionStorage.getItem('sinInstalar')) {
        return pintarBienvenida(r, c, ['instalar']);
      }
      if (!(await repo.listarMercados()).length) return pintarBienvenida(r, c, ['mercados']);
    }
    return vista(r, c, p);
  };
  const rutas = {};
  for (const [n, v] of Object.entries(vistas)) rutas[n] = await guardian(n, v);

  // La nube se carga aparte, para no demorar la primera pantalla.
  let nubePromesa = null;
  ctx.obtenerNube = () => (nubePromesa ??= import('./datos/remoto-supabase.js').then((m) => m.crearNube()));

  await iniciarRouter(raiz, rutas, ctx);
  navigator.storage?.persist?.().catch(() => {});

  try {
    const [{ iniciarAutoSync }, nube] = await Promise.all([import('./datos/auto-sync.js'), ctx.obtenerNube()]);
    ctx.sync = iniciarAutoSync(repo, nube, {
      alTerminar: (r) => {
        document.body.dataset.sync = r.ok ? 'ok' : r.sinRed ? 'sin-red' : 'error';
        // Si llegaron cambios de otro dispositivo, repinta las pantallas de consulta (no los formularios).
        if (r.ok && r.bajados > 0 && ['lista', 'productos', 'comprar'].includes(document.body.dataset.vista)) ctx.refrescar();
      },
    });
    ctx.sync.correr();
  } catch (e) {
    console.warn('Sin sincronización por ahora', e);
  }
}

arrancar();
