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
    title: '',
    ...(typeof defaultStyleFor === 'function' ? defaultStyleFor('frame') : {})
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
  // Estilo del título
  el.style.setProperty('--frame-title-bg', hexToRgba(f.titleBg || f.color, (f.titleFill ?? 100) / 100));
  el.style.setProperty('--frame-title-color', f.titleColor || '#ffffff');
  el.style.setProperty('--frame-title-size', `${f.titleSize || 13}px`);
  el.style.setProperty('--frame-title-weight', f.titleBold === false ? '400' : '700');
  el.dataset.titleAlign = f.titleAlign || 'left';
}

// Título e ícono de arrastre se ocultan por separado (antes era uno solo: hideLabels)
function frameHides(f) {
  return { title: !!(f.hideTitle ?? f.hideLabels), tab: !!(f.hideTab ?? f.hideLabels) };
}

function renderFrames() {
  frameLayer.innerHTML = '';
  getFrames().forEach(f => {
    const el = document.createElement('div');
    el.className = 'canvas-frame';
    el.dataset.frameId = f.id;
    applyFrameStyle(el, f);
    // "Ocultar título" / "Ocultar ícono" (para presentar el diagrama)
    const hides = frameHides(f);
    el.innerHTML = `
      <div class="frame-drop-bar"></div>
      ${f.image && !hides.tab ? `<div class="board-image-tab frame-image-tab" title="Arrastra para mover el frame"><img data-board-img="${escapeHtml(f.image)}" alt="" draggable="false"></div>` : ''}
      ${f.title && !hides.title ? `<div class="frame-title">${escapeHtml(f.title)}</div>` : ''}
      ${f.locked ? '<button type="button" class="frame-lock-badge" title="Volver a mover el frame">✋ Trabajando dentro · <b>Listo</b></button>' : ''}
      <div class="frame-handle" title="Arrastra para agrandar o achicar el frame (lo de adentro no cambia)"></div>
      <div class="frame-scale-handle" title="Arrastra para agrandar o achicar el frame con todo lo de adentro">⤢</div>`;
    el.querySelector('.frame-handle').addEventListener('pointerdown', (e) => startFrameResize(e, f, el));
    el.querySelector('.frame-scale-handle').addEventListener('pointerdown', (e) => startFrameScale(e, f, el));
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
    return b ? { x: b.x, y: b.y, w: (el ? el.offsetWidth : 600) * boardScale(b), h: (el ? el.offsetHeight : 300) * boardScale(b) } : null;
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
  if (typeof updateConnectHandle === 'function') updateConnectHandle();
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

// ----- Agrandar con todo lo de adentro (manija ⤢ de arriba a la derecha) -----
// Se escala en proporción desde la esquina superior izquierda del frame: textos (letra, ancho y ventanas
// web), notas, imágenes, dibujos y frames de adentro. Mientras se arrastra se ve con una transformación
// (sin redibujar nada) y al soltar se guardan los nuevos tamaños.
function startFrameScale(e, f, el) {
  if (isPanModeActive || isSpacePressed || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  setSelection([`frame:${f.id}`]);
  const startX = e.clientX;
  const scaler = createScaler(objectsInsideFrame(f), f.x, f.y);
  const w0 = f.w, h0 = f.h, r0 = f.radius || 0;
  let k = 1;
  el.setPointerCapture(e.pointerId);
  el.classList.add('is-scaling');
  const onMove = (ev) => {
    k = Math.min(10, Math.max(0.1, (w0 + (ev.clientX - startX) / zoom) / w0));
    scaler.preview(k);
    f.w = Math.round(w0 * k);
    f.h = Math.round(h0 * k);
    f.radius = Math.round(r0 * k);
    applyFrameStyle(el, f);
  };
  const onUp = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.classList.remove('is-scaling');
    scaler.commit(k);
    if (k !== 1) setSelection([`frame:${f.id}`]);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

// Escala en proporción desde (ox, oy) los objetos de keys: textos (letra, ancho y ventanas web), notas,
// imágenes, dibujos, frames y tableros (enteros, con sus columnas y tareas: board.scale).
// preview(k) lo muestra con una transformación (sin redibujar nada) y commit(k) guarda los nuevos tamaños.
function createScaler(keys, ox, oy) {
  const has = (k) => keys.includes(k);
  const texts = getTexts().filter(t => has(`text:${t.id}`)).map(t => ({ o: t, el: getTextEl(t.id) }));
  const imgs = getBgImages().filter(i => has(`img:${i.id}`)).map(i => ({ o: i, el: bgImageLayer.querySelector(`.bg-image[data-image-id="${i.id}"]`) }));
  const frames = getFrames().filter(o => has(`frame:${o.id}`)).map(o => ({ o, el: getFrameEl(o.id) }));
  const strokes = getDrawings().filter(s => has(`stroke:${s.id}`)).map(s => ({ o: s, el: drawLayer.querySelector(`[data-stroke-id="${s.id}"]`) }));
  const boxes = [...texts, ...imgs, ...frames];
  const brds = boards.filter(b => has(`board:${b.id}`)).map(b => ({ o: b, el: getBoardEl(b.id) }));
  const preview = (k) => {
    brds.forEach(b => {
      if (!b.el) return;
      b.el.style.transformOrigin = '0 0';
      b.el.style.transform = `translate(${(b.o.x - ox) * (k - 1)}px, ${(b.o.y - oy) * (k - 1)}px) scale(${boardScale(b.o) * k})`;
    });
    boxes.forEach(b => {
      if (!b.el) return;
      b.el.style.transformOrigin = '0 0';
      b.el.style.transform = `translate(${ox + (b.o.x - ox) * k - b.o.x}px, ${oy + (b.o.y - oy) * k - b.o.y}px) scale(${k})`;
    });
    strokes.forEach(s => s.el && s.el.setAttribute('transform', `translate(${ox * (1 - k)} ${oy * (1 - k)}) scale(${k})`));
  };
  const commit = (k) => {
    boxes.forEach(b => { if (b.el) { b.el.style.transform = ''; b.el.style.transformOrigin = ''; } });
    strokes.forEach(s => s.el && s.el.removeAttribute('transform'));
    brds.forEach(b => b.el && applyBoardScale(b.el, b.o));
    if (k === 1) return;
    const pos = (o) => { o.x = Math.round(ox + (o.x - ox) * k); o.y = Math.round(oy + (o.y - oy) * k); };
    texts.forEach(({ o: t }) => {
      pos(t);
      t.size = +Math.max(2, t.size * k).toFixed(1);
      if (t.w) t.w = Math.round(t.w * k);
      if (t.web && t.web.h) t.web.h = Math.round(t.web.h * k);
    });
    imgs.forEach(({ o: i }) => { pos(i); i.w = Math.round(i.w * k); i.h = Math.round(i.h * k); });
    frames.forEach(({ o }) => { pos(o); o.w = Math.round(o.w * k); o.h = Math.round(o.h * k); o.radius = Math.round((o.radius || 0) * k); });
    strokes.forEach(({ o: s }) => {
      s.points = s.points.map(([x, y]) => [+(ox + (x - ox) * k).toFixed(1), +(oy + (y - oy) * k).toFixed(1)]);
      s.size = +(s.size * k).toFixed(2);
    });
    brds.forEach(({ o: b, el: bel }) => {
      pos(b);
      b.scale = +Math.min(10, Math.max(0.1, boardScale(b) * k)).toFixed(3);
      if (b.scale === 1) delete b.scale;
      if (bel) { bel.style.left = `${b.x}px`; bel.style.top = `${b.y}px`; applyBoardScale(bel, b); }
    });
    persist();
    if (imgs.length) renderBgImages();
    if (strokes.length) renderDrawings();
    renderTexts(); // también redibuja los frames y las flechas
  };
  return { preview, commit };
}

// ----- Agrandar varios objetos a la vez (selección múltiple o grupo) -----
// Un recuadro punteado rodea lo seleccionado y su manija ⤢ (abajo a la derecha) lo escala todo en
// proporción desde la esquina superior izquierda, igual que la manija ⤢ de los frames.
const selScaleBox = document.createElement('div');
selScaleBox.className = 'sel-scale-box';
selScaleBox.hidden = true;
const selScaleHandle = document.createElement('div');
selScaleHandle.className = 'sel-scale-handle';
selScaleHandle.title = 'Arrastra para agrandar o achicar todo lo seleccionado';
selScaleHandle.textContent = '⤢';
selScaleHandle.hidden = true;
zoomCanvas.appendChild(selScaleBox);
zoomCanvas.appendChild(selScaleHandle);

// Lo que se escala con la selección: lo seleccionado y lo que está dentro de los frames seleccionados
function selectionScaleKeys() {
  const keys = new Set([...selection].filter(k => !k.startsWith('conn:')));
  getFrames().filter(f => selection.has(`frame:${f.id}`)).forEach(f => objectsInsideFrame(f).forEach(k => keys.add(k)));
  return [...keys];
}

function selectionRect(keys) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const add = (x, y, w, h) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h); };
  keys.forEach(k => {
    if (k.startsWith('stroke:')) {
      const s = getDrawings().find(d => d.id === k.slice(7));
      if (s) s.points.forEach(([x, y]) => add(x - s.size / 2, y - s.size / 2, s.size, s.size));
      return;
    }
    const r = objectRectByKey(k);
    if (r) add(r.x, r.y, r.w, r.h);
  });
  return x1 === Infinity ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function placeSelScale(r) {
  selScaleBox.style.left = `${r.x}px`;
  selScaleBox.style.top = `${r.y}px`;
  selScaleBox.style.width = `${r.w}px`;
  selScaleBox.style.height = `${r.h}px`;
  selScaleHandle.style.left = `${r.x + r.w}px`;
  selScaleHandle.style.top = `${r.y + r.h}px`;
}

function updateSelScaleHandle() {
  const r = currentTool === 'select' && selection.size > 1 ? selectionRect(selectionScaleKeys()) : null;
  selScaleBox.hidden = selScaleHandle.hidden = !r || r.w < 1 || r.h < 1;
  if (!selScaleHandle.hidden) placeSelScale(r);
}

selScaleHandle.addEventListener('pointerdown', (e) => {
  if (isPanModeActive || isSpacePressed || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const keys = selectionScaleKeys();
  const r = selectionRect(keys);
  if (!r) return;
  const kept = [...selection];
  const scaler = createScaler(keys, r.x, r.y);
  const startX = e.clientX, startY = e.clientY;
  const d2 = r.w * r.w + r.h * r.h;
  let k = 1;
  selScaleHandle.setPointerCapture(e.pointerId);
  const onMove = (ev) => {
    // El arrastre se proyecta sobre la diagonal del recuadro: sirve tirar hacia la derecha, abajo o en diagonal
    const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
    k = Math.min(10, Math.max(0.1, 1 + (dx * r.w + dy * r.h) / d2));
    scaler.preview(k);
    placeSelScale({ x: r.x, y: r.y, w: r.w * k, h: r.h * k });
  };
  const onUp = () => {
    selScaleHandle.removeEventListener('pointermove', onMove);
    selScaleHandle.removeEventListener('pointerup', onUp);
    selScaleHandle.removeEventListener('pointercancel', onUp);
    scaler.commit(k);
    setSelection(kept);
  };
  selScaleHandle.addEventListener('pointermove', onMove);
  selScaleHandle.addEventListener('pointerup', onUp);
  selScaleHandle.addEventListener('pointercancel', onUp);
});

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
  // Tableros: basta con que su centro esté dentro del frame. Exigir el contorno completo dejaba fuera a
  // tableros con columnas largas o un borde que asomaba, y no se movían con el frame.
  boards.forEach(b => {
    const el = getBoardEl(b.id);
    if (!el) return;
    const cx = b.x + el.offsetWidth * boardScale(b) / 2, cy = b.y + el.offsetHeight * boardScale(b) / 2;
    if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) keys.push(`board:${b.id}`);
  });
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

function startConnectorDraft(from, e) {
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('class', 'connector-draft');
  line.setAttribute('stroke-width', 3 / zoom);
  connectorLayer.appendChild(line);
  connectorDraft = { from, line, pointerId: e.pointerId };
  try { viewportArea.setPointerCapture(e.pointerId); } catch (err) {}
}

viewportArea.addEventListener('pointerdown', (e) => {
  if (currentTool !== 'connector' || e.button !== 0 || isSpacePressed) return;
  if (e.target.closest('.toolbox, .zoom-hud, .mobile-fab, button, input, select, textarea')) return;
  const from = objectKeyAtPoint(e.clientX, e.clientY);
  e.preventDefault();
  e.stopPropagation();
  if (!from) { showToast('Empieza el conector sobre un objeto (frame, tablero, imagen, texto o nota) y suéltalo sobre otro', 'info'); return; }
  startConnectorDraft(from, e);
}, true);

// ----- Manija de conexión: el círculo con flecha junto al objeto seleccionado -----
// Se arrastra hasta otro objeto para unirlos, sin cambiar a la herramienta Conector
const connectHandle = document.createElement('div');
connectHandle.className = 'connect-handle';
connectHandle.title = 'Arrastra hasta otro objeto para conectarlos';
connectHandle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="13 6 19 12 13 18"></polyline></svg>';
connectHandle.hidden = true;
zoomCanvas.appendChild(connectHandle);

function updateConnectHandle() {
  // Durante un arrastre no se mide el objeto en cada cuadro (trababa el celular): si el arrastre mueve las
  // manijas junto al objeto se dejan así; si no (p. ej. seleccionando con un recuadro), se esconden.
  // Al soltar vuelven a su lugar exacto.
  if (selectGestureActive) {
    if (!handlesFollowDrag) { connectHandle.hidden = true; ytListHandle.hidden = true; selScaleBox.hidden = selScaleHandle.hidden = true; }
    return;
  }
  if (typeof updateYtListHandle === 'function' && typeof ytListHandle !== 'undefined') updateYtListHandle();
  updateSelScaleHandle();
  const key = selection.size === 1 ? [...selection][0] : '';
  const r = currentTool === 'select' && /^(frame|text|img|board):/.test(key) ? objectRectByKey(key) : null;
  connectHandle.hidden = !r;
  if (!r) return;
  connectHandle.dataset.key = key;
  connectHandle.style.left = `${r.x + r.w}px`;
  connectHandle.style.top = `${r.y + r.h / 2}px`;
}

// ----- Manija del widget "Progreso de listas": círculo verde (+) a su izquierda. Se arrastra hasta una
//       lista de YouTube (en un texto, nota o tarea) y esa lista se suma al widget -----
const ytListHandle = document.createElement('div');
ytListHandle.className = 'ytlist-handle';
ytListHandle.title = 'Arrastra hasta una lista de YouTube para sumarla a este progreso';
ytListHandle.textContent = '+';
ytListHandle.hidden = true;
zoomCanvas.appendChild(ytListHandle);
let ytListDraft = null;

function updateYtListHandle() {
  const key = selection.size === 1 ? [...selection][0] : '';
  const t = currentTool === 'select' && key.startsWith('text:') ? getTexts().find(x => x.id === key.slice(5)) : null;
  const r = t && Array.isArray(t.ytLists) ? objectRectByKey(key) : null;
  ytListHandle.hidden = !r || !!ytListDraft;
  if (!r) return;
  ytListHandle.dataset.textId = t.id;
  ytListHandle.style.left = `${r.x}px`;
  ytListHandle.style.top = `${r.y + r.h / 2}px`;
}

// Listas de YouTube bajo un punto: la lista exacta si se suelta sobre una; si no, todas las del texto o la tarea
function ytListsAtPoint(clientX, clientY) {
  for (const n of document.elementsFromPoint(clientX, clientY)) {
    if (!(n instanceof Element) || n.closest('.is-ytprogress')) continue;
    const pl = n.closest('.yt-playlist[data-list]');
    if (pl) return { ids: [pl.dataset.list], el: pl };
    const textEl = n.closest('.canvas-text');
    if (textEl) {
      const t = getTexts().find(x => x.id === textEl.dataset.textId);
      const ids = t ? youtubeRefs(t.text).lists : [];
      if (ids.length) return { ids, el: textEl };
    }
    const card = n.closest('.kanban-card');
    if (card) {
      const task = tasks.find(x => x.id === card.dataset.taskId);
      const ids = task ? youtubeRefs([task.description, ...(task.subtasks || []).map(s => s.text)].join('\n')).lists : [];
      if (ids.length) return { ids, el: card };
    }
  }
  return null;
}

ytListHandle.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const t = getTexts().find(x => x.id === ytListHandle.dataset.textId);
  if (!t) return;
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('class', 'connector-draft');
  line.setAttribute('stroke-width', 3 / zoom);
  connectorLayer.appendChild(line);
  ytListDraft = { t, line, pointerId: e.pointerId, target: null };
  ytListHandle.hidden = true;
  try { viewportArea.setPointerCapture(e.pointerId); } catch (err) {}
});

viewportArea.addEventListener('pointermove', (e) => {
  if (!ytListDraft || e.pointerId !== ytListDraft.pointerId) return;
  const p = screenToCanvas(e.clientX, e.clientY);
  const a = objectRectByKey(`text:${ytListDraft.t.id}`);
  if (!a) return;
  const start = rectEdgePoint(a, p);
  ytListDraft.line.setAttribute('d', `M ${start.x} ${start.y} L ${p.x} ${p.y} ${arrowHead(start.x, start.y, p.x, p.y, 3 / zoom)}`);
  const hit = ytListsAtPoint(e.clientX, e.clientY);
  if (ytListDraft.target && (!hit || hit.el !== ytListDraft.target)) ytListDraft.target.classList.remove('is-ytlist-target', 'is-connect-target');
  ytListDraft.target = hit ? hit.el : null;
  if (hit) hit.el.classList.add(hit.el.classList.contains('yt-playlist') ? 'is-ytlist-target' : 'is-connect-target');
});

function endYtListDraft(e) {
  if (!ytListDraft || e.pointerId !== ytListDraft.pointerId) return;
  const { t, line, target } = ytListDraft;
  ytListDraft = null;
  line.remove();
  if (target) target.classList.remove('is-ytlist-target', 'is-connect-target');
  const hit = e.type === 'pointerup' ? ytListsAtPoint(e.clientX, e.clientY) : null;
  if (hit) addListIdsToYtWidget(t, hit.ids);
  else if (e.type === 'pointerup') showToast('Suéltalo sobre una lista de YouTube (en un texto, una nota o una tarea)', 'info');
  setSelection([`text:${t.id}`]);
}
viewportArea.addEventListener('pointerup', endYtListDraft);
viewportArea.addEventListener('pointercancel', endYtListDraft);

connectHandle.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  connectHandle.hidden = true;
  startConnectorDraft(connectHandle.dataset.key, e);
});

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

// Un conector nuevo copia el estilo de los que ya tocan esos objetos; si hay varios, el último configurado
// (styledAt se guarda al cambiar color, grosor, opacidad o puntas; si no hay, el más nuevo)
function inheritedConnectorStyle(from, to) {
  let best = null, bestAt = -1;
  getConnectors().forEach((c, i) => {
    const ends = [endpointKey(c.from), endpointKey(c.to)];
    if (!ends.includes(from) && !ends.includes(to)) return;
    const at = c.styledAt || i;
    if (at >= bestAt) { best = c; bestAt = at; }
  });
  if (!best) return {};
  const style = { color: best.color, size: best.size, opacity: best.opacity ?? 1, both: !!best.both };
  if (best.styledAt) style.styledAt = best.styledAt;
  return style;
}

function endConnectorDraft(e) {
  if (!connectorDraft || e.pointerId !== connectorDraft.pointerId) return;
  const { from, line } = connectorDraft;
  connectorDraft = null;
  line.remove();
  clearConnectTargets();
  updateConnectHandle();
  const to = e.type === 'pointerup' ? objectKeyAtPoint(e.clientX, e.clientY) : null;
  if (!to || to === from) return;
  const exists = getConnectors().some(c => {
    const f = endpointKey(c.from), t = endpointKey(c.to);
    return (f === from && t === to) || (f === to && t === from);
  });
  if (exists) { showToast('Esos objetos ya están conectados', 'info'); return; }
  // Estilo: el de los conectores que ya tocan esos objetos o, si no hay, el estilo principal
  const inherited = inheritedConnectorStyle(from, to);
  const base = Object.keys(inherited).length ? inherited : (typeof defaultStyleFor === 'function' ? defaultStyleFor('conn') : {});
  const c = { id: generateId('conn'), from, to, color: '#94a3b8', size: Math.max(1, +(3 / zoom).toFixed(1)), both: false, opacity: 1, ...base };
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
const ctxFrameTitleBg = document.getElementById('ctxFrameTitleBg');
const ctxFrameTitleColor = document.getElementById('ctxFrameTitleColor');
const ctxFrameTitleSize = document.getElementById('ctxFrameTitleSize');
const ctxFrameTitleFill = document.getElementById('ctxFrameTitleFill');

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
    ctxFrameTitleBg.value = f.titleBg || f.color || FRAME_DEFAULT_COLOR;
    ctxFrameTitleColor.value = f.titleColor || '#ffffff';
    ctxFrameTitleSize.value = String(f.titleSize || 13);
    ctxFrameTitleFill.value = String(f.titleFill ?? 100);
    document.getElementById('ctxFrameTitleBold').classList.toggle('is-active', f.titleBold !== false);
    const hides = frameHides(f);
    document.getElementById('ctxFrameHideTitle').classList.toggle('is-active', hides.title);
    document.querySelector('#ctxFrameHideTitle span:last-child').textContent = hides.title ? 'Mostrar título' : 'Ocultar título';
    document.getElementById('ctxFrameHideTab').classList.toggle('is-active', hides.tab);
    document.querySelector('#ctxFrameHideTab span:last-child').textContent = hides.tab ? 'Mostrar ícono' : 'Ocultar ícono';
    document.querySelectorAll('[data-title-align]').forEach(b => b.classList.toggle('is-active', b.dataset.titleAlign === (f.titleAlign || 'left')));
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

// Estilo del título: se muestra/oculta el grupo de controles
const ctxFrameTitleStyle = document.getElementById('ctxFrameTitleStyle');
ctxFrameTitleStyle.addEventListener('click', () => {
  const opts = document.getElementById('ctxFrameTitleOpts');
  opts.hidden = !opts.hidden;
  ctxFrameTitleStyle.setAttribute('aria-expanded', String(!opts.hidden));
});
ctxFrameTitleBg.addEventListener('input', () => eachFrame(f => { f.titleBg = ctxFrameTitleBg.value; }));
ctxFrameTitleColor.addEventListener('input', () => eachFrame(f => { f.titleColor = ctxFrameTitleColor.value; }));
ctxFrameTitleSize.addEventListener('input', () => eachFrame(f => { f.titleSize = Number(ctxFrameTitleSize.value); }));
ctxFrameTitleFill.addEventListener('input', () => eachFrame(f => { f.titleFill = Number(ctxFrameTitleFill.value); }));
[ctxFrameTitleBg, ctxFrameTitleColor, ctxFrameTitleSize, ctxFrameTitleFill].forEach(input => input.addEventListener('change', () => persist()));
document.getElementById('ctxFrameTitleBold').addEventListener('click', () => {
  const bold = !(selectedFrames()[0] && selectedFrames()[0].titleBold !== false);
  eachFrame(f => { f.titleBold = bold; });
  persist();
  updateContextBar();
});

document.querySelectorAll('[data-title-align]').forEach(b => b.addEventListener('click', () => {
  eachFrame(f => { f.titleAlign = b.dataset.titleAlign; });
  persist();
  updateContextBar();
}));

// Ocultar el título o el ícono de arrastre (por separado) para presentar el diagrama; el frame se sigue moviendo por su borde
function toggleFrameHide(part) {
  const frames = selectedFrames();
  if (!frames.length) return;
  const hide = !frameHides(frames[0])[part];
  frames.forEach(f => {
    const h = frameHides(f);
    delete f.hideLabels;
    f.hideTitle = part === 'title' ? hide : h.title;
    f.hideTab = part === 'tab' ? hide : h.tab;
  });
  persist();
  renderFrames();
  updateContextBar();
}
document.getElementById('ctxFrameHideTitle').addEventListener('click', () => toggleFrameHide('title'));
document.getElementById('ctxFrameHideTab').addEventListener('click', () => toggleFrameHide('tab'));

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

const eachConn = (fn) => { const now = Date.now(); selectedConnectors().forEach(c => { fn(c); c.styledAt = now; }); renderConnectors(); };
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
