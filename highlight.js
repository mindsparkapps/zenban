// ===== ZenBan - Destacador =====
// Un destacado es un rectángulo de color que se dibuja sobre un objeto del lienzo (herramienta Destacador,
// atajo M): imágenes, textos y notas (con sus links), tableros y frames. Vive dentro del objeto: se mueve y se
// agranda con él. Al tocarlo se puede mover (mano), cambiar su tamaño desde las esquinas (cruz), cambiar su
// color y su transparencia, o eliminarlo.
// Datos: objeto.marks = [{ id, x, y, w, h, color, opacity }]  (x, y, w, h: fracciones de 0 a 1 del objeto)
// Las imágenes dibujan sus destacados dentro de su propio elemento; los demás objetos los dibujan en una capa
// aparte (markLayer) que sigue al objeto en cada cuadro.

const HIGHLIGHT_PREFS_KEY = 'zenban_highlight_prefs_v1';
const HIGHLIGHT_COLORS = ['#facc15', '#4ade80', '#38bdf8', '#f472b6', '#fb923c', '#a78bfa'];
const HIGHLIGHT_MIN = 0.02; // tamaño mínimo (fracción del objeto)
let highlightPrefs = { color: HIGHLIGHT_COLORS[0], opacity: 0.4, ...loadData(HIGHLIGHT_PREFS_KEY, {}) };
let selectedMark = null; // { key, markId }  (key: "img:id", "text:id", "board:id" o "frame:id")

const highlightOptions = document.getElementById('highlightOptions');
const highlightColorsEl = document.getElementById('highlightColors');
const highlightCustomColor = document.getElementById('highlightCustomColor');
const highlightOpacity = document.getElementById('highlightOpacity');
const highlightOpacityLabel = document.getElementById('highlightOpacityLabel');

const markLayer = document.createElement('div');
markLayer.className = 'mark-layer';
zoomCanvas.appendChild(markLayer);

function markRgba(hex, alpha) {
  const n = parseInt(String(hex || HIGHLIGHT_COLORS[0]).slice(1), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const markClamp = (v, min, max) => Math.min(max, Math.max(min, v));

function bgImageData(id) {
  return getBgImages().find(i => i.id === id) || null;
}

function bgImageElById(id) {
  return bgImageLayer.querySelector(`.bg-image[data-image-id="${id}"]`);
}

// Objeto dueño de los destacados y su rectángulo en el lienzo
function markOwnerData(key) {
  const [type, id] = String(key).split(':');
  if (type === 'img') return bgImageData(id);
  if (type === 'text') return getTexts().find(x => x.id === id) || null;
  if (type === 'board') return boards.find(x => x.id === id) || null;
  if (type === 'frame') return getFrames().find(x => x.id === id) || null;
  return null;
}

function markOwnerRect(key) {
  if (String(key).startsWith('img:')) {
    const i = markOwnerData(key);
    return i ? { x: i.x, y: i.y, w: i.w, h: i.h } : null;
  }
  return objectRectByKey(key);
}

function isMarkSelected(key, markId) {
  return !!selectedMark && selectedMark.key === key && selectedMark.markId === markId;
}

// ----- Dibujar los destacados -----
// Imagen: en porcentajes dentro de su elemento. Demás objetos: en píxeles del lienzo sobre el objeto.
function styleMarkEl(mk, m) {
  const key = mk.dataset.ownerKey;
  if (mk.dataset.overlay) {
    const r = markOwnerRect(key);
    if (!r || !r.w || !r.h) { mk.style.display = 'none'; return; }
    mk.style.display = '';
    mk.style.left = `${r.x + m.x * r.w}px`;
    mk.style.top = `${r.y + m.y * r.h}px`;
    mk.style.width = `${m.w * r.w}px`;
    mk.style.height = `${m.h * r.h}px`;
  } else {
    mk.style.left = `${m.x * 100}%`;
    mk.style.top = `${m.y * 100}%`;
    mk.style.width = `${m.w * 100}%`;
    mk.style.height = `${m.h * 100}%`;
  }
  mk.style.background = markRgba(m.color, m.opacity ?? highlightPrefs.opacity);
}

function createMarkEl(key, m, overlay) {
  const mk = document.createElement('div');
  mk.className = 'img-mark';
  mk.dataset.markId = m.id;
  mk.dataset.ownerKey = key;
  if (overlay) mk.dataset.overlay = '1';
  styleMarkEl(mk, m);
  mk.classList.toggle('is-selected', isMarkSelected(key, m.id));
  mk.innerHTML = `
    <div class="img-mark-toolbar">
      <input type="color" class="img-mark-color" title="Color del destacado">
      <input type="range" class="img-mark-opacity" min="5" max="100" step="5" title="Transparencia: a la izquierda se ve más transparente">
      <span class="img-mark-pct"></span>
      <button type="button" class="img-mark-delete" title="Eliminar destacado (Supr)" aria-label="Eliminar destacado">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
      </button>
    </div>
    <div class="img-mark-handle" data-corner="se" title="Arrastra para cambiar el tamaño"></div>
    <div class="img-mark-handle" data-corner="sw" title="Arrastra para cambiar el tamaño"></div>
    <div class="img-mark-handle" data-corner="ne" title="Arrastra para cambiar el tamaño"></div>
    <div class="img-mark-handle" data-corner="nw" title="Arrastra para cambiar el tamaño"></div>`;

  const toolbar = mk.querySelector('.img-mark-toolbar');
  const color = mk.querySelector('.img-mark-color');
  const opacity = mk.querySelector('.img-mark-opacity');
  const pct = mk.querySelector('.img-mark-pct');
  const sync = () => {
    color.value = m.color;
    opacity.value = Math.round((m.opacity ?? highlightPrefs.opacity) * 100);
    pct.textContent = `${opacity.value}%`;
  };
  sync();
  toolbar.addEventListener('pointerdown', (e) => e.stopPropagation());
  color.addEventListener('input', () => { m.color = color.value; styleMarkEl(mk, m); });
  opacity.addEventListener('input', () => { m.opacity = opacity.value / 100; pct.textContent = `${opacity.value}%`; styleMarkEl(mk, m); });
  [color, opacity].forEach(inp => inp.addEventListener('change', () => persist()));
  mk.querySelector('.img-mark-delete').addEventListener('click', (e) => { e.stopPropagation(); deleteMark(key, m.id); });

  mk.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isSpacePressed || isPanModeActive) return;
    if (currentTool !== 'select' && currentTool !== 'highlight') return;
    const handle = e.target.closest('.img-mark-handle');
    const resize = !!handle;
    // Con Seleccionar, un destacado sin elegir deja arrastrar el objeto (ver el pointerdown de document)
    if (!resize && !isMarkSelected(key, m.id) && currentTool === 'select') return;
    e.preventDefault();
    e.stopPropagation();
    selectMark(key, m.id);
    startMarkDrag(e, key, m, mk, resize ? handle.dataset.corner : 'move');
  });
  return mk;
}

// Llamada desde renderBgImages (app.js) cada vez que se dibuja una imagen
function renderImageMarks(el, data) {
  el.querySelectorAll('.img-mark').forEach(n => n.remove());
  (data.marks || []).forEach(m => el.appendChild(createMarkEl(`img:${data.id}`, m, false)));
}

// ----- Capa de destacados de textos, tableros y frames: sigue al objeto en cada cuadro -----
function overlayMarkEntries() {
  const list = [];
  const add = (prefix, arr) => (arr || []).forEach(o => (o.marks || []).forEach(m => list.push({ key: `${prefix}:${o.id}`, m })));
  add('text', getTexts());
  add('board', boards);
  add('frame', getFrames());
  return list;
}

function syncOverlayMarks() {
  const entries = overlayMarkEntries();
  if (!entries.length && !markLayer.firstChild) return;
  const have = new Map();
  markLayer.querySelectorAll('.img-mark').forEach(el => have.set(`${el.dataset.ownerKey}|${el.dataset.markId}`, el));
  const wanted = new Set();
  entries.forEach(({ key, m }) => {
    const id = `${key}|${m.id}`;
    wanted.add(id);
    let el = have.get(id);
    if (el && el._m !== m) { el.remove(); el = null; }
    if (!el) {
      el = createMarkEl(key, m, true);
      el._m = m;
      markLayer.appendChild(el);
    } else if (!el.classList.contains('is-dragging')) {
      styleMarkEl(el, m);
    }
  });
  have.forEach((el, id) => { if (!wanted.has(id)) el.remove(); });
}

(function markLoop() {
  try { syncOverlayMarks(); } catch (e) {}
  requestAnimationFrame(markLoop);
})();

function ownerMarkEls(key) {
  return key.startsWith('img:')
    ? (bgImageElById(key.slice(4)) ? [...bgImageElById(key.slice(4)).querySelectorAll('.img-mark')] : [])
    : [...markLayer.querySelectorAll('.img-mark')].filter(el => el.dataset.ownerKey === key);
}

function refreshOwnerMarks(key) {
  if (key.startsWith('img:')) {
    const el = bgImageElById(key.slice(4)), data = markOwnerData(key);
    if (el && data) renderImageMarks(el, data);
  } else {
    syncOverlayMarks();
  }
}

// ----- Mover y cambiar el tamaño -----
function startMarkDrag(e, key, m, mk, mode) {
  const sx = e.clientX, sy = e.clientY;
  const o = { x: m.x, y: m.y, w: m.w, h: m.h };
  const rect = markOwnerRect(key);
  if (!rect) return;
  mk.setPointerCapture(e.pointerId);
  if (mode === 'move') mk.classList.add('is-dragging');
  const onMove = (ev) => {
    const dx = (ev.clientX - sx) / zoom / rect.w;
    const dy = (ev.clientY - sy) / zoom / rect.h;
    if (mode !== 'move') {
      // Cada esquina mueve sus dos lados; el lado opuesto se queda fijo
      if (mode.includes('e')) m.w = markClamp(o.w + dx, HIGHLIGHT_MIN, 1 - o.x);
      else { m.x = markClamp(o.x + dx, 0, o.x + o.w - HIGHLIGHT_MIN); m.w = o.x + o.w - m.x; }
      if (mode.includes('s')) m.h = markClamp(o.h + dy, HIGHLIGHT_MIN, 1 - o.y);
      else { m.y = markClamp(o.y + dy, 0, o.y + o.h - HIGHLIGHT_MIN); m.h = o.y + o.h - m.y; }
    } else {
      m.x = markClamp(o.x + dx, 0, 1 - o.w);
      m.y = markClamp(o.y + dy, 0, 1 - o.h);
    }
    styleMarkEl(mk, m);
  };
  const onUp = () => {
    mk.classList.remove('is-dragging');
    mk.removeEventListener('pointermove', onMove);
    mk.removeEventListener('pointerup', onUp);
    mk.removeEventListener('pointercancel', onUp);
    persist();
  };
  mk.addEventListener('pointermove', onMove);
  mk.addEventListener('pointerup', onUp);
  mk.addEventListener('pointercancel', onUp);
}

// ----- Selección y eliminación -----
function applyMarkSelection() {
  document.querySelectorAll('.img-mark').forEach(mk => {
    mk.classList.toggle('is-selected', isMarkSelected(mk.dataset.ownerKey, mk.dataset.markId));
  });
}

function selectMark(key, markId) {
  selectedMark = { key, markId };
  applyMarkSelection();
}

function clearSelectedMark() {
  if (!selectedMark) return;
  selectedMark = null;
  applyMarkSelection();
}

function deleteMark(key, markId) {
  const data = markOwnerData(key);
  if (!data) return;
  data.marks = (data.marks || []).filter(m => m.id !== markId);
  if (!data.marks.length) delete data.marks;
  if (selectedMark && selectedMark.markId === markId) selectedMark = null;
  persist();
  refreshOwnerMarks(key);
  showToast('Destacado eliminado', 'info');
}

// Destacado de un texto, tablero o frame bajo el puntero aunque la capa deje pasar los toques (el más nuevo)
function overlayMarkAtPoint(x, y) {
  const els = [...markLayer.querySelectorAll('.img-mark')].reverse();
  return els.find(el => {
    const r = el.getBoundingClientRect();
    return r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) || null;
}

// Tocar fuera del destacado elegido lo suelta. Con Seleccionar, un toque simple sobre un destacado sin
// elegir lo elige (arrastrar mueve el objeto, como siempre): se escucha en document para ir antes que la
// selección del lienzo (app.js), que se queda con ese toque.
document.addEventListener('pointerdown', (e) => {
  let mk = e.target.closest('.img-mark');
  if (!mk && currentTool === 'select' && e.button === 0 && !e.target.closest('.toolbox, .zoom-hud, .context-bar, .mobile-fab, button, input, select, textarea')) {
    mk = overlayMarkAtPoint(e.clientX, e.clientY);
  }
  if (!mk) { clearSelectedMark(); return; }
  if (currentTool !== 'select' || e.button !== 0 || mk.classList.contains('is-selected')) return;
  const key = mk.dataset.ownerKey, markId = mk.dataset.markId;
  const sx = e.clientX, sy = e.clientY;
  const up = (ev) => {
    document.removeEventListener('pointerup', up, true);
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) selectMark(key, markId);
  };
  document.addEventListener('pointerup', up, true);
}, true);

window.addEventListener('keydown', (e) => {
  if (!selectedMark || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    e.stopPropagation();
    deleteMark(selectedMark.key, selectedMark.markId);
  } else if (e.key === 'Escape') {
    clearSelectedMark();
  }
}, true);

// ----- Herramienta Destacador: arrastrar sobre un objeto dibuja el rectángulo -----
// Objeto bajo el puntero: imagen, texto o nota, tablero o frame (el que esté más arriba)
function markTargetAt(clientX, clientY) {
  for (const n of document.elementsFromPoint(clientX, clientY)) {
    if (!(n instanceof Element) || n.closest('.img-mark, .mark-layer')) continue;
    const text = n.closest('.canvas-text');
    const img = n.closest('.bg-image');
    const board = n.closest('.board-frame');
    const frame = n.closest('.canvas-frame');
    const found = text ? [`text:${text.dataset.textId}`, text]
      : img ? [`img:${img.dataset.imageId}`, img]
      : board ? [`board:${board.dataset.boardId}`, board]
      : frame ? [`frame:${frame.dataset.frameId}`, frame] : null;
    if (found && markOwnerData(found[0])) return { key: found[0], el: found[1] };
  }
  return null;
}

let highlightGesture = null;
let highlightHintShown = false;

viewportArea.addEventListener('pointerdown', (e) => {
  if (currentTool !== 'highlight' || isSpacePressed || e.button !== 0) return;
  if (e.target.closest('.toolbox, .zoom-hud, .mobile-fab, .context-bar, .img-mark')) return;
  // Un segundo dedo cancela el destacado para permitir el zoom con pellizco
  if (highlightGesture && e.pointerId !== highlightGesture.pointerId) {
    highlightGesture.preview.remove();
    highlightGesture = null;
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const target = markTargetAt(e.clientX, e.clientY);
  const data = target && markOwnerData(target.key);
  if (!data) {
    if (!highlightHintShown) { highlightHintShown = true; showToast('Arrastra sobre un objeto (imagen, texto, tablero, frame) para destacar una parte', 'info'); }
    return;
  }
  clearSelectedMark();
  if (selection.size) setSelection([]);
  const key = target.key;
  const rect = target.el.getBoundingClientRect(); // en pantalla: sirve también con tableros escalados
  const fx = (cx) => markClamp((cx - rect.left) / rect.width, 0, 1);
  const fy = (cy) => markClamp((cy - rect.top) / rect.height, 0, 1);
  const preview = document.createElement('div');
  preview.className = 'img-mark';
  preview.dataset.ownerKey = key;
  preview.dataset.overlay = '1';
  preview.style.pointerEvents = 'none';
  markLayer.appendChild(preview);
  highlightGesture = { pointerId: e.pointerId, preview, x0: fx(e.clientX), y0: fy(e.clientY), box: null };
  viewportArea.setPointerCapture(e.pointerId);
  const g = highlightGesture;
  const boxAt = (ev) => {
    const x1 = fx(ev.clientX), y1 = fy(ev.clientY);
    return { x: Math.min(g.x0, x1), y: Math.min(g.y0, y1), w: Math.abs(x1 - g.x0), h: Math.abs(y1 - g.y0) };
  };
  const onMove = (ev) => {
    if (ev.pointerId !== g.pointerId) return;
    g.box = boxAt(ev);
    styleMarkEl(preview, { ...g.box, color: highlightPrefs.color, opacity: highlightPrefs.opacity });
  };
  const onUp = (ev) => {
    if (ev.pointerId !== g.pointerId) return;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
    highlightGesture = null;
    preview.remove();
    const b = g.box;
    // Un toque sin arrastrar (menos de 6 px) no crea nada
    if (!b || b.w * rect.width < 6 || b.h * rect.height < 6) return;
    const m = { id: generateId('mark'), ...b, color: highlightPrefs.color, opacity: highlightPrefs.opacity };
    data.marks = [...(data.marks || []), m];
    persist();
    refreshOwnerMarks(key);
    selectMark(key, m.id);
  };
  viewportArea.addEventListener('pointermove', onMove);
  viewportArea.addEventListener('pointerup', onUp);
  viewportArea.addEventListener('pointercancel', onUp);
}, true);

// ----- Opciones de la herramienta (color y transparencia de los destacados nuevos) -----
function renderHighlightOptions() {
  highlightColorsEl.innerHTML = '';
  HIGHLIGHT_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pen-color ${highlightPrefs.color.toLowerCase() === color ? 'active' : ''}`;
    btn.style.backgroundColor = color;
    btn.title = color;
    btn.addEventListener('click', () => {
      highlightPrefs.color = color;
      saveData(HIGHLIGHT_PREFS_KEY, highlightPrefs);
      renderHighlightOptions();
    });
    highlightColorsEl.appendChild(btn);
  });
  highlightCustomColor.value = highlightPrefs.color;
  highlightCustomColor.classList.toggle('active', !HIGHLIGHT_COLORS.includes(highlightPrefs.color.toLowerCase()));
  highlightOpacity.value = Math.round(highlightPrefs.opacity * 100);
  highlightOpacityLabel.textContent = `${highlightOpacity.value}%`;
}

highlightCustomColor.addEventListener('input', () => {
  highlightPrefs.color = highlightCustomColor.value;
  saveData(HIGHLIGHT_PREFS_KEY, highlightPrefs);
  renderHighlightOptions();
});
highlightOpacity.addEventListener('input', () => {
  highlightPrefs.opacity = highlightOpacity.value / 100;
  highlightOpacityLabel.textContent = `${highlightOpacity.value}%`;
  saveData(HIGHLIGHT_PREFS_KEY, highlightPrefs);
});

// Llamada desde setTool (app.js)
function onHighlightTool(tool) {
  highlightOptions.hidden = tool !== 'highlight';
  viewportArea.classList.toggle('tool-highlight', tool === 'highlight');
  if (tool !== 'highlight' && tool !== 'select') clearSelectedMark();
}

renderHighlightOptions();
// Las imágenes se dibujaron antes de cargar este archivo: se redibujan con sus destacados
try { if (getBgImages().some(i => i.marks && i.marks.length)) renderBgImages(); } catch (e) {}
