# Mercado — diseño

Fecha: 2026-11-24

## Intención

Francisco quiere una app web para el celular que le sirva de lista de mercado y, a la vez, de comparador de precios entre 3 o 4 mercados (por ejemplo D1, Éxito, Ara). En casa arma la lista con lo que necesita y cuánto; en el mercado le toma una foto a cada producto para que la app guarde el nombre real (marca, producto y tamaño) y anota el precio. Con los precios de varios mercados, la app le dice dónde sale más barata la compra según las cantidades que necesita, y él va tachando lo que echa al carrito, como en una lista de papel.

Es de uso personal, en un solo celular, en español y con pesos colombianos.

## Objetivos

- Armar una lista de mercado: producto genérico ("Arroz") con cantidad y unidad (g, ml o unidades).
- Por cada producto y cada mercado, registrar una "oferta": foto, nombre real, tamaño de la presentación y precio.
- Leer el nombre real y el tamaño desde la foto con IA (Gemini, plan gratuito); el resultado siempre queda editable antes de guardar.
- Comparar:
  - **Por mercado:** total de la lista en cada mercado.
  - **Por producto:** cuál mercado sale más barato para la cantidad necesitada.
  - **Precio unitario:** $/g para peso, $/ml para líquidos, $/unidad para lo que se cuenta.
- Tachar productos de la lista mientras se compra.
- Que la lista, el tachado y la comparación funcionen sin internet.

## No objetivos

- Sincronizar entre dispositivos o compartir la lista con otra persona.
- Cuentas de usuario, servidor propio o base de datos en la nube.
- Historial de precios en el tiempo ni gráficas (se guarda la fecha de la última actualización, nada más).
- Escanear códigos de barras.
- Descargar precios de las páginas de los mercados.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que en el mercado, sin señal, no abra la lista o no se pueda tachar.
- Que haya que pagar algo para usarla.
- Que registrar un precio en el mercado tome más de unos segundos por producto: abrir cámara, confirmar lo que leyó la IA, escribir el precio, guardar.
- Que la IA guarde un nombre equivocado sin que Francisco lo pueda corregir.

## Restricciones

- Gratis: hosting en GitHub Pages; IA con el plan gratuito de Gemini (clave propia de Francisco, que se pega una vez en Ajustes y queda guardada solo en el teléfono).
- El plan gratuito de Gemini tiene límites por minuto y por día que Google puede cambiar; para 20–40 fotos por compra no debería alcanzarse, pero la app debe manejar el error de límite (HTTP 429) pasando al respaldo.
- La cámara del navegador exige HTTPS (GitHub Pages lo da).
- Debe verse y usarse bien en un celular de 375 px de ancho, con una mano.

## Enfoques considerados

1. **App web instalable (PWA) independiente — ELEGIDO.** Código propio, alojado gratis en GitHub Pages, datos en el teléfono (IndexedDB), funciona sin internet salvo la lectura con IA; respaldo con Tesseract.js en el dispositivo. Elegido porque en el mercado la señal falla y la lista tiene que abrir siempre.
2. **Artifact de Claude.** Usaría Claude para leer la foto sin clave de Gemini y sincronizaría entre dispositivos, pero solo abre dentro de claude.ai con internet, y la cámara dentro de la app móvil de Claude es incierta. Descartado por el uso sin señal.
3. **App con servidor y base de datos en la nube.** Más complejo de lo necesario para uso personal. Descartado.

## Decidido con Francisco

- Lectura de la foto: Gemini (plan gratuito) como principal; Tesseract.js en el dispositivo como respaldo cuando no hay señal o se acabó el cupo. El nombre siempre es editable.
- Comparación: mostrar ambas cosas — total por mercado arriba, y en cada producto se marca el mercado más barato.
- Cantidades: la lista dice cuánto se necesita; cada oferta dice el tamaño de su presentación; la app calcula cuántos paquetes se necesitan y el costo en cada mercado. Puede ser una marca distinta en cada mercado: se compara el producto genérico.
- Unidades: gramos para peso, mililitros para líquidos, unidades para lo que se cuenta. El precio unitario se muestra en $/g, $/ml o $/unidad. Lo que se vende a granel se registra como una presentación más (ej. 1000 g a $X).
- Plataforma: PWA independiente (enfoque 1).
- Dispositivo: iPhone con Safari.
- Compra repartida: Francisco compra en varios mercados en una misma salida, y los precios guardados le sirven en compras futuras para saber dónde estaba más barato cada producto.
- Descuentos: guardar los dos precios, el normal y el de descuento, para saber si algo salió barato por una promoción o si ese es su precio de siempre.

## Diseño

### Datos (IndexedDB, todo local)

- **Mercado** — `id`, `nombre`. Se configuran en Ajustes (3 o 4; sin máximo duro). Vienen vacíos; la app pide crearlos la primera vez.
- **Producto** (catálogo, se reutiliza entre compras) — `id`, `nombre` genérico ("Arroz"), `tipoUnidad` (`g` | `ml` | `unidad`).
- **Oferta** — `id`, `productoId`, `mercadoId`, `nombreReal` ("Arroz Diana"), `tamano` (número en la unidad del producto, ej. 1000), `precioNormal` (COP, entero), `fotoId` (opcional), `actualizado` (fecha), y un descuento opcional:
  - `precioDescuento` (COP, entero, por la misma presentación),
  - `detalleDescuento` (texto libre opcional: "−20%", "2x1", "con tarjeta"),
  - `descuentoHasta` (fecha opcional; si no se pone, el descuento se considera vigente solo el día en que se registró).

  Una oferta por producto y mercado; registrar de nuevo la reemplaza (al actualizar el precio normal, el descuento anterior se borra salvo que siga vigente y no se toque).
- **Foto** — blob JPEG reducido (lado mayor ~800 px) guardado en IndexedDB.
- **Lista** — la lista activa: ítems con `productoId`, `cantidad` (en la unidad del producto), `tachado`, `compradoEn` (mercadoId, se llena al tachar). Una sola lista activa; "Nueva lista" vacía o destacha los ítems pero conserva catálogo y ofertas, para que los precios sirvan en la próxima compra.
- **Ajustes** — clave de Gemini, modelo de Gemini (configurable, con un valor por defecto vigente de la familia Flash).

Unidades de entrada: el usuario puede escribir kg o L y la app las convierte a g o ml al guardar.

### Cálculos

Precio efectivo `P` de una oferta = `precioDescuento` si hay un descuento vigente hoy; si no, `precioNormal`.

Para un ítem con cantidad necesaria `N` y una oferta con tamaño `T` y precio efectivo `P`:

- paquetes = ⌈N / T⌉
- costo = paquetes × P
- precio unitario = P / T (mostrado con 2 decimales: "$4,50/g")

Más barato por producto = la oferta de menor **costo** para `N`; el precio unitario se muestra al lado como referencia. Empates: se marcan ambos.

Descuentos en la comparación (mi decisión, ajustable):
- Si el más barato lo es **solo por un descuento vigente**, se marca distinto ("más barato hoy, por descuento") y se indica cuál es el más barato a precio normal.
- Cada oferta con descuento muestra los dos precios (normal tachado, descuento) y cuánto se ahorra.
- Los descuentos vencidos no cuentan en el cálculo, pero se ven en la oferta como "tuvo descuento: $X (fecha)" para saber que ese mercado a veces lo rebaja.

Total por mercado = suma de los costos de los ítems de la lista que tienen oferta en ese mercado. Si a un mercado le faltan precios, el total lo dice ("faltan 2 precios") y ese mercado no se declara ganador frente a uno con la lista completa; se ordena primero por cantidad de precios faltantes y luego por total.

**Total combinado** = suma, por ítem, del costo en el mercado donde sale más barato. Se muestra junto con el ahorro frente al mejor mercado único.

### Flujo de la foto

1. En un producto de la lista, tocar "Agregar precio" → elegir mercado (por defecto, el mercado activo de "Comprar aquí" si hay uno; si no, el último usado).
2. Abrir cámara (`<input type="file" accept="image/*" capture="environment">`).
3. Reducir la imagen y enviarla a Gemini pidiendo JSON: `{nombre, tamano, unidad}`.
4. Sin señal, error o 429 → Tesseract.js (idioma español) extrae texto; se muestran las palabras para tocar y armar el nombre, y se intenta detectar un tamaño (patrones como "500 g", "1 kg", "1.000 ml").
5. Formulario prellenado: nombre real, tamaño + unidad, precio normal (teclado numérico). Debajo, un interruptor "Tiene descuento" que muestra: precio con descuento (o un % que lo calcula), detalle opcional y fecha "válido hasta" opcional. Guardar.

### Pantallas

- **Lista** (principal): arriba, la franja de totales por mercado con el más barato resaltado, y el total combinado ("Repartiendo: $79.000, ahorras $6.000"); abajo, los ítems con cantidad, casilla para tachar y, debajo de cada uno, sus ofertas por mercado con el más barato marcado. Tachados van al final, atenuados.

```
 D1 $85.000 ✓   Ara $92.000   Éxito $97.000 (faltan 1)
 ───────────────────────────────────────────────
 ☐ Arroz · 2 kg
     D1     Arroz Diana 1kg   $4.500 → $9.000  $4,50/g ✓ normal
     Ara    Arroz Roa 1kg  $̶5̶.̶0̶0̶0̶ $4.000 → $8.000  🏷 −20% hasta 30/11  ✓ hoy
     Éxito  Arroz Roa 500g    $2.400 → $9.600  $4,80/g
     + Agregar precio
 ☐ Aceite · 1 L
 ☑ ~~Huevos · 30 un~~
```

- **Comprar aquí**: se elige el mercado donde se está (queda como mercado activo hasta cambiarlo o salir). Muestra arriba los ítems sin tachar que conviene comprar ahí (es el más barato, o ningún otro mercado tiene precio), y abajo, plegados, los que salen más baratos en otro mercado, con cuál y por cuánto. Tachar aquí guarda `compradoEn` = mercado activo. Desde la Lista, tachar pregunta en qué mercado se compró (preseleccionando el más barato).
- **Agregar a la lista**: buscar en el catálogo o crear producto nuevo (nombre + tipo de unidad) y cantidad.
- **Agregar precio**: el flujo de la foto de arriba.
- **Ajustes**: mercados, clave y modelo de Gemini (con enlace a AI Studio y explicación breve), exportar/importar respaldo (JSON con fotos en base64), borrar todo.

### Dispositivo: iPhone con Safari (decidido con Francisco)

Es el dispositivo objetivo y donde se prueba todo. Consecuencias:

- **Instalar en la pantalla de inicio es obligatorio.** Safari puede borrar IndexedDB de sitios no instalados. Al abrir la app en Safari sin instalar (detectar con `navigator.standalone` / `display-mode: standalone`), mostrar una pantalla con los pasos "Compartir → Agregar a pantalla de inicio" antes de dejar guardar datos. Incluir `manifest.json`, iconos y `apple-touch-icon`.
- Pedir `navigator.storage.persist()` cuando exista (no garantiza nada en iOS, pero no estorba).
- **Recordatorio de respaldo:** si pasaron más de 14 días desde el último respaldo exportado y hay datos nuevos, mostrar un aviso discreto en la Lista con botón para exportar (la hoja de compartir de iOS permite guardarlo en Archivos/iCloud). Mi decisión: 14 días.
- **Tesseract es de mejor esfuerzo en iPhone.** Por el límite de almacenamiento y memoria de Safari, no se promete que funcione sin internet. Se intenta precachear; si no está disponible o falla, el formulario queda vacío para escribir el nombre a mano (la foto se guarda igual). El plan debe incluir una prueba temprana de Tesseract en un iPhone real.

### Sin internet

Service worker que precachea la app (y, de mejor esfuerzo, los archivos de Tesseract.js con los datos del español) en la primera visita con señal. La Lista, el tachado, la comparación y escribir precios a mano deben funcionar siempre sin internet.

## Queda a criterio de quien lo construya

- Herramientas concretas (JS sin framework o uno ligero; con o sin paso de compilación), siempre que se pueda publicar gratis en GitHub Pages.
- Estilo visual, siempre que sea claro, de alto contraste y usable con una mano.
- El texto exacto del prompt a Gemini y el nombre del modelo por defecto.
- Cómo se ve la selección de palabras del respaldo con Tesseract.
