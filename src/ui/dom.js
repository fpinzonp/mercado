/**
 * h('button', { class: 'x', onclick: fn, disabled: true }, 'Texto', otroNodo)
 * Los textos siempre entran como nodos de texto (nunca como HTML).
 */
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export function limpiar(raiz) {
  raiz.replaceChildren();
  return raiz;
}

/** Campo con etiqueta visible y mensaje de error en línea. */
export function campo({ etiqueta, id, ayuda, ...attrs }) {
  const input = h('input', { id, ...attrs });
  const error = h('p', { class: 'error', id: `${id}-error`, role: 'alert', hidden: true });
  input.setAttribute('aria-describedby', `${id}-error`);
  const nodo = h('div', { class: 'campo' },
    h('label', { for: id }, etiqueta),
    input,
    ayuda ? h('p', { class: 'ayuda' }, ayuda) : null,
    error,
  );
  return {
    nodo,
    input,
    mostrarError(msg) {
      error.textContent = msg || '';
      error.hidden = !msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    },
  };
}

/** Hoja inferior simple (bottom sheet) con foco atrapado; devuelve cerrar(). */
export function abrirHoja(titulo, contenido) {
  const anterior = document.activeElement;
  const fondo = h('div', { class: 'hoja-fondo' });
  const hoja = h('div', { class: 'hoja', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('h2', {}, titulo), contenido);
  const cerrar = () => {
    fondo.remove();
    document.removeEventListener('keydown', teclas);
    anterior?.focus?.();
  };
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar();
    if (e.key === 'Tab') {
      const f = [...hoja.querySelectorAll('button, input, select, a[href]')].filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  document.addEventListener('keydown', teclas);
  fondo.append(hoja);
  document.body.append(fondo);
  hoja.querySelector('button, input')?.focus();
  return cerrar;
}

/** Aviso breve abajo. Con `accion` muestra un botón (p. ej. Deshacer) y dura más. */
export function aviso(texto, { accion, alTocar } = {}) {
  for (const viejo of document.querySelectorAll('.toast')) viejo.remove();
  const t = h('div', { class: 'toast', role: 'status' }, texto);
  if (accion) {
    t.append(h('button', { class: 'toast-accion', type: 'button', onclick: () => { t.remove(); alTocar?.(); } }, accion));
  }
  document.body.append(t);
  setTimeout(() => t.remove(), accion ? 6000 : 3500);
}
