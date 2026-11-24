import { h, limpiar, campo } from './dom.js';
import { cargarEstado } from './estado.js';
import { leerProducto as leerProductoReal } from '../ia/leer.js';
import { reducirImagen as reducirReal } from '../img/reducir.js';
import { normalizarLectura } from '../logica/tamano.js';
import { parsePrecio, parseCantidad, formatoCOP } from '../logica/unidades.js';
import { descuentoVigente } from '../logica/comparar.js';

const sinSigno = (n) => formatoCOP(n).slice(1);
const NOMBRE_TIPO = { g: 'gramos', ml: 'mililitros', unidad: 'unidades' };
const EJEMPLO_TAMANO = { g: '500 g o 1 kg', ml: '750 ml o 1 L', unidad: '30' };

export async function pintarPrecio(raiz, ctx, params = []) {
  const { repo } = ctx;
  const hoy = ctx.hoy();
  const leerProducto = ctx.leerProducto ?? leerProductoReal;
  const reducirImagen = ctx.reducirImagen ?? reducirReal;
  const e = await cargarEstado(repo);
  const producto = e.productos.get(params[0]);
  limpiar(raiz);
  if (!producto) {
    raiz.append(h('p', {}, 'Este producto ya no existe.'), h('button', { class: 'boton', onclick: () => ctx.ir('#/lista') }, 'Volver a la lista'));
    return;
  }
  const volverA = ctx.rutaAnterior?.startsWith('#/comprar') ? '#/comprar' : '#/lista';
  const ofertas = e.ofertasPorProducto.get(producto.id) ?? [];
  let foto = null;

  // Mercado
  const mercadoInicial = [e.ajustes.mercadoActivo, e.ajustes.ultimoMercadoPrecio, e.mercados[0]?.id]
    .find((id) => id && e.mercadosPorId.has(id));
  const selMercado = h('select', { id: 'mercado' },
    e.mercados.map((m) => h('option', { value: m.id, selected: m.id === mercadoInicial }, m.nombre)));
  if (mercadoInicial) selMercado.value = mercadoInicial;

  // Foto
  const inputFoto = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'foto', class: 'oculto' });
  const previa = h('img', { class: 'foto-previa', alt: 'Foto del producto', hidden: true });
  const estadoLectura = h('p', { class: 'leyendo', role: 'status' });
  const palabras = h('div', { class: 'palabras' });

  // Campos
  const nombre = campo({ etiqueta: 'Nombre real', id: 'nombre', autocomplete: 'off', placeholder: `Ej. ${producto.nombre} marca X` });
  const tamano = campo({
    etiqueta: `Tamaño de la presentación (${NOMBRE_TIPO[producto.tipoUnidad]})`, id: 'tamano', autocomplete: 'off',
    inputmode: 'decimal', ayuda: `Ej. ${EJEMPLO_TAMANO[producto.tipoUnidad]}`,
  });
  const precio = campo({ etiqueta: 'Precio normal', id: 'precio', autocomplete: 'off', inputmode: 'numeric', placeholder: 'Ej. 4.500' });

  const tieneDesc = h('input', { type: 'checkbox', id: 'tiene-descuento' });
  const precioDesc = campo({ etiqueta: 'Precio con descuento', id: 'precio-descuento', autocomplete: 'off', inputmode: 'numeric' });
  const porcentaje = campo({ etiqueta: '% desc.', id: 'porcentaje', autocomplete: 'off', inputmode: 'decimal' });
  const detalle = campo({ etiqueta: 'Detalle (opcional)', id: 'detalle', autocomplete: 'off', placeholder: 'Ej. 2x1, con tarjeta' });
  const hasta = campo({ etiqueta: 'Válido hasta (opcional)', id: 'hasta', type: 'date', min: hoy, ayuda: 'Si no lo pones, cuenta solo por hoy.' });
  const zonaDesc = h('div', { class: 'descuento', hidden: true },
    h('div', { class: 'fila-desc' }, precioDesc.nodo, porcentaje.nodo), detalle.nodo, hasta.nodo);
  tieneDesc.addEventListener('change', () => { zonaDesc.hidden = !tieneDesc.checked; });

  const calcularDesdePorcentaje = () => {
    const p = Number(String(porcentaje.input.value).replace(',', '.'));
    const normal = parsePrecio(precio.input.value);
    if (normal && p > 0 && p < 100) precioDesc.input.value = sinSigno(Math.round(normal * (1 - p / 100)));
  };
  porcentaje.input.addEventListener('input', calcularDesdePorcentaje);
  precio.input.addEventListener('input', () => { precio.mostrarError(''); if (porcentaje.input.value) calcularDesdePorcentaje(); });
  nombre.input.addEventListener('input', () => nombre.mostrarError(''));
  tamano.input.addEventListener('input', () => tamano.mostrarError(''));
  precioDesc.input.addEventListener('input', () => { precioDesc.mostrarError(''); });

  // Validación
  const validarNombre = () => {
    const v = nombre.input.value.trim();
    nombre.mostrarError(v ? '' : 'Escribe el nombre del producto.');
    return v || null;
  };
  const validarTamano = () => {
    const v = parseCantidad(tamano.input.value, producto.tipoUnidad);
    tamano.mostrarError(v ? '' : `Escribe el tamaño, por ejemplo ${EJEMPLO_TAMANO[producto.tipoUnidad]}.`);
    return v;
  };
  const validarPrecio = () => {
    const v = parsePrecio(precio.input.value);
    precio.mostrarError(v ? '' : 'Escribe el precio, por ejemplo 4.500.');
    return v;
  };
  const validarDescuento = (normal) => {
    if (!tieneDesc.checked) return { ok: true, valor: null };
    if (!precioDesc.input.value && porcentaje.input.value) calcularDesdePorcentaje();
    const v = parsePrecio(precioDesc.input.value);
    let msg = '';
    if (!v) msg = 'Escribe el precio con descuento o el porcentaje.';
    else if (normal && v >= normal) msg = 'El precio con descuento debe ser menor que el normal.';
    precioDesc.mostrarError(msg);
    const fechaMala = hasta.input.value && hasta.input.value < hoy;
    hasta.mostrarError(fechaMala ? 'La fecha ya pasó; elige hoy o una fecha futura, o déjala vacía.' : '');
    return { ok: !msg && !fechaMala, valor: v };
  };
  nombre.input.addEventListener('blur', () => { if (nombre.input.value) validarNombre(); });
  tamano.input.addEventListener('blur', () => { if (tamano.input.value) validarTamano(); });
  precio.input.addEventListener('blur', () => { if (precio.input.value) validarPrecio(); });

  // Prellenar con lo guardado para el mercado elegido
  const prellenar = () => {
    const o = ofertas.find((x) => x.mercadoId === selMercado.value);
    nombre.input.value = o?.nombreReal ?? '';
    tamano.input.value = o?.tamano ? String(o.tamano) : '';
    precio.input.value = o?.precioNormal ? sinSigno(o.precioNormal) : '';
    const vigente = o && descuentoVigente(o, hoy);
    tieneDesc.checked = Boolean(vigente);
    zonaDesc.hidden = !vigente;
    precioDesc.input.value = vigente ? sinSigno(o.precioDescuento) : '';
    porcentaje.input.value = '';
    detalle.input.value = vigente ? o.detalleDescuento ?? '' : '';
    hasta.input.value = vigente ? o.descuentoHasta ?? '' : '';
  };
  selMercado.addEventListener('change', prellenar);
  prellenar();

  // Lo que el usuario escriba mientras se lee la foto no se pisa con la lectura.
  const editado = { nombre: false, tamano: false };
  nombre.input.addEventListener('input', () => { editado.nombre = true; });
  tamano.input.addEventListener('input', () => { editado.tamano = true; });

  inputFoto.addEventListener('change', async () => {
    const file = inputFoto.files?.[0];
    if (!file) return;
    palabras.replaceChildren();
    editado.nombre = false;
    editado.tamano = false;
    estadoLectura.textContent = 'Leyendo etiqueta…';
    try {
      foto = await reducirImagen(file);
      if (typeof URL.createObjectURL === 'function') {
        previa.src = URL.createObjectURL(foto);
        previa.hidden = false;
      }
      const [clave, modelo] = [e.ajustes.geminiClave, e.ajustes.geminiModelo];
      const r = await leerProducto(foto, { clave, modelo });
      estadoLectura.textContent = r.aviso ?? (r.fuente === 'gemini' ? 'Revisa lo que leí y corrige si hace falta.' : '');
      const lectura = normalizarLectura(r, producto.tipoUnidad);
      if (r.fuente === 'gemini' && lectura.nombre && !editado.nombre) nombre.input.value = lectura.nombre;
      if (!editado.tamano) {
        if (lectura.tamano) tamano.input.value = String(lectura.tamano);
        else if (r.fuente === 'gemini') tamano.input.value = '';
      }
      if (r.fuente === 'ocr') {
        if (!r.aviso) estadoLectura.textContent = 'Toca las palabras del nombre en orden.';
        let primera = !editado.nombre;
        for (const p of r.palabras ?? []) {
          palabras.append(h('button', {
            type: 'button',
            onclick: (ev) => {
              // La primera palabra reemplaza el nombre guardado; las siguientes se suman.
              const base = primera ? '' : nombre.input.value.trim();
              primera = false;
              nombre.input.value = [base, p].filter(Boolean).join(' ');
              nombre.mostrarError('');
              ev.currentTarget.disabled = true;
            },
          }, p));
        }
      }
    } catch {
      estadoLectura.textContent = 'No pude procesar la foto; escribe los datos a mano.';
    }
    inputFoto.value = '';
  });

  const form = h('form', { novalidate: true },
    h('h1', {}, `Precio de ${producto.nombre}`),
    h('div', { class: 'campo' }, h('label', { for: 'mercado' }, 'Mercado'), selMercado),
    h('label', { class: 'boton', for: 'foto' }, 'Tomar foto'), inputFoto,
    previa, estadoLectura, palabras,
    nombre.nodo, tamano.nodo, precio.nodo,
    h('label', { class: 'interruptor', for: 'tiene-descuento' }, tieneDesc, 'Tiene descuento'),
    zonaDesc,
    h('button', { class: 'boton', type: 'submit' }, 'Guardar precio'),
    h('button', { class: 'boton secundario', type: 'button', onclick: () => ctx.ir(volverA) }, 'Cancelar'),
  );

  let guardando = false;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (guardando) return;
    const vNombre = validarNombre();
    const vTamano = validarTamano();
    const vPrecio = validarPrecio();
    const desc = validarDescuento(vPrecio);
    if (!vNombre || !vTamano || !vPrecio || !desc.ok) {
      form.querySelector('[aria-invalid=true]')?.focus();
      return;
    }
    guardando = true;
    const anterior = ofertas.find((x) => x.mercadoId === selMercado.value);
    const fotoId = foto ? await repo.guardarFoto(foto) : anterior?.fotoId;
    await repo.guardarOferta({
      productoId: producto.id,
      mercadoId: selMercado.value,
      nombreReal: vNombre,
      tamano: vTamano,
      precioNormal: vPrecio,
      ...(fotoId ? { fotoId } : {}),
      precioDescuento: desc.valor,
      detalleDescuento: desc.valor ? detalle.input.value.trim() || null : null,
      descuentoHasta: desc.valor ? hasta.input.value || null : null,
    }, hoy);
    await repo.guardarAjuste('ultimoMercadoPrecio', selMercado.value);
    ctx.ir(volverA);
  });

  raiz.append(form);
}
