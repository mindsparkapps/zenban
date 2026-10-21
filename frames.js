// ===== ZenBan - Frames y conectores (diagramas) =====
// Un frame es un marco en el lienzo: se agranda por la esquina, se le redondean las esquinas, tiene color,
// relleno, título y una pestaña con imagen (como los tableros) para reconocerlo y moverlo. Al moverlo se
// lleva lo que tiene dentro (textos, notas, imágenes, dibujos y otros frames).
// Con "Trabajar dentro" (locked) el frame no toma los clics y se puede trabajar con lo de adentro.
// Un conector es una flecha que une dos objetos (frames, tableros, imágenes, textos o notas) y los sigue.
// Datos: project.frames = [{ id, x, y, w, h, color, fill, radius, title, image, group, opacity, locked }]
//        project.connectors = [{ id, from, to, color, size, both, opacity, group }]  (from/to: "tipo:id")

const frameLayer = document.getElementById('frameLayer');
const connectorLayer = document.getElementById('connectorLayer');
const FRAME_DEFAULT_COLOR = '#6366f1';

function getFrames() {
  const p = getActiveProject();
  if (!Array.isArray(p.frames)) p.frames = [];
  return p.frames;
}

function getConnectors() {
  const p = getActiveProject();
  if (!Array.isArray(p.connectors)) p.connectors = [];
  return p.connectors;
}

function getFrameEl(id) {
  return frameLayer.querySelector(`.canvas-frame[data-frame-id="${id}"]`);
}

function selectedFrames() {
  return getFrames().filter(f => selection.has(`frame:${f.id}`));
}

function selectedConnectors() {
  return getConnectors().filter(c => selection.has(`conn:${c.id}`));
}

function hexToRgba(hex, alpha) {
  const n = parseInt(String(hex || FRAME_DEFAULT_COLOR).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ----- Crear -----
function addFrame(at = null) {
  if (!at) {
    const rect = viewportArea.getBoundingClientRect();
    at = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  const w = Math.round(420 / zoom);
  const h = Math.round(280 / zoom);
  const f = {
    id: generateId('frame'),
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w, h,
    color: FRAME_DEFAULT_COLOR,
    fill: 10,
    radius: Math.round(16 / zoom),
    title: ''
  };
  getFrames().push(f);
  persist();
  renderFrames();
  setSelection([`frame:${f.id}`]);
  setTimeout(() => { const input = document.getElementById('ctxFrameTitle'); if (input && !window.matchMedia('(pointer: coarse)').matches) input.focus(); }, 50);
  showToast('Frame agregado. Agrándalo por la esquina y únelo a otros con la herramienta Conector.', 'success');
  return f;
}

// ----- Dibujar -----
function applyFrameStyle(el, f) {
  el.style.left = `${f.x}px`;
  el.style.top = `${f.y}px`;
  el.style.width = `${f.w}px`;
  el.style.height = `${f.h}px`;
  el.style.borderRadius = `${Math.max(0, f.radius || 0)}px`;
  el.style.setProperty('--frame-color', f.color || FRAME_DEFAULT_COLOR);
  el.style.background = hexToRgba(f.color, (f.fill ?? 10) / 100);
  // Opacidad del frame completo (borde, relleno, título y pestaña); lo de adentro no cambia
  el.style.opacity = String(f.opacity ?? 1);
  // "Trabajar dentro": el frame no toma los clics (se puede seleccionar y mover lo de adentro)
  el.classList.toggle('is-locked', !!f.locked);
  // Ancho del frame: limita el tamaño de su pestaña de imagen al alejar la vista (como en los tableros)
  el.style.setProperty('--board-w', `${f.w}px`);
}

function renderFrames() {
  frameLayer.innerHTML = '';
  getFrames().forEach(f => {
    const el = document.createElement('div');
    el.className = 'canvas-frame';
    el.dataset.frameId = f.id;
    applyFrameStyle(el, f);
    el.innerHTML = `
      ${f.image ? `<div class="board-image-tab frame-image-tab" title="Arrastra para mover el frame"><img data-board-img="${escapeHtml(f.image)}" alt="" draggable="false"></div>` : ''}
      ${f.title ? `<div class="frame-title">${escapeHtml(f.title)}</div>` : ''}
      ${f.locked ? '<button type="button" class="frame-lock-badge" title="Volver a mover el frame">✋ Trabajando dentro · <b>Listo</b></button>' : ''}
      <div class="frame-handle" title="Arrastra para agrandar o achicar"></div>`;
    el.querySelector('.frame-handle').addEventListener('pointerdown', (e) => startFrameResize(e, f, el));
    const badge = el.querySelector('.frame-lock-badge');
    if (badge) {
      badge.addEventListener('pointerdown', (e) => e.stopPropagation());
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        f.locked = false;
        persist();
        renderFrames();
        setSelection([`frame:${f.id}`]);
      });
    }
    frameLayer.appendChild(el);
  });
  if (typeof hydrateBoardImages === 'function') hydrateBoardImages(frameLayer);
  renderConnectors();
  applyFrameSelection();
}

// Punto del borde del rectángulo en dirección al otro punto (para que la flecha empiece y termine en el borde)
function rectEdgePoint(r, toward) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function frameRect(id) {
  return getFrames().find(f => f.id === id) || null;
}

// ----- Extremos de los conectores: cualquier objeto del lienzo -----
// Se guardan como "tipo:id" (frame, board, img, text). Los conectores antiguos guardaban solo el id del frame.
function endpointKey(ref) {
  return String(ref || '').includes(':') ? String(ref) : `frame:${ref}`;
}

function objectRectByKey(key) {
  const [type, id] = endpointKey(key).split(':');
  if (type === 'frame') return frameRect(id);
  if (type === 'img') { const i = getBgImages().find(x => x.id === id); return i ? { x: i.x, y: i.y, w: i.w, h: i.h } : null; }
  if (type === 'text') {
    const t = getTexts().find(x => x.id === id);
    const el = t && getTextEl(t.id);
    return t ? { x: t.x, y: t.y, w: el ? el.offsetWidth : t.w, h: el ? el.offsetHeight : t.size * 1.3 } : null;
  }
  if (type === 'board') {
    const b = boards.find(x => x.id === id);
    const el = b && getBoardEl(b.id);
    return b ? { x: b.x, y: b.y, w: el ? el.offsetWidth : 600, h: el ? el.offsetHeight : 300 } : null;
  }
  return null;
}

// Objeto del lienzo bajo un punto de la pantalla (para empezar o terminar un conector)
function objectKeyAtPoint(clientX, clientY) {
  for (const n of document.elementsFromPoint(clientX, clientY)) {
    if (!(n instanceof Element)) continue;
    const text = n.closest('.canvas-text');
    if (text) return `text:${text.dataset.textId}`;
    const img = n.closest('.bg-image');
    if (img) return `img:${img.dataset.imageId}`;
    const board = n.closest('.board-frame');
    if (board) return `board:${board.dataset.boardId}`;
    const frame = n.closest('.canvas-frame');
    if (frame) return `frame:${frame.dataset.frameId}`;
  }
  return null;
}

function objectElByKey(key) {
  const [type, id] = endpointKey(key).split(':');
  if (type === 'frame') return getFrameEl(id);
  if (type === 'text') return getTextEl(id);
  if (type === 'img') return bgImageLayer.querySelector(`.bg-image[data-image-id="${id}"]`);
  if (type === 'board') return getBoardEl(id);
  return null;
}

function arrowHead(x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = size * 3.5 + 6;
  const spread = Math.PI / 7;
  const f = (n) => +n.toFixed(1);
  return `M ${f(x2 - head * Math.cos(angle - spread))} ${f(y2 - head * Math.sin(angle - spread))} L ${f(x2)} ${f(y2)} L ${f(x2 - head * Math.cos(angle + spread))} ${f(y2 - head * Math.sin(angle + spread))}`;
}

function connectorPath(c) {
  const a = objectRectByKey(c.from);
  const b = objectRectByKey(c.to);
  if (!a || !b) return null;
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p1 = rectEdgePoint(a, cb);
  const p2 = rectEdgePoint(b, ca);
  const size = c.size || 3;
  const f = (n) => +n.toFixed(1);
  let d = `M ${f(p1.x)} ${f(p1.y)} L ${f(p2.x)} ${f(p2.y)} ${arrowHead(p1.x, p1.y, p2.x, p2.y, size)}`;
  if (c.both) d += ` ${arrowHead(p2.x, p2.y, p1.x, p1.y, size)}`;
  return d;
}

function renderConnectors() {
  connectorLayer.innerHTML = '';
  getConnectors().forEach(c => {
    const d = connectorPath(c);
    if (!d) return;
    const g = document.createElementNS(SVG_NS, 'g');
    g.dataset.connId = c.id;
    g.classList.add('connector');
    // Zona ancha e invisible para poder tocar la flecha fácilmente
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'connector-hit');
    hit.setAttribute('stroke-width', Math.max(14, (c.size || 3) * 4));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'connector-line');
    path.setAttribute('stroke', c.color || '#94a3b8');
    path.setAttribute('stroke-width', c.size || 3);
    path.setAttribute('stroke-opacity', String(c.opacity ?? 1));
    g.appendChild(hit);
    g.appendChild(path);
    connectorLayer.appendChild(g);
  });
  applyFrameSelection();
}

function applyFrameSelection() {
  const solo = selection.size === 1;
  frameLayer.querySelectorAll('.canvas-frame').forEach(el => {
    const sel = selection.has(`frame:${el.dataset.frameId}`);
    el.classList.toggle('is-selected', sel);
    el.classList.toggle('is-solo', sel && solo);
  });
  connectorLayer.querySelectorAll('.connector').forEach(g => {
    g.classList.toggle('is-selected', selection.has(`conn:${g.dataset.connId}`));
  });
}

// ----- Agrandar por la esquina -----
function startFrameResize(e, f, el) {
  if (isPanModeActive || isSpacePressed || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  setSelection([`frame:${f.id}`]);
  const startX = e.clientX;
  const startY = e.clientY;
  const w0 = f.w;
  const h0 = f.h;
  el.setPointerCapture(e.pointerId);
  const onMove = (ev) => {
    f.w = Math.max(60, Math.round(w0 + (ev.clientX - startX) / zoom));
    f.h = Math.max(40, Math.round(h0 + (ev.clientY - startY) / zoom));
    applyFrameStyle(el, f);
    renderConnectors();
  };
  const onUp = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    persist();
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

// Lo que está completamente dentro de un frame (se mueve con él)
function objectsInsideFrame(f) {
  const inside = (x, y, w, h) => x >= f.x && y >= f.y && x + w <= f.x + f.w && y + h <= f.y + f.h;
  const keys = [];
  getTexts().forEach(t => {
    const el = getTextEl(t.id);
    if (el && inside(t.x, t.y, el.offsetWidth, el.offsetHeight)) keys.push(`text:${t.id}`);
  });
  getBgImages().forEach(i => { if (inside(i.x, i.y, i.w, i.h)) keys.push(`img:${i.id}`); });
  getDrawings().forEach(s => { if (s.points.length && s.points.every(([x, y]) => inside(x, y, 0, 0))) keys.push(`stroke:${s.id}`); });
  getFrames().forEach(o => { if (o.id !== f.id && inside(o.x, o.y, o.w, o.h)) keys.push(`frame:${o.id}`); });
  return keys;
}

// ----- Conector: arrastrar de un objeto a otro (frames, tableros, imágenes, textos y notas) -----
let connectorDraft = null;

function frameAtPoint(clientX, clientY) {
  const key = objectKeyAtPoint(clientX, clientY);
  return key && key.startsWith('frame:') ? frameRect(key.slice(6)) : null;
}

function clearConnectTargets() {
  document.querySelectorAll('.is-connect-target').forEach(x => x.classList.remove('is-connect-target'));
}

viewportArea.addEventListener('pointerdown', (e) => {
  if (currentTool !== 'connector' || e.button !== 0 || isSpacePressed) return;
  if (e.target.closest('.toolbox, .zoom-hud, .mobile-fab, button, input, select, textarea')) return;
  const from = objectKeyAtPoint(e.clientX, e.clientY);
  e.preventDefault();
  e.stopPropagation();
  if (!from) { showToast('Empieza el conector sobre un objeto (frame, tablero, imagen, texto o nota) y suéltalo sobre otro', 'info'); return; }
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('class', 'connector-draft');
  line.setAttribute('stroke-width', 3 / zoom);
  connectorLayer.appendChild(line);
  connectorDraft = { from, line, pointerId: e.pointerId };
  viewportArea.setPointerCapture(e.pointerId);
}, true);

viewportArea.addEventListener('pointermove', (e) => {
  if (!connectorDraft || e.pointerId !== connectorDraft.pointerId) return;
  const p = screenToCanvas(e.clientX, e.clientY);
  const a = objectRectByKey(connectorDraft.from);
  if (!a) return;
  const start = rectEdgePoint(a, p);
  const target = objectKeyAtPoint(e.clientX, e.clientY);
  clearConnectTargets();
  if (target && target !== connectorDraft.from) { const el = objectElByKey(target); if (el) el.classList.add('is-connect-target'); }
  connectorDraft.line.setAttribute('d', `M ${start.x} ${start.y} L ${p.x} ${p.y} ${arrowHead(start.x, start.y, p.x, p.y, 3 / zoom)}`);
});

function endConnectorDraft(e) {
  if (!connectorDraft || e.pointerId !== connectorDraft.pointerId) return;
  const { from, line } = connectorDraft;
  connectorDraft = null;
  line.remove();
  clearConnectTargets();
  const to = e.type === 'pointerup' ? objectKeyAtPoint(e.clientX, e.clientY) : null;
  if (!to || to === from) return;
  const exists = getConnectors().some(c => {
    const f = endpointKey(c.from), t = endpointKey(c.to);
    return (f === from && t === to) || (f === to && t === from);
  });
  if (exists) { showToast('Esos objetos ya están conectados', 'info'); return; }
  const c = { id: generateId('conn'), from, to, color: '#94a3b8', size: Math.max(1, +(3 / zoom).toFixed(1)), both: false, opacity: 1 };
  getConnectors().push(c);
  persist();
  renderConnectors();
  setSelection([`conn:${c.id}`]);
}
viewportArea.addEventListener('pointerup', endConnectorDraft);
viewportArea.addEventListener('pointercancel', endConnectorDraft);

// ----- Barra contextual -----
const ctxFrameTitle = document.getElementById('ctxFrameTitle');
const ctxFrameColor = document.getElementById('ctxFrameColor');
const ctxFrameFill = document.getElementById('ctxFrameFill');
const ctxFrameRadius = document.getElementById('ctxFrameRadius');
const ctxConnColor = document.getElementById('ctxConnColor');
const ctxConnSize = document.getElementById('ctxConnSize');
const ctxFrameOpacity = document.getElementById('ctxFrameOpacity');
const ctxConnOpacity = document.getElementById('ctxConnOpacity');

// Llena los controles con el frame o conector seleccionado (lo llama updateContextBar)
function syncFrameControls(ctx) {
  if (ctx.type === 'frame') {
    const f = selectedFrames()[0];
    if (!f) return;
    ctxTitle.textContent = ctx.count === 1 ? 'Frame' : `${ctx.count} frames`;
    ctxDot.style.background = f.color || FRAME_DEFAULT_COLOR;
    if (document.activeElement !== ctxFrameTitle) ctxFrameTitle.value = f.title || '';
    ctxFrameColor.value = f.color || FRAME_DEFAULT_COLOR;
    ctxFrameFill.value = String(f.fill ?? 10);
    ctxFrameRadius.max = String(Math.max(80, Math.round(Math.min(f.w, f.h) / 2)));
    ctxFrameRadius.value = String(f.radius || 0);
    ctxFrameOpacity.value = String(Math.round((f.opacity ?? 1) * 100));
    document.getElementById('ctxFrameImageRemove').hidden = !f.image;
  } else if (ctx.type === 'conn') {
    const c = selectedConnectors()[0];
    if (!c) return;
    ctxTitle.textContent = ctx.count === 1 ? 'Conector' : `${ctx.count} conectores`;
    ctxDot.style.background = c.color || '#94a3b8';
    ctxConnColor.value = c.color || '#94a3b8';
    ctxConnSize.value = String(Math.round((c.size || 3) * zoom));
    ctxConnOpacity.value = String(Math.round((c.opacity ?? 1) * 100));
  }
}

const eachFrame = (fn) => { selectedFrames().forEach(f => { fn(f); const el = getFrameEl(f.id); if (el) applyFrameStyle(el, f); }); renderConnectors(); };
ctxFrameTitle.addEventListener('input', () => {
  selectedFrames().forEach(f => { f.title = ctxFrameTitle.value; });
  renderFrames();
});
ctxFrameTitle.addEventListener('change', () => persist());
ctxFrameTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctxFrameTitle.blur(); });
ctxFrameColor.addEventListener('input', () => { eachFrame(f => { f.color = ctxFrameColor.value; }); ctxDot.style.background = ctxFrameColor.value; });
ctxFrameColor.addEventListener('change', () => persist());
ctxFrameFill.addEventListener('input', () => eachFrame(f => { f.fill = Number(ctxFrameFill.value); }));
ctxFrameFill.addEventListener('change', () => persist());
ctxFrameRadius.addEventListener('input', () => eachFrame(f => { f.radius = Number(ctxFrameRadius.value); }));
ctxFrameRadius.addEventListener('change', () => persist());
ctxFrameOpacity.addEventListener('input', () => eachFrame(f => { f.opacity = Number(ctxFrameOpacity.value) / 100; }));
ctxFrameOpacity.addEventListener('change', () => persist());

// "Trabajar dentro": el frame deja de tomar los clics hasta que se toca "Listo" en su etiqueta
document.getElementById('ctxFrameLock').addEventListener('click', () => {
  const frames = selectedFrames();
  if (!frames.length) return;
  frames.forEach(f => { f.locked = true; });
  persist();
  setSelection([]);
  renderFrames();
  showToast('Ahora puedes mover y agrupar lo que está dentro. Toca "Listo" en el frame para volver a moverlo.', 'info');
});

const frameImageInput = document.createElement('input');
frameImageInput.type = 'file';
frameImageInput.accept = 'image/*';
frameImageInput.hidden = true;
document.body.appendChild(frameImageInput);
document.getElementById('ctxFrameImage').addEventListener('click', () => frameImageInput.click());
frameImageInput.addEventListener('change', async () => {
  const file = frameImageInput.files && frameImageInput.files[0];
  frameImageInput.value = '';
  if (!file) return;
  const { id } = await storeImageFile(file);
  selectedFrames().forEach(f => { f.image = id; });
  persist();
  renderFrames();
  updateContextBar();
});
document.getElementById('ctxFrameImageRemove').addEventListener('click', () => {
  selectedFrames().forEach(f => { delete f.image; });
  persist();
  renderFrames();
  updateContextBar();
});

const eachConn = (fn) => { selectedConnectors().forEach(fn); renderConnectors(); };
ctxConnColor.addEventListener('input', () => { eachConn(c => { c.color = ctxConnColor.value; }); ctxDot.style.background = ctxConnColor.value; });
ctxConnColor.addEventListener('change', () => persist());
ctxConnSize.addEventListener('input', () => eachConn(c => { c.size = +(Number(ctxConnSize.value) / zoom).toFixed(2); }));
ctxConnSize.addEventListener('change', () => persist());
ctxConnOpacity.addEventListener('input', () => eachConn(c => { c.opacity = Number(ctxConnOpacity.value) / 100; }));
ctxConnOpacity.addEventListener('change', () => persist());
document.getElementById('ctxConnFlip').addEventListener('click', () => { eachConn(c => { [c.from, c.to] = [c.to, c.from]; }); persist(); });
document.getElementById('ctxConnBoth').addEventListener('click', () => { eachConn(c => { c.both = !c.both; }); persist(); });

// ----- Botón de la barra de herramientas y atajo F -----
document.getElementById('toolFrame').addEventListener('click', () => addFrame());
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || editingTextId) return;
  if (Array.from(document.querySelectorAll('.modal-backdrop')).some(m => m.style.display === 'flex')) return;
  addFrame(lastViewportPointer ? screenToCanvas(lastViewportPointer.x, lastViewportPointer.y) : null);
});

// Cada vez que se redibujan los textos (al cambiar de proyecto, sincronizar, deshacer, pegar…) también los frames
const baseRenderTexts = renderTexts;
renderTexts = function () {
  baseRenderTexts();
  renderFrames();
};
// Las flechas que llegan a tableros o imágenes se ajustan cuando esos se redibujan
const baseRenderBoard = renderBoard;
renderBoard = function () {
  baseRenderBoard.apply(this, arguments);
  renderConnectors();
};
const baseRenderBgImages = renderBgImages;
renderBgImages = function () {
  baseRenderBgImages.apply(this, arguments);
  renderConnectors();
};

renderFrames();
