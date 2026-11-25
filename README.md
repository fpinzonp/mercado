# Mercado

Lista de mercado y comparador de precios para el iPhone. Le tomas una foto al producto, la app lee su nombre real y su tamaño, anotas el precio en cada mercado y te dice dónde sale más barato por gramo, mililitro o unidad. En **Productos** guardas precios de cosas que no están en la lista de este mes, para saber dónde comprarlas después.

## Instalar en el iPhone

1. Abre la dirección de la app en **Safari**.
2. Toca **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **Agregar a pantalla de inicio**.
4. Abre Mercado desde el ícono nuevo, no desde Safari.

Instalada, la lista, el tachado y la comparación funcionan sin señal.

## Clave de Gemini (gratis)

Sirve para leer el nombre y el tamaño del producto en la foto.

1. Entra a [Google AI Studio](https://aistudio.google.com/apikey) con tu cuenta de Google.
2. Toca **Create API key** y copia la clave.
3. En la app: **Ajustes → Clave de Gemini**, pégala.

La clave solo se guarda en el teléfono. Sin clave, sin señal o si se acaba el cupo gratis del día, la app intenta leer la etiqueta con el propio teléfono. Si tampoco puede, escribes el nombre a mano.

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
