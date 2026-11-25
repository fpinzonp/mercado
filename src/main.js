import './ui/estilos.css';
import { abrirDB } from './datos/db.js';
import { hoyLocal } from './logica/fechas.js';
import { iniciarRouter } from './ui/router.js';
import { estaInstalada, esIOS } from './ui/estado.js';
import { redireccion } from './ui/guardian.js';
import { pintarBienvenida } from './ui/vista-bienvenida.js';
import { pintarAjustes } from './ui/vista-ajustes.js';

const vistas = {
  bienvenida: pintarBienvenida,
  ajustes: pintarAjustes,
};
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

  // La clave de Gemini ya no vive en el teléfono (está en el servidor): se borra la que hubiera quedado.
  await repo.guardarAjuste('geminiClave', null);
  await repo.guardarAjuste('geminiModelo', null);

  // Cuenta y sincronización: se cargan antes de mostrar nada, porque sin sesión no se ve la app.
  let nubePromesa = null;
  ctx.obtenerNube = () => (nubePromesa ??= import('./datos/remoto-supabase.js').then((m) => m.crearNube()));
  let nube = null;
  try {
    const [{ iniciarAutoSync }, n] = await Promise.all([import('./datos/auto-sync.js'), ctx.obtenerNube()]);
    nube = n;
    ctx.sync = iniciarAutoSync(repo, nube, {
      alTerminar: (r) => {
        document.body.dataset.sync = r.ok ? 'ok' : r.sinRed ? 'sin-red' : 'error';
        // Si llegaron cambios de otro dispositivo, repinta las pantallas de consulta (no los formularios).
        if (r.ok && r.bajados > 0 && ['lista', 'productos', 'comprar'].includes(document.body.dataset.vista)) ctx.refrescar();
      },
    });
  } catch (e) {
    console.warn('No se pudo cargar la cuenta', e);
  }

  // Con sesión pero sin datos en este dispositivo: bajar primero lo de la nube (máximo 8 s, por si no hay señal),
  // para no pedir crear mercados que ya existen.
  if (nube && ctx.sync && (await nube.conectado().catch(() => false)) && !(await repo.listarMercados()).length) {
    await Promise.race([ctx.sync.correr(), new Promise((r) => setTimeout(r, 8000))]);
  }

  // Antes de pintar cualquier vista: instalar (iPhone), entrar con la cuenta y crear mercados.
  const guardian = (nombre, vista) => async (r, c, p) => {
    const ir = await redireccion({
      vista: nombre,
      paso: p?.[0],
      repo,
      esIOS: esIOS(),
      instalada: estaInstalada(),
      sinInstalar: Boolean(sessionStorage.getItem('sinInstalar')),
      conectado: nube ? await nube.conectado().catch(() => false) : false,
    });
    if (ir) {
      document.body.dataset.vista = 'bienvenida';
      return pintarBienvenida(r, c, ir);
    }
    return vista(r, c, p);
  };
  const rutas = {};
  for (const [n, v] of Object.entries(vistas)) rutas[n] = guardian(n, v);

  await iniciarRouter(raiz, rutas, ctx);
  navigator.storage?.persist?.().catch(() => {});
  ctx.sync?.correr();
}

arrancar();
