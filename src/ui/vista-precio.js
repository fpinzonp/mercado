import { h, limpiar, campo } from './dom.js';
import { cargarEstado } from './estado.js';
import { leerProducto as leerProductoReal, leerTag as leerTagReal } from '../ia/leer.js';
import { reducirImagen as reducirReal } from '../img/reducir.js';
import { normalizarLectura } from '../logica/tamano.js';
import { parsePrecio, parseTamano, tipoDeUnidad, formatoCOP } from '../logica/unidades.js';
import { descuentoVigente } from '../logica/comparar.js';

const sinSigno = (n) => formatoCOP(n).slice(1);
const NOMBRE_TIPO = { g: 'gramos', ml: 'mililitros', unidad: 'unidades' };
const EJEMPLO_TAMANO = { g: '500 g o 1 kg', ml: '750 ml o 1 L', unidad: '30' };
const TIPOS = [['g', 'Peso'], ['ml', 'Líquido'], ['unidad', 'Unidades']];

export async function pintarPrecio(raiz, ctx, params = []) {
  const { repo } = ctx;
  const hoy = ctx.hoy();
  const leerProducto = ctx.leerProducto ?? leerProductoReal;
  const leerTag = ctx.leerTag ?? leerTagReal;
  const reducirImagen = ctx.reducirImagen ?? reducirReal;
  const e = await cargarEstado(repo);
  const producto = e.productos.get(params[0]);
  limpiar(raiz);
  if (!producto) {
    raiz.append(h('p', {}, 'Este producto ya no existe.'), h('button', { class: 'boton', onclick: () => ctx.ir('#/lista') }, 'Volver a la lista'));
    return;
  }
  const volverA = ['#/comprar', '#/productos'].find((r) => ctx.rutaAnterior?.startsWith(r)) ?? '#/lista';
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
  const inputTag = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'foto-tag', class: 'oculto' });
  const previa = h('img', { class: 'foto-previa', alt: 'Foto del producto', hidden: true });
  const estadoLectura = h('p', { class: 'leyendo', role: 'status' });
  const palabras = h('div', { class: 'palabras' });

  // Tipo de medida: se define aquí. Queda fijo si ya hay precios en otros mercados (para que se puedan comparar).
  let tipo = producto.tipoUnidad ?? null;
  const tipoError = h('p', { class: 'error', role: 'alert', hidden: true });
  const notaTipo = h('p', { class: 'ayuda' });
  const radiosTipo = TIPOS.map(([valor]) => h('input', { type: 'radio', name: 'tipo', value: valor }));
  const selectorTipo = h('fieldset', { class: 'opciones' },
    h('legend', {}, '¿Cómo se mide?'),
    TIPOS.map(([, etiqueta], i) => h('label', {}, radiosTipo[i], h('span', {}, etiqueta))),
  );
  const bloqueado = () => Boolean(producto.tipoUnidad) && ofertas.some((o) => o.mercadoId !== selMercado.value);

  // Campos
  const nombre = campo({ etiqueta: 'Nombre real', id: 'nombre', autocomplete: 'off', placeholder: `Ej. ${producto.nombre} marca X` });
  const tamano = campo({ etiqueta: 'Tamaño de la presentación', id: 'tamano', autocomplete: 'off', inputmode: 'decimal', ayuda: ' ' });
  const ayudaTamano = tamano.nodo.querySelector('.ayuda');
  const elegirTipo = (t) => {
    tipo = t;
    for (const r of radiosTipo) r.checked = r.value === t;
    if (ayudaTamano) ayudaTamano.textContent = t ? `Ej. ${EJEMPLO_TAMANO[t]}` : 'Ej. 500 g, 1 L o 30 (unidades)';
    if (t) tipoError.hidden = true;
  };
  const pintarTipo = () => {
    const fijo = bloqueado();
    if (fijo) elegirTipo(producto.tipoUnidad);
    for (const r of radiosTipo) r.disabled = fijo;
    notaTipo.textContent = fijo ? `Se mide en ${NOMBRE_TIPO[producto.tipoUnidad]} porque ya tiene precios en otros mercados.` : '';
    notaTipo.hidden = !fijo;
  };
  for (const r of radiosTipo) r.addEventListener('change', () => { if (r.checked) elegirTipo(r.value); });
  elegirTipo(tipo);
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
  // jsdom y algunos navegadores no avisan el cambio de radio a tiempo: se lee el marcado al validar.
  const tipoMarcado = () => selectorTipo.querySelector('input[name=tipo]:checked')?.value ?? tipo;
  const validarTamano = () => {
    const actual = tipoMarcado();
    const fijo = bloqueado();
    // Sin bloqueo, la unidad escrita ("1 L") manda sobre el tipo marcado.
    const r = parseTamano(tamano.input.value, fijo ? actual : null);
    if (!r) {
      const ej = actual ? EJEMPLO_TAMANO[actual] : '500 g o 1 L';
      tamano.mostrarError(fijo && tipoDeUnidad(tamano.input.value.replace(/[\d.,\s]/g, ''))
        ? `Este producto se mide en ${NOMBRE_TIPO[actual]}; escribe el tamaño así, por ejemplo ${ej}.`
        : `Escribe el tamaño, por ejemplo ${ej}.`);
      return null;
    }
    tamano.mostrarError('');
    const t = r.tipo ?? actual;
    if (!t) {
      tipoError.textContent = 'Elige si se mide por peso, líquido o unidades.';
      tipoError.hidden = false;
      return null;
    }
    if (t !== tipo || t !== actual) elegirTipo(t);
    return { tamano: r.tamano, tipo: t };
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
    pintarTipo();
  };
  selMercado.addEventListener('change', prellenar);
  prellenar();

  // Lo que el usuario escriba mientras se lee la foto no se pisa con la lectura.
  const editado = { nombre: false, tamano: false, precio: false, desc: false };
  nombre.input.addEventListener('input', () => { editado.nombre = true; });
  tamano.input.addEventListener('input', () => { editado.tamano = true; });
  precio.input.addEventListener('input', () => { editado.precio = true; });
  for (const el of [tieneDesc, precioDesc.input, porcentaje.input, detalle.input, hasta.input]) {
    el.addEventListener(el === tieneDesc ? 'change' : 'input', () => { editado.desc = true; });
  }

  // Foto del tag de precio del estante: llena precio, descuento, vigencia y tamaño.
  inputTag.addEventListener('change', async () => {
    const file = inputTag.files?.[0];
    if (!file) return;
    estadoLectura.textContent = 'Leyendo el precio…';
    try {
      const blob = await reducirImagen(file);
      const r = await leerTag(blob, { clave: e.ajustes.geminiClave, modelo: e.ajustes.geminiModelo, hoy });
      if (r.fuente === 'manual') {
        estadoLectura.textContent = r.aviso ?? 'No pude leer el tag; escribe el precio.';
        return;
      }
      if (r.precioNormal && !editado.precio) {
        precio.input.value = sinSigno(r.precioNormal);
        precio.mostrarError('');
      }
      if ((r.precioDescuento || r.porcentaje) && !editado.desc) {
        tieneDesc.checked = true;
        zonaDesc.hidden = false;
        precioDesc.input.value = r.precioDescuento ? sinSigno(r.precioDescuento) : '';
        porcentaje.input.value = r.precioDescuento ? '' : String(r.porcentaje);
        if (!r.precioDescuento) calcularDesdePorcentaje();
        detalle.input.value = r.detalle ?? '';
        hasta.input.value = r.hasta ?? '';
        precioDesc.mostrarError('');
      }
      if (r.tamano && !editado.tamano && !tamano.input.value && (!bloqueado() || r.unidad === tipo)) {
        tamano.input.value = String(r.tamano);
        if (!bloqueado() && r.unidad) elegirTipo(r.unidad);
      }
      const falta = [
        !precio.input.value && 'precio',
        !tamano.input.value && 'tamaño',
        !nombre.input.value && 'nombre (toma la foto del producto o escríbelo)',
      ].filter(Boolean);
      estadoLectura.textContent = [
        r.aviso,
        'Revisa lo que leí del precio y corrige si hace falta.',
        falta.length ? `Falta: ${falta.join(', ')}.` : '',
      ].filter(Boolean).join(' ');
    } catch {
      estadoLectura.textContent = 'No pude procesar la foto del precio; escríbelo a mano.';
    }
    inputTag.value = '';
  });

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
      // Si el tipo no está fijo, la unidad leída en el empaque lo propone; si no trae unidad, se usa el marcado.
      const fijo = bloqueado();
      const lectura = normalizarLectura(r, fijo ? tipo : (tipoDeUnidad(r.unidad) || tipoMarcado()));
      if (r.fuente === 'gemini' && lectura.nombre && !editado.nombre) nombre.input.value = lectura.nombre;
      if (!editado.tamano) {
        if (lectura.tamano) {
          tamano.input.value = String(lectura.tamano);
          if (!fijo && lectura.tipo) elegirTipo(lectura.tipo);
        } else if (r.fuente === 'gemini') tamano.input.value = '';
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
    h('div', { class: 'fotos' },
      h('label', { class: 'boton', for: 'foto' }, 'Foto del producto'),
      h('label', { class: 'boton secundario', for: 'foto-tag' }, 'Foto del precio'),
    ),
    inputFoto, inputTag,
    h('p', { class: 'ayuda' }, 'El producto da el nombre y el tamaño; el tag del estante, el precio y la promoción.'),
    previa, estadoLectura, palabras,
    nombre.nodo, selectorTipo, notaTipo, tipoError, tamano.nodo, precio.nodo,
    h('label', { class: 'interruptor', for: 'tiene-descuento' }, tieneDesc, 'Tiene descuento'),
    zonaDesc,
    h('div', { class: 'acciones-form' },
      h('button', { class: 'boton secundario', type: 'button', onclick: () => ctx.ir(volverA) }, 'Cancelar'),
      h('button', { class: 'boton', type: 'submit' }, 'Guardar precio'),
    ),
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
    if (vTamano.tipo !== producto.tipoUnidad) await repo.guardarProducto({ ...producto, tipoUnidad: vTamano.tipo });
    const anterior = ofertas.find((x) => x.mercadoId === selMercado.value);
    const fotoId = foto ? await repo.guardarFoto(foto) : anterior?.fotoId;
    await repo.guardarOferta({
      productoId: producto.id,
      mercadoId: selMercado.value,
      nombreReal: vNombre,
      tamano: vTamano.tamano,
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
