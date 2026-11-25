# Mercado

Lista de mercado y comparador de precios para el iPhone. Le tomas una foto al producto, la app lee su nombre real y su tamaño, anotas el precio en cada mercado y te dice dónde sale más barato por gramo, mililitro o unidad. En **Productos** guardas precios de cosas que no están en la lista de este mes, para saber dónde comprarlas después.

## Instalar en el iPhone

1. Abre la dirección de la app en **Safari**.
2. Toca **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **Agregar a pantalla de inicio**.
4. Abre Mercado desde el ícono nuevo, no desde Safari.

Instalada, la lista, el tachado y la comparación funcionan sin señal.


## Respaldo

**Ajustes → Exportar respaldo** guarda un archivo con tu lista, precios y fotos (en Archivos o iCloud). La app te lo recuerda si pasan más de 14 días con cambios sin respaldar. Para recuperarlo: **Ajustes → Importar respaldo**.

## Desarrollo

```bash
npm install        # también copia Tesseract a public/tesseract
npm test           # pruebas
npm run dev        # servidor local (abre en el iPhone con http://<IP-del-PC>:5173)
npm run build      # genera dist/
```

Se publica en GitHub Pages con cada push a `main` (`.github/workflows/deploy.yml`).

## Sincronizar entre dispositivos (Supabase gratis)

Lo primero que pide la app es entrar con tu correo y una contraseña; sin sesión no se ve nada. Desde ahí la lista, los precios y las fotos se sincronizan solos entre todos tus dispositivos. Sin señal todo sigue funcionando en el teléfono y se sube después. Si dos dispositivos cambian lo mismo, gana el cambio más reciente; los productos con el mismo nombre (sin importar mayúsculas, tildes ni espacios) se unen en uno.

Configuración (una sola vez): en Supabase → **SQL Editor** pega y ejecuta `supabase/esquema.sql`. En **Authentication → URL Configuration**, pon como *Site URL* https://fpinzonp.github.io/mercado/ para que el enlace de confirmación de la cuenta abra la app. El flujo `supabase-activo.yml` evita que el proyecto gratis se pause por inactividad.

## Lectura de fotos con IA (Gemini en el servidor)

La clave de Gemini nunca va en el teléfono: vive como secreto en la función `supabase/functions/leer-foto`, que solo responde a usuarios con sesión. Para activarla: Supabase → **Edge Functions → Deploy a new function → Via Editor**, nombre `leer-foto`, pega `index.ts` y despliega; luego en **Edge Functions → Secrets** agrega `GEMINI_API_KEY` (la clave de https://aistudio.google.com/apikey). Sin eso, las fotos se leen en el teléfono.
