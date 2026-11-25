import { createClient } from '@supabase/supabase-js';

// Datos públicos del proyecto: la clave "publishable" está hecha para ir en la app.
// La seguridad la ponen las reglas de la base (cada usuario solo ve sus filas): ver supabase/esquema.sql.
export const SUPABASE_URL = 'https://ycyurqnghgpdpqeuxtke.supabase.co';
export const SUPABASE_CLAVE = 'sb_publishable_-313rz240qB2ie2Kgv3UlQ_tPW_NkIu';
const APP_URL = 'https://fpinzonp.github.io/mercado/';

const SOLAPE_MS = 60_000; // se vuelve a bajar el último minuto por si algo se guardó al mismo tiempo
const PAGINA = 1000;

const errorDe = (e) => Object.assign(new Error(e?.message ?? 'Error de Supabase'), {
  codigo: e?.code, sinRed: /fetch|network/i.test(e?.message ?? ''),
});

/** Nube para sync.js, más el inicio de sesión con código por correo. */
export function crearNube(sb = createClient(SUPABASE_URL, SUPABASE_CLAVE, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'mercado-sesion' },
})) {
  const usuario = async () => (await sb.auth.getSession()).data.session?.user ?? null;
  const carpeta = async () => {
    const u = await usuario();
    if (!u) throw errorDe({ message: 'Sin sesión' });
    return u.id;
  };

  return {
    // Cuenta
    async cuenta() {
      const u = await usuario();
      return u ? { email: u.email } : null;
    },
    async conectado() { return Boolean(await usuario()); },
    async entrar(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw errorDe(error);
    },
    /** Si el proyecto pide confirmar el correo, no hay sesión hasta que se toque el enlace. */
    async crearCuenta(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: APP_URL } });
      if (error) throw errorDe(error);
      return { necesitaConfirmar: !data.session };
    },
    async salir() { await sb.auth.signOut(); },

    // Datos
    async subir(tabla, filas) {
      const { error } = await sb.from(tabla).upsert(filas, { onConflict: 'id' });
      if (!error) return { rechazados: [] };
      if (error.code !== '23505') throw errorDe(error);
      // Algún producto repetido: se sube uno por uno y se dejan los rechazados para después de unirlos.
      const rechazados = [];
      for (const f of filas) {
        const { error: e } = await sb.from(tabla).upsert(f, { onConflict: 'id' });
        if (e?.code === '23505') rechazados.push(f.id);
        else if (e) throw errorDe(e);
      }
      return { rechazados };
    },
    async bajar(tabla, desde) {
      const filas = [];
      const minimo = desde ? new Date(new Date(desde).getTime() - SOLAPE_MS).toISOString() : null;
      for (let i = 0; ; i += PAGINA) {
        let q = sb.from(tabla).select('id,datos,actualizado_en,borrado,modificado').order('modificado').order('id');
        if (minimo) q = q.gt('modificado', minimo);
        const { data, error } = await q.range(i, i + PAGINA - 1);
        if (error) throw errorDe(error);
        filas.push(...data);
        if (data.length < PAGINA) break;
      }
      const hasta = filas.reduce((m, f) => (!m || f.modificado > m ? f.modificado : m), desde ?? null);
      return { filas, hasta };
    },
    async subirFoto(id, blob) {
      const { error } = await sb.storage.from('fotos')
        .upload(`${await carpeta()}/${id}`, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
      if (error) throw errorDe(error);
    },
    async bajarFoto(id) {
      const { data, error } = await sb.storage.from('fotos').download(`${await carpeta()}/${id}`);
      if (error) {
        if (/not.?found|404/i.test(`${error.message} ${error.statusCode ?? ''}`)) return null;
        throw errorDe(error);
      }
      return data;
    },
  };
}
