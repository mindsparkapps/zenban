// ===== ZenBan - Copiar y pegar estilo, y estilo principal =====
// Copiar estilo toma el aspecto del objeto seleccionado (color, grosor, opacidad, etc.) y Pegar estilo lo aplica
// a otros: del mismo tipo se pasa todo; de otro tipo, solo lo que coincide (color, opacidad y tamaño si se parecen).
// Estilo principal: el estilo de un objeto queda como el de los objetos nuevos de ese tipo (en este dispositivo).

const STYLE_KEYS = {
  frame: ['color', 'fill', 'radius', 'opacity', 'titleBg', 'titleColor', 'titleSize', 'titleFill', 'titleBold', 'titleAlign', 'hideTitle', 'hideTab'],
  conn: ['color', 'size', 'opacity', 'both'],
  stroke: ['color', 'size'],
  text: ['color', 'size'],
  sticky: ['sticky', 'color', 'size'],
  img: ['opacity'],
  board: ['color']
};
const STYLE_NAMES = { frame: 'frame', conn: 'conector', stroke: 'trazo', text: 'texto', sticky: 'nota adhesiva', img: 'imagen', board: 'tablero' };
const STYLE_NEW_NAMES = { frame: 'Los frames nuevos', conn: 'Los conectores nuevos', text: 'Los textos nuevos', sticky: 'Las notas adhesivas nuevas', img: 'Las imágenes nuevas' };
// Tipos que comparten el sentido de "tamaño": grosor de línea o tamaño de letra
const STYLE_SIZE_GROUPS = [['conn', 'stroke'], ['text', 'sticky']];
// Tipos que pueden quedar como estilo principal (se usan al crear)
const DEFAULT_STYLE_TYPES = ['frame', 'conn', 'text', 'sticky', 'img'];

let copiedStyle = null; // { type, props }

// Objeto del lienzo y su tipo de estilo a partir de su clave ("frame:id", "text:id"…)
function styleTargetByKey(key) {
  const [kind, id] = String(key).split(':');
  const find = (list) => (list || []).find(o => o.id === id) || null;
  let obj = null;
  if (kind === 'frame') obj = find(getFrames());
  else if (kind === 'conn') obj = find(getConnectors());
  else if (kind === 'stroke') obj = find(getDrawings());
  else if (kind === 'text') obj = find(getTexts());
  else if (kind === 'img') obj = find(getBgImages());
  else if (kind === 'board') obj = find(boards);
  if (!obj) return null;
  const type = kind === 'text' && obj.sticky ? 'sticky' : kind;
  return { type, obj };
}

function readStyle(type, obj) {
  const props = {};
  STYLE_KEYS[type].forEach(k => { if (obj[k] !== undefined && obj[k] !== null) props[k] = deepClone(obj[k]); });
  if (type === 'frame') {
    const h = frameHides(obj);
    props.hideTitle = h.title;
    props.hideTab = h.tab;
  }
  return props;
}

// Lo que se aplica de un estilo a un objeto de cierto tipo
function styleForType(style, type) {
  if (style.type === type) return deepClone(style.props);
  const out = {};
  const p = style.props;
  const has = (t, k) => STYLE_KEYS[t].includes(k);
  // Color principal: el papel en una nota adhesiva, el color en los demás
  const mainColor = style.type === 'sticky' ? p.sticky : p.color;
  const sameGroup = STYLE_SIZE_GROUPS.some(g => g.includes(style.type) && g.includes(type));
  if (sameGroup && style.type !== type && ['text', 'sticky'].includes(type)) {
    // Texto ↔ nota: color de letra y tamaño
    if (p.color) out.color = p.color;
  } else if (mainColor) {
    if (type === 'sticky') out.sticky = mainColor;
    else if (has(type, 'color')) out.color = mainColor;
  }
  if (p.opacity !== undefined && has(type, 'opacity')) out.opacity = p.opacity;
  if (sameGroup && p.size !== undefined) out.size = p.size;
  return out;
}

function rerenderAfterStyle() {
  renderBoard();
  renderDrawings();
  renderBgImages();
  renderTexts(); // también redibuja frames y conectores
  updateContextBar();
}

function copyStyle() {
  const key = [...selection][0];
  const target = key && styleTargetByKey(key);
  if (!target) { showToast('Selecciona un objeto para copiar su estilo', 'info'); return; }
  copiedStyle = { type: target.type, props: readStyle(target.type, target.obj) };
  showToast(`Estilo de ${STYLE_NAMES[target.type]} copiado. Selecciona otros objetos y usa "Pegar estilo".`, 'success');
}

function pasteStyle() {
  if (!copiedStyle) { showToast('Primero copia el estilo de un objeto', 'info'); return; }
  let changed = 0, skipped = 0;
  [...selection].forEach(key => {
    const target = styleTargetByKey(key);
    if (!target) return;
    const props = styleForType(copiedStyle, target.type);
    if (!Object.keys(props).length) { skipped++; return; }
    if (target.type === 'frame') delete target.obj.hideLabels;
    if (target.type === 'conn') props.styledAt = Date.now();
    Object.assign(target.obj, props);
    changed++;
  });
  if (!changed) { showToast(`Ese estilo de ${STYLE_NAMES[copiedStyle.type]} no tiene nada en común con lo seleccionado`, 'info'); return; }
  persist();
  rerenderAfterStyle();
  showToast(skipped ? `Estilo pegado en ${changed} objeto(s); ${skipped} no tenían nada en común` : 'Estilo pegado', 'success');
}

// ----- Estilo principal -----
function defaultStyleFor(type) {
  const styles = appSettings.defaultStyles || {};
  return styles[type] ? deepClone(styles[type]) : {};
}

// Tipo del estilo principal posible para lo seleccionado (todos del mismo tipo) o null
function selectionStyleType() {
  const types = new Set([...selection].map(k => (styleTargetByKey(k) || {}).type));
  if (types.size !== 1) return null;
  const type = [...types][0];
  return DEFAULT_STYLE_TYPES.includes(type) ? type : null;
}

function setAsDefaultStyle() {
  const type = selectionStyleType();
  if (!type) { showToast('Selecciona un frame, conector, texto, nota o imagen', 'info'); return; }
  const target = styleTargetByKey([...selection][0]);
  const props = readStyle(type, target.obj);
  appSettings.defaultStyles = { ...(appSettings.defaultStyles || {}), [type]: props };
  saveData(SETTINGS_KEY, appSettings);
  showToast(`Estilo principal guardado: ${STYLE_NEW_NAMES[type].toLowerCase()} usarán este estilo (en este dispositivo)`, 'success');
  updateContextBar();
}

function resetDefaultStyle() {
  const type = selectionStyleType();
  if (!type || !(appSettings.defaultStyles || {})[type]) return;
  delete appSettings.defaultStyles[type];
  saveData(SETTINGS_KEY, appSettings);
  showToast(`${STYLE_NEW_NAMES[type]} vuelven a usar el estilo de siempre`, 'info');
  updateContextBar();
}

// ----- Botones de la barra contextual y del menú del botón derecho -----
const ctxDefaultStyleBtn = document.getElementById('ctxDefaultStyle');
const ctxCopyStyleBtn = document.getElementById('ctxCopyStyle');
const ctxPasteStyleBtn = document.getElementById('ctxPasteStyle');

function syncStyleButtons() {
  const type = selectionStyleType();
  ctxDefaultStyleBtn.hidden = !type;
  const isDefault = type && (appSettings.defaultStyles || {})[type];
  ctxDefaultStyleBtn.classList.toggle('is-active', !!isDefault);
  ctxDefaultStyleBtn.title = isDefault
    ? 'Ya hay un estilo principal para este tipo. Clic: usar este en su lugar · Clic derecho: volver al de siempre'
    : 'Usar este estilo para los objetos nuevos de este tipo';
  ctxCopyStyleBtn.hidden = selection.size !== 1 || !styleTargetByKey([...selection][0]);
  ctxPasteStyleBtn.hidden = !copiedStyle || !selection.size;
}

ctxDefaultStyleBtn.addEventListener('click', setAsDefaultStyle);
ctxDefaultStyleBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); resetDefaultStyle(); });
ctxCopyStyleBtn.addEventListener('click', () => { copyStyle(); syncStyleButtons(); });
ctxPasteStyleBtn.addEventListener('click', pasteStyle);

const baseUpdateContextBar = updateContextBar;
updateContextBar = function () {
  baseUpdateContextBar.apply(this, arguments);
  syncStyleButtons();
};

// Menú del botón derecho: se ajusta al abrirse
const baseOpenCanvasMenu = openCanvasMenu;
openCanvasMenu = function () {
  baseOpenCanvasMenu.apply(this, arguments);
  const single = selection.size === 1 && !!styleTargetByKey([...selection][0]);
  canvasMenu.querySelector('[data-cmd="copyStyle"]').disabled = !single;
  canvasMenu.querySelector('[data-cmd="pasteStyle"]').disabled = !copiedStyle || !selection.size;
  canvasMenu.querySelector('[data-cmd="defaultStyle"]').hidden = !selectionStyleType();
};
// Atajos: Ctrl+Alt+C copia el estilo y Ctrl+Alt+V lo pega
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || editingTextId) return;
  const k = e.key.toLowerCase();
  if (k === 'c' && selection.size === 1) { e.preventDefault(); copyStyle(); syncStyleButtons(); }
  if (k === 'v' && selection.size) { e.preventDefault(); pasteStyle(); }
});

canvasMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cmd]');
  if (!btn || btn.disabled) return;
  if (btn.dataset.cmd === 'copyStyle') copyStyle();
  if (btn.dataset.cmd === 'pasteStyle') pasteStyle();
  if (btn.dataset.cmd === 'defaultStyle') setAsDefaultStyle();
});
