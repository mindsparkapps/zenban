// ===== ZenBan - Destacador de imágenes =====
// Un destacado es un rectángulo de color que se dibuja sobre una imagen del lienzo (herramienta Destacador,
// atajo M). Vive dentro de la imagen: se mueve y se agranda con ella. Al tocarlo se puede mover, cambiar su
// tamaño con la manija de la esquina, cambiar su color y su transparencia, o eliminarlo.
// Datos: imagen.marks = [{ id, x, y, w, h, color, opacity }]  (x, y, w, h: fracciones de 0 a 1 de la imagen)

const HIGHLIGHT_PREFS_KEY = 'zenban_highlight_prefs_v1';
const HIGHLIGHT_COLORS = ['#facc15', '#4ade80', '#38bdf8', '#f472b6', '#fb923c', '#a78bfa'];
const HIGHLIGHT_MIN = 0.02; // tamaño mínimo (fracción de la imagen)
let highlightPrefs = { color: HIGHLIGHT_COLORS[0], opacity: 0.4, ...loadData(HIGHLIGHT_PREFS_KEY, {}) };
let selectedMark = null; // { imgId, markId }

const highlightOptions = document.getElementById('highlightOptions');
const highlightColorsEl = document.getElementById('highlightColors');
const highlightCustomColor = document.getElementById('highlightCustomColor');
const highlightOpacity = document.getElementById('highlightOpacity');
const highlightOpacityLabel = document.getElementById('highlightOpacityLabel');

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

function isMarkSelected(imgId, markId) {
  return !!selectedMark && selectedMark.imgId === imgId && selectedMark.markId === markId;
}

// ----- Dibujar los destacados de una imagen -----
function styleMarkEl(mk, m) {
  mk.style.left = `${m.x * 100}%`;
  mk.style.top = `${m.y * 100}%`;
  mk.style.width = `${m.w * 100}%`;
  mk.style.height = `${m.h * 100}%`;
  mk.style.background = markRgba(m.color, m.opacity ?? highlightPrefs.opacity);
}

function createMarkEl(img, m) {
  const mk = document.createElement('div');
  mk.className = 'img-mark';
  mk.dataset.markId = m.id;
  styleMarkEl(mk, m);
  mk.classList.toggle('is-selected', isMarkSelected(img.id, m.id));
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
  mk.querySelector('.img-mark-delete').addEventListener('click', (e) => { e.stopPropagation(); deleteMark(img.id, m.id); });

  mk.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isSpacePressed || isPanModeActive) return;
    if (currentTool !== 'select' && currentTool !== 'highlight') return;
    const handle = e.target.closest('.img-mark-handle');
    const resize = !!handle;
    // Con Seleccionar, un destacado sin elegir deja arrastrar la imagen (ver el pointerdown de document)
    if (!resize && !isMarkSelected(img.id, m.id) && currentTool === 'select') return;
    e.preventDefault();
    e.stopPropagation();
    selectMark(img.id, m.id);
    startMarkDrag(e, img, m, mk, resize ? handle.dataset.corner : 'move');
  });
  return mk;
}

// Llamada desde renderBgImages (app.js) cada vez que se dibuja una imagen
function renderImageMarks(el, data) {
  el.querySelectorAll('.img-mark').forEach(n => n.remove());
  (data.marks || []).forEach(m => el.appendChild(createMarkEl(data, m)));
}

// ----- Mover y cambiar el tamaño -----
function startMarkDrag(e, img, m, mk, mode) {
  const sx = e.clientX, sy = e.clientY;
  const o = { x: m.x, y: m.y, w: m.w, h: m.h };
  mk.setPointerCapture(e.pointerId);
  if (mode === 'move') mk.classList.add('is-dragging');
  const onMove = (ev) => {
    const dx = (ev.clientX - sx) / zoom / img.w;
    const dy = (ev.clientY - sy) / zoom / img.h;
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
  bgImageLayer.querySelectorAll('.img-mark').forEach(mk => {
    const imgEl = mk.closest('.bg-image');
    mk.classList.toggle('is-selected', !!imgEl && isMarkSelected(imgEl.dataset.imageId, mk.dataset.markId));
  });
}

function selectMark(imgId, markId) {
  selectedMark = { imgId, markId };
  applyMarkSelection();
}

function clearSelectedMark() {
  if (!selectedMark) return;
  selectedMark = null;
  applyMarkSelection();
}

function deleteMark(imgId, markId) {
  const img = bgImageData(imgId);
  if (!img) return;
  img.marks = (img.marks || []).filter(m => m.id !== markId);
  if (!img.marks.length) delete img.marks;
  if (selectedMark && selectedMark.markId === markId) selectedMark = null;
  persist();
  const el = bgImageElById(imgId);
  if (el) renderImageMarks(el, img);
  showToast('Destacado eliminado', 'info');
}

// Tocar fuera del destacado elegido lo suelta. Con Seleccionar, un toque simple sobre un destacado sin
// elegir lo elige (arrastrar mueve la imagen, como siempre): se escucha en document para ir antes que la
// selección del lienzo (app.js), que se queda con ese toque.
document.addEventListener('pointerdown', (e) => {
  const mk = e.target.closest('.img-mark');
  if (!mk) { clearSelectedMark(); return; }
  const imgEl = mk.closest('.bg-image');
  if (!imgEl || currentTool !== 'select' || e.button !== 0 || mk.classList.contains('is-selected')) return;
  const imgId = imgEl.dataset.imageId, markId = mk.dataset.markId;
  const sx = e.clientX, sy = e.clientY;
  const up = (ev) => {
    document.removeEventListener('pointerup', up, true);
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) selectMark(imgId, markId);
  };
  document.addEventListener('pointerup', up, true);
}, true);

window.addEventListener('keydown', (e) => {
  if (!selectedMark || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    e.stopPropagation();
    deleteMark(selectedMark.imgId, selectedMark.markId);
  } else if (e.key === 'Escape') {
    clearSelectedMark();
  }
}, true);

// ----- Herramienta Destacador: arrastrar sobre una imagen dibuja el rectángulo -----
function imageElUnder(clientX, clientY) {
  for (const n of document.elementsFromPoint(clientX, clientY)) {
    if (n instanceof Element && n.classList.contains('bg-image')) return n;
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
  const imgEl = imageElUnder(e.clientX, e.clientY);
  const img = imgEl && bgImageData(imgEl.dataset.imageId);
  if (!img) {
    if (!highlightHintShown) { highlightHintShown = true; showToast('Arrastra sobre una imagen para destacar una parte', 'info'); }
    return;
  }
  clearSelectedMark();
  if (selection.size) setSelection([]);
  const rect = imgEl.getBoundingClientRect();
  const fx = (cx) => markClamp((cx - rect.left) / rect.width, 0, 1);
  const fy = (cy) => markClamp((cy - rect.top) / rect.height, 0, 1);
  const preview = document.createElement('div');
  preview.className = 'img-mark';
  imgEl.appendChild(preview);
  highlightGesture = { pointerId: e.pointerId, img, imgEl, rect, preview, x0: fx(e.clientX), y0: fy(e.clientY), box: null };
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
    img.marks = [...(img.marks || []), m];
    persist();
    renderImageMarks(imgEl, img);
    selectMark(img.id, m.id);
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
