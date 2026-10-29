/**
 * ZenBan • Kanban & Todo Engine
 * Multi-device Kanban with Zoom (Pinch, Wheel, UI Buttons), Pan, and Unified Touch/Mouse Drag & Drop
 */

// =============================================================================
// 1. Initial State & Data Persistence
// =============================================================================

// Ícono de los botones Copiar
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

const STORAGE_KEYS = {
  PROJECTS: 'zenban_projects_v3',
  ACTIVE_PROJECT: 'zenban_active_project_v3',
  // Claves antiguas (tablero único): se usan solo para migrar a proyectos
  TASKS: 'zenban_tasks_v2',
  COLUMNS: 'zenban_columns_v2',
  THEME: 'zenban_theme_v2',
  TAGS: 'zenban_tags_v1'
};

const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'Por hacer', color: '#6366f1' },
  { id: 'in_progress', title: 'En progreso', color: '#f59e0b' },
  { id: 'review', title: 'En revisión', color: '#a855f7' },
  { id: 'done', title: 'Completadas', color: '#10b981' }
];

const DEFAULT_TASKS = [
  {
    id: 'task-1',
    columnId: 'todo',
    title: '📱 Optimizar gestos táctiles y zoom en móviles',
    description: 'Asegurar que el pellizco con 2 dedos y arrastre de tarjetas responda fluido a 60fps.',
    priority: 'urgent',
    dueDate: getRelativeDate(1),
    tags: ['Móvil', 'UX', 'Gestos'],
    completed: false,
    subtasks: [
      { id: 'st-1', text: 'Pinch to zoom con touch events', completed: true },
      { id: 'st-2', text: 'Botones UI de acercar y alejar', completed: true },
      { id: 'st-3', text: 'Prueba en pantallas táctiles', completed: false }
    ],
    createdAt: Date.now() - 3600000 * 24
  },
  {
    id: 'task-2',
    columnId: 'in_progress',
    title: '✨ Pulir diseño Kanban y animaciones de tarjetas',
    description: 'Implementar sombras neón, glassmorphism y microinteracciones de arrastre.',
    priority: 'high',
    dueDate: getRelativeDate(2),
    tags: ['Diseño', 'CSS', 'UI'],
    completed: false,
    subtasks: [
      { id: 'st-4', text: 'Paleta Slate Dark & Light', completed: true },
      { id: 'st-5', text: 'Indicadores de drop zone', completed: true }
    ],
    createdAt: Date.now() - 3600000 * 12
  },
  {
    id: 'task-3',
    columnId: 'review',
    title: '🔍 Búsqueda en tiempo real y filtros de prioridad',
    description: 'Comprobar filtrado por palabras clave y nivel de urgencia.',
    priority: 'medium',
    dueDate: getRelativeDate(3),
    tags: ['Filtros', 'Core'],
    completed: false,
    subtasks: [
      { id: 'st-6', text: 'Filtro por prioridad', completed: true },
      { id: 'st-7', text: 'Búsqueda por texto', completed: true }
    ],
    createdAt: Date.now() - 3600000 * 6
  },
  {
    id: 'task-4',
    columnId: 'done',
    title: '🚀 Configurar persistencia LocalStorage',
    description: 'Guardar cambios automáticamente sin perder las tareas ni el orden de columnas.',
    priority: 'low',
    dueDate: getRelativeDate(0),
    tags: ['Storage', 'Offline'],
    completed: true,
    subtasks: [
      { id: 'st-8', text: 'Serialización JSON', completed: true },
      { id: 'st-9', text: 'Recuperación al recargar', completed: true }
    ],
    createdAt: Date.now() - 3600000 * 48
  }
];

function getRelativeDate(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  // Fecha local (no UTC) en formato AAAA-MM-DD
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Plantillas de columnas para proyectos nuevos
const PROJECT_TEMPLATES = {
  basic: [
    { id: 'todo', title: 'Por hacer', color: '#6366f1' },
    { id: 'in_progress', title: 'En progreso', color: '#f59e0b' },
    { id: 'done', title: 'Completadas', color: '#10b981' }
  ],
  full: DEFAULT_COLUMNS,
  empty: []
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function generateId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
}

// Proyecto vacío (lienzo sin tableros) para el primer uso o un espacio sin datos
function blankProject() {
  return { id: generateId('proj'), name: 'Mi primer proyecto', color: '#6366f1', columns: [], tasks: [], boards: [], createdAt: Date.now() };
}

// Espacio (personal o compartido) al que pertenecen los datos que esta pestaña tiene abiertos.
// Si otra pestaña cambia de espacio, esta no guarda ni sube sus datos en el espacio nuevo (los mezclaría).
let tabSpaceKey = spaceKey(currentSpace());

// Carga los proyectos; si no existen, migra el tablero anterior como primer proyecto
function loadProjects() {
  const saved = loadData(STORAGE_KEYS.PROJECTS, null);
  if (Array.isArray(saved) && saved.length > 0) return saved;

  const legacyColumns = loadData(STORAGE_KEYS.COLUMNS, null);
  const legacyTasks = loadData(STORAGE_KEYS.TASKS, null);
  const hasLegacy = Array.isArray(legacyColumns) || Array.isArray(legacyTasks);

  // Primer uso: un lienzo vacío, sin tableros de ejemplo
  const firstProject = hasLegacy ? {
    id: generateId('proj'),
    name: 'Mi tablero',
    color: '#6366f1',
    columns: Array.isArray(legacyColumns) ? legacyColumns : deepClone(DEFAULT_COLUMNS),
    tasks: Array.isArray(legacyTasks) ? legacyTasks : [],
    createdAt: Date.now()
  } : blankProject();

  const migrated = [firstProject];
  saveData(STORAGE_KEYS.PROJECTS, migrated);
  return migrated;
}

// App State
let projects = loadProjects();
let activeProjectId = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
if (!projects.some(p => p.id === activeProjectId)) {
  activeProjectId = projects[0].id;
}
// columns y tasks siempre apuntan al proyecto activo
let columns = getActiveProject().columns;
let tasks = getActiveProject().tasks;
let currentModalSubtasks = [];
let currentModalTags = [];

// Biblioteca de etiquetas reutilizables (compartida entre proyectos)
const TAG_DEFAULT_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6', '#3b82f6'];
let tagLibrary = loadTagLibrary();

function loadTagLibrary() {
  const saved = loadData(STORAGE_KEYS.TAGS, null);
  const lib = Array.isArray(saved) ? saved : [];
  const known = new Set(lib.map(t => t.name.toLowerCase()));
  // Incorpora las etiquetas que ya existían en las tareas
  projects.forEach(p => (p.tasks || []).forEach(task => (task.tags || []).forEach(name => {
    if (!known.has(name.toLowerCase())) {
      known.add(name.toLowerCase());
      lib.push({ id: generateId('tag'), name: name, color: TAG_DEFAULT_COLORS[lib.length % TAG_DEFAULT_COLORS.length] });
    }
  })));
  saveData(STORAGE_KEYS.TAGS, lib);
  return lib;
}

function findTag(name) {
  const key = String(name).toLowerCase();
  return tagLibrary.find(t => t.name.toLowerCase() === key);
}

function getTagColor(name) {
  const tag = findTag(name);
  return tag ? tag.color : '#64748b';
}

function tagPillHtml(name, extra = '') {
  return `<span class="tag-pill tag-colored" style="--tag-color: ${getTagColor(name)}">${escapeHtml(name)}${extra}</span>`;
}
// Los filtros (búsqueda, prioridad, etiqueta) ahora son propios de cada tablero
function getBoardFilters(board) {
  if (!board.filters) board.filters = { q: '', priority: 'all', tag: 'all' };
  return board.filters;
}

function boardHasFilters(board) {
  const f = board.filters;
  return !!f && (!!f.q || f.priority !== 'all' || f.tag !== 'all');
}

function taskMatchesFilters(task, f) {
  const q = f.q || '';
  const matchesSearch = q === '' ||
    task.title.toLowerCase().includes(q) ||
    (task.description && task.description.toLowerCase().includes(q)) ||
    (task.tags && task.tags.some(tag => tag.toLowerCase().includes(q)));
  const matchesPriority = f.priority === 'all' || effectivePriority(task) === f.priority || task.priority === f.priority;
  const matchesTag = f.tag === 'all' || (task.tags && task.tags.some(tag => tag.toLowerCase() === f.tag.toLowerCase()));
  return matchesSearch && matchesPriority && matchesTag;
}

function loadData(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (e) {
    console.error('Error loading data from localStorage', e);
    return fallback;
  }
}

function saveData(key, value) {
  const isData = key === STORAGE_KEYS.PROJECTS || key === STORAGE_KEYS.TAGS;
  if (isData && spaceChangedElsewhere()) {
    reloadForSpaceChange();
    return;
  }
  // Otra ventana o pestaña de ZenBan guardó mientras tanto: se combina con lo suyo antes de guardar
  // (antes la última en guardar pisaba lo de la otra, y una tarea nueva podía desaparecer)
  if (isData && !(typeof SYNC !== 'undefined' && SYNC && SYNC.applying) && otherWindowSaved()) {
    adoptOtherWindowData();
    value = key === STORAGE_KEYS.PROJECTS ? projects : tagLibrary;
  }
  const text = JSON.stringify(value);
  try {
    localStorage.setItem(key, text);
  } catch (e) {
    console.error('Error saving data to localStorage', e);
  }
  if (isData) markDataSaved(key, text);
  // Avisar a la sincronización con Drive que hubo cambios locales
  if (isData) onLocalDataChanged();
}

// ----- Varias ventanas abiertas (la app instalada y una pestaña, dos pestañas…) -----
// Cada ventana guarda una marca al guardar. Si al guardar la marca no es la que esta ventana conoce,
// otra ventana guardó: se combinan ambas versiones (por id, como en la sincronización) en vez de pisarla.
// (con var: saveData puede llamarse al cargar, antes de llegar a estas líneas)
var DATA_REV_KEY = 'zenban_data_rev';
var knownDataRev = localStorage.getItem(DATA_REV_KEY) || '';
// Lo último que esta ventana leyó o guardó (texto): es la base para combinar si otra ventana guarda después
var dataBaseText = {
  [STORAGE_KEYS.PROJECTS]: localStorage.getItem(STORAGE_KEYS.PROJECTS) || '[]',
  [STORAGE_KEYS.TAGS]: localStorage.getItem(STORAGE_KEYS.TAGS) || '[]'
};

function otherWindowSaved() {
  if (!dataBaseText) return false;
  return (localStorage.getItem(DATA_REV_KEY) || '') !== knownDataRev;
}

function markDataSaved(key, text) {
  if (!dataBaseText) return;
  knownDataRev = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try { localStorage.setItem(DATA_REV_KEY, knownDataRev); } catch (e) {}
  dataBaseText[key] = text;
}

function adoptOtherWindowData() {
  const parse = (t) => { try { return JSON.parse(t); } catch (e) { return []; } };
  const storedText = { p: localStorage.getItem(STORAGE_KEYS.PROJECTS) || '[]', t: localStorage.getItem(STORAGE_KEYS.TAGS) || '[]' };
  const stored = { projects: parse(storedText.p), tags: parse(storedText.t), deletedProjects: deletedProjects() };
  const base = { projects: parse(dataBaseText[STORAGE_KEYS.PROJECTS]), tags: parse(dataBaseText[STORAGE_KEYS.TAGS]) };
  knownDataRev = localStorage.getItem(DATA_REV_KEY) || '';
  dataBaseText[STORAGE_KEYS.PROJECTS] = storedText.p;
  dataBaseText[STORAGE_KEYS.TAGS] = storedText.t;
  const merged = mergePayloads(localPayload(), stored, base);
  if (merged.projects.length && !sameJson(dataPart(merged), dataPart(localPayload()))) applyPayload(merged);
}

// Lo que guarda otra ventana se ve también aquí (si no se está a mitad de un cambio; si no, al terminar)
let otherWindowPending = false;
function syncFromOtherWindow() {
  if (!otherWindowSaved()) { otherWindowPending = false; return; }
  if (userIsInteracting() || SYNC.busy) { otherWindowPending = true; return; }
  otherWindowPending = false;
  adoptOtherWindowData();
}
window.addEventListener('storage', (e) => { if (e.key === DATA_REV_KEY) syncFromOtherWindow(); });
window.addEventListener('focus', syncFromOtherWindow);
document.addEventListener('pointerup', () => { if (otherWindowPending) setTimeout(syncFromOtherWindow, 50); });

function getActiveProject() {
  return projects.find(p => p.id === activeProjectId) || projects[0];
}

// Guarda columnas y tareas actuales dentro del proyecto activo
// ----- Historial para Deshacer (Ctrl+Z): instantáneas del proyecto activo -----
const historyStack = [];
const HISTORY_LIMIT = 80;
let lastSnapshot = null;
let lastHistoryPush = 0;
let restoringHistory = false;

function projectSnapshot(project) {
  return JSON.stringify({ ...project, updatedAt: 0 });
}

function resetHistory() {
  historyStack.length = 0;
  lastSnapshot = projectSnapshot(getActiveProject());
}

function persist() {
  const project = getActiveProject();
  if (project) {
    project.columns = columns;
    project.tasks = tasks;
    // Cuándo se completó cada tarea (para archivarlas solas después de unos días)
    tasks.forEach(t => {
      if (t.completed && !t.completedAt) t.completedAt = Date.now();
      else if (!t.completed && t.completedAt) delete t.completedAt;
      // Una repetitiva recuerda su última columna "abierta", para volver ahí en el siguiente período
      if (t.repeat && !isDoneColumn(t.columnId)) t.repeatColumnId = t.columnId;
    });
    // Guarda el estado anterior para poder deshacer (agrupa cambios muy seguidos, p. ej. al escribir)
    const snap = projectSnapshot(project);
    if (!restoringHistory && lastSnapshot !== null && snap !== lastSnapshot) {
      const now = Date.now();
      if (now - lastHistoryPush > 600 || historyStack.length === 0) {
        historyStack.push(lastSnapshot);
        if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
      }
      lastHistoryPush = now;
    }
    lastSnapshot = snap;
    project.updatedAt = Date.now();
  }
  saveData(STORAGE_KEYS.PROJECTS, projects);
  // El widget de Windows muestra los pendientes al día (se agrupan los cambios seguidos)
  try { scheduleWidgetUpdate(); } catch (e) {}
}

function undoLastChange() {
  const snap = historyStack.pop();
  if (!snap) {
    showToast('No hay nada que deshacer', 'info');
    return;
  }
  const restored = JSON.parse(snap);
  const idx = projects.findIndex(p => p.id === restored.id);
  if (idx < 0) return;
  projects[idx] = restored;
  columns = restored.columns || [];
  tasks = restored.tasks || [];
  selection = new Set();
  restoringHistory = true;
  ensureBoards();
  persist();
  restoringHistory = false;
  lastSnapshot = snap;
  lastHistoryPush = 0;
  renderProjectSwitcher();
  renderBoard();
  renderBgImages();
  renderTexts();
  renderDrawings();
  showToast('Cambio deshecho', 'info');
}

// =============================================================================
// 2. Zoom & Pan Transform Engine
// =============================================================================

const viewportArea = document.getElementById('viewportArea');
const zoomCanvas = document.getElementById('zoomCanvas');
const kanbanBoard = document.getElementById('kanbanBoard');
const zoomPercentLabel = document.getElementById('zoomPercentLabel');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnZoomReset = document.getElementById('btnZoomReset');
const btnZoomFit = document.getElementById('btnZoomFit');
const btnPanMode = document.getElementById('btnPanMode');

// Configuración de este dispositivo (ventana ⚙️ que se abre desde el logo)
const SETTINGS_KEY = 'zenban_settings_v1';
const DEFAULT_SETTINGS = { zoomMin: 0.5, toolsAutoHide: false, toolsHiddenOpacity: 20 };
let appSettings = { ...DEFAULT_SETTINGS, ...loadData(SETTINGS_KEY, {}) };

const ZOOM_CONFIG = {
  MIN: appSettings.zoomMin,
  MAX: 2.2,
  STEP: 0.15,
  WHEEL_FACTOR: 0.0012
};

let zoom = 1.0;
let panX = 0;
let panY = 0;
let isPanModeActive = false;
let isSpacePressed = false;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let initialPanX = 0;
let initialPanY = 0;

// Update Transform on Canvas
function applyTransform(animate = false) {
  if (animate) {
    zoomCanvas.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
    setTimeout(() => {
      zoomCanvas.style.transition = 'none';
    }, 260);
  } else {
    zoomCanvas.style.transition = 'none';
  }

  zoomCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  markCanvasTransforming(animate ? 320 : 220);
  scheduleInvZoom();
  // Bajo 10% se muestra con un decimal (el zoom mínimo puede llegar a 1%)
  const pct = zoom * 100;
  const label = `${pct < 10 ? pct.toFixed(1).replace(/\.0$/, '') : Math.round(pct)}%`;
  if (zoomPercentLabel.textContent !== label) zoomPercentLabel.textContent = label;
}

// Viaje suave de la vista (ajustar a pantalla, ir a un objeto). Con una transición CSS se mezclaban el
// desplazamiento y la escala en línea recta: el contenido se iba hacia un lado y entraba "recortado" al
// final. Aquí el zoom cambia de forma pareja (en escala logarítmica) y el punto que se ve al centro viaja
// derecho hacia el nuevo centro, cuadro a cuadro.
let viewAnimFrame = null, viewFadeTimer = null;
const IS_COARSE_VIEW = matchMedia('(pointer: coarse)').matches;
function animateViewTo(toZoom, toPanX, toPanY, ms = 420) {
  cancelAnimationFrame(viewAnimFrame);
  const r = viewportArea.getBoundingClientRect();
  const cx = r.width / 2, cy = r.height / 2;
  const z0 = zoom, z1 = toZoom;
  // Punto del lienzo que está al centro de la pantalla, al empezar y al terminar
  const w0x = (cx - panX) / z0, w0y = (cy - panY) / z0;
  const w1x = (cx - toPanX) / z1, w1y = (cy - toPanY) / z1;
  if (ms <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    zoom = z1; panX = toPanX; panY = toPanY; applyTransform(); return;
  }
  // En el celular el viaje con zoom se veía mal (grabado en un celular real): al alejarse solo alcanzaba
  // a dibujar parte de los tableros (se veían cortados) y al terminar la pantalla destellaba en blanco
  // mientras redibujaba todo. Ahí el lienzo se desvanece, salta escondido, se redibuja y vuelve a aparecer.
  // (Dura menos de medio segundo y no se corta al tocar: así nunca queda el lienzo escondido)
  if (IS_COARSE_VIEW) {
    clearTimeout(viewFadeTimer);
    zoomCanvas.style.transition = 'opacity 0.12s ease-in';
    zoomCanvas.style.opacity = '0';
    viewFadeTimer = setTimeout(() => {
      zoom = z1; panX = toPanX; panY = toPanY;
      applyTransform();
      clearTimeout(canvasIdleTimer);
      settleCanvas();
      // Dos cuadros para que alcance a dibujarse antes de mostrarlo
      requestAnimationFrame(() => requestAnimationFrame(() => {
        zoomCanvas.style.transition = 'opacity 0.2s ease-out';
        zoomCanvas.style.opacity = '';
      }));
    }, 130);
    return;
  }
  const lz0 = Math.log(z0), lz1 = Math.log(z1);
  const start = performance.now();
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const k = ease(t);
    zoom = t < 1 ? Math.exp(lz0 + (lz1 - lz0) * k) : z1;
    const wx = w0x + (w1x - w0x) * k, wy = w0y + (w1y - w0y) * k;
    panX = t < 1 ? cx - wx * zoom : toPanX;
    panY = t < 1 ? cy - wy * zoom : toPanY;
    applyTransform();
    viewAnimFrame = t < 1 ? requestAnimationFrame(step) : null;
  };
  viewAnimFrame = requestAnimationFrame(step);
}
// Si se toca, se arrastra o se usa la rueda durante el viaje, se detiene donde va (manda el usuario)
['pointerdown', 'touchstart', 'wheel'].forEach(ev => viewportArea.addEventListener(ev, () => {
  if (viewAnimFrame) { cancelAnimationFrame(viewAnimFrame); viewAnimFrame = null; }
}, { capture: true, passive: true }));

// Mientras el lienzo se mueve se pinta como una capa aparte (will-change) para que vaya fluido;
// al detenerse se quita, y el navegador lo vuelve a pintar a la resolución justa para el zoom actual
let canvasIdleTimer = null;
function markCanvasTransforming(ms) {
  if (!zoomCanvas.classList.contains('is-transforming')) zoomCanvas.classList.add('is-transforming');
  clearTimeout(canvasIdleTimer);
  canvasIdleTimer = setTimeout(settleCanvas, ms);
}

// Al detenerse se hacen juntos los dos cambios que obligan a repintar el lienzo (--inv-zoom y quitar
// la capa), para que se repinte una sola vez en vez de dos seguidas
function settleCanvas() {
  applyInvZoom();
  zoomCanvas.classList.remove('is-transforming');
}

// --inv-zoom (grosor de bordes y manijas de selección) obliga a recalcular el estilo de TODO el lienzo.
// Mientras se hace zoom continuo (pellizco, rueda) se actualiza al detenerse, no en cada cuadro:
// en el celular, con muchas tarjetas, recalcularlo en cada cuadro hacía el zoom muy lento.
let invZoomApplied = null;
function applyInvZoom() {
  if (zoom === invZoomApplied) return;
  invZoomApplied = zoom;
  zoomCanvas.style.setProperty('--inv-zoom', 1 / zoom);
}

function scheduleInvZoom() {
  // La primera vez se aplica al tiro; después, al detenerse (settleCanvas)
  if (invZoomApplied === null) applyInvZoom();
}

// Zoom towards a specific screen coordinate (cursor or pinch midpoint)
function zoomAtPoint(clientX, clientY, newZoom) {
  // Si "Ajustar a pantalla" alejó más que el mínimo, desde ahí se puede acercar sin saltos
  const clampedZoom = Math.min(Math.max(newZoom, Math.min(ZOOM_CONFIG.MIN, zoom)), ZOOM_CONFIG.MAX);
  if (clampedZoom === zoom) return;

  const rect = viewportArea.getBoundingClientRect();
  const originX = clientX - rect.left;
  const originY = clientY - rect.top;

  // Preserve screen position of the point under zoom
  panX = originX - (originX - panX) * (clampedZoom / zoom);
  panY = originY - (originY - panY) * (clampedZoom / zoom);
  zoom = clampedZoom;

  applyTransform();
}

// Center point zoom for UI buttons
function zoomAtCenter(factor) {
  const rect = viewportArea.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  zoomAtPoint(rect.left + centerX, rect.top + centerY, zoom * factor);
}

// UI Zoom Buttons Event Handlers
btnZoomIn.addEventListener('click', () => {
  zoomAtCenter(1.2);
});

btnZoomOut.addEventListener('click', () => {
  zoomAtCenter(1 / 1.2);
});

btnZoomReset.addEventListener('click', () => {
  zoom = 1.0;
  panX = 0;
  panY = 0;
  applyTransform(true);
  showToast('Zoom restablecido al 100%', 'info');
});

// Fit Board into Viewport
btnZoomFit.addEventListener('click', fitBoardToScreen);
document.getElementById('btnNextObject').addEventListener('click', (e) => goToNextObject(e.shiftKey ? -1 : 1));

// Alto real de la pantalla (--app-h en styles.css). En algunos inicios de Chrome en Android (abrir desde el
// ícono, volver a la app o compartir algo a ZenBan) 100dvh quedaba más alto que lo visible y la barra de
// zoom quedaba fuera, hasta girar el celular. Se mide al cargar, al volver y en cada cambio de tamaño.
function syncAppHeight() {
  const h = Math.round(window.innerHeight);
  if (h > 0) document.documentElement.style.setProperty('--app-h', `${h}px`);
  // Si el documento quedó desplazado (no debería), se vuelve arriba: si no, las barras quedan corridas
  if (window.scrollY || document.scrollingElement.scrollTop) window.scrollTo(0, 0);
}
syncAppHeight();
['resize', 'orientationchange', 'pageshow', 'load'].forEach(ev => window.addEventListener(ev, () => requestAnimationFrame(syncAppHeight)));
if (window.visualViewport) visualViewport.addEventListener('resize', () => requestAnimationFrame(syncAppHeight));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(syncAppHeight, 150); });
setTimeout(syncAppHeight, 600);

// Parte del lienzo que de verdad se ve: sin lo que queda bajo la barra del navegador (celular) ni lo que
// tapan la barra de contexto (arriba), la barra del zoom (abajo) y la de herramientas (izquierda)
function visibleCanvasRect() {
  const r = viewportArea.getBoundingClientRect();
  const screenH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  let top = r.top, bottom = Math.min(r.bottom, screenH), left = r.left, right = Math.min(r.right, window.innerWidth);
  const shown = (el) => el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const ctx = document.getElementById('contextBar') || document.querySelector('.context-bar');
  if (shown(ctx) && getComputedStyle(ctx).position === 'fixed') top = Math.max(top, ctx.getBoundingClientRect().bottom);
  const hud = document.querySelector('#zoomHud .hud-pill');
  if (shown(hud)) { const hr = hud.getBoundingClientRect(); if (hr.top > (top + bottom) / 2) bottom = Math.min(bottom, hr.top - 4); }
  const tools = document.querySelector('.toolbox-pill');
  if (shown(tools)) { const tr = tools.getBoundingClientRect(); if (tr.left < r.left + 80 && tr.height > (bottom - top) * 0.4) left = Math.max(left, tr.right + 4); }
  return { width: Math.max(80, right - left), height: Math.max(80, bottom - top), offX: left - r.left, offY: top - r.top };
}

function fitBoardToScreen() {
  const vis = visibleCanvasRect();
  const bounds = getContentBounds();
  const boardWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boardHeight = Math.max(1, bounds.maxY - bounds.minY);

  // En el celular la pantalla es chica: se deja menos margen
  const padding = vis.width < 600 ? 10 : 40;
  const scaleX = (vis.width - padding * 2) / boardWidth;
  const scaleY = (vis.height - padding * 2) / boardHeight;
  let targetZoom = Math.min(scaleX, scaleY, 1.2);
  // Para que se vea TODO se puede alejar más que el zoom mínimo de Configuración (en el celular no alcanzaba)
  targetZoom = Math.max(targetZoom, 0.02);

  // Centrado en la parte visible
  animateViewTo(targetZoom,
    vis.offX + (vis.width - boardWidth * targetZoom) / 2 - bounds.minX * targetZoom,
    vis.offY + (vis.height - boardHeight * targetZoom) / 2 - bounds.minY * targetZoom);
  const pct = targetZoom * 100;
  showToast(`Tablero ajustado (${pct < 10 ? pct.toFixed(1).replace('.', ',') : Math.round(pct)}%)`, 'info');
}

// ----- Ir de objeto en objeto: recorre tableros, frames, textos, notas e imágenes (de arriba abajo,
//       de izquierda a derecha), los centra y los selecciona. Útil si al ajustar no se ve nada. -----
let objectTourIndex = -1;
function canvasObjectsForTour() {
  const list = [];
  boards.forEach(b => {
    const el = getBoardEl(b.id);
    if (el) list.push({ key: `board:${b.id}`, name: `Tablero: ${b.title || 'sin título'}`, x: b.x, y: b.y, w: el.offsetWidth * boardScale(b), h: el.offsetHeight * boardScale(b) });
  });
  if (typeof getFrames === 'function') getFrames().forEach(f => list.push({ key: `frame:${f.id}`, name: f.title ? `Frame: ${f.title}` : 'Frame', x: f.x, y: f.y, w: f.w, h: f.h }));
  getTexts().forEach(t => {
    const el = getTextEl(t.id);
    const first = String(t.text || '').split('\n')[0].slice(0, 40);
    if (el) list.push({ key: `text:${t.id}`, name: `${t.sticky ? 'Nota' : 'Texto'}${first ? `: ${first}` : ''}`, x: t.x, y: t.y, w: el.offsetWidth, h: el.offsetHeight });
  });
  getBgImages().forEach(i => list.push({ key: `img:${i.id}`, name: 'Imagen', x: i.x, y: i.y, w: i.w, h: i.h }));
  // Por filas (de a 200 px) y dentro de cada fila de izquierda a derecha
  return list.sort((a, b) => Math.floor(a.y / 200) - Math.floor(b.y / 200) || a.x - b.x);
}

function goToNextObject(step = 1) {
  const list = canvasObjectsForTour();
  if (!list.length) { showToast('Este proyecto todavía no tiene objetos en el lienzo', 'info'); return; }
  // Si hay algo seleccionado, se sigue desde ahí
  const selKey = selection.size === 1 ? [...selection][0] : null;
  const current = selKey ? list.findIndex(o => o.key === selKey) : -1;
  const from = current >= 0 ? current : objectTourIndex;
  objectTourIndex = ((from + step) % list.length + list.length) % list.length;
  const o = list[objectTourIndex];
  fitRectToScreen(o.x, o.y, o.w, o.h);
  setSelection([o.key]);
  showToast(`${objectTourIndex + 1} de ${list.length} · ${o.name}`, 'info');
}

// Acerca la vista hasta que un objeto (imagen, texto o tablero) llene la pantalla, centrado
function fitRectToScreen(x, y, w, h) {
  // Solo la parte del lienzo que se ve (sin barras ni lo que tapa el navegador en el celular)
  const vis = visibleCanvasRect();
  const padding = vis.width < 600 ? 12 : 24;
  const scaleX = (vis.width - padding * 2) / Math.max(1, w);
  const scaleY = (vis.height - padding * 2) / Math.max(1, h);
  const z = Math.min(Math.max(Math.min(scaleX, scaleY), ZOOM_CONFIG.MIN), ZOOM_CONFIG.MAX);
  // Si ni con el zoom mínimo cabe (p. ej. un tablero ancho en el celular), se muestra desde su esquina
  animateViewTo(z,
    vis.offX + (w * z > vis.width - padding * 2 ? padding - x * z : (vis.width - w * z) / 2 - x * z),
    vis.offY + (h * z > vis.height - padding * 2 ? padding - y * z : (vis.height - h * z) / 2 - y * z));
}

// Rectángulo (coordenadas del lienzo) del objeto bajo un elemento, si es imagen, texto o tablero
function objectRectAt(target) {
  const textEl = target.closest('.canvas-text');
  if (textEl) {
    const t = getTexts().find(x => x.id === textEl.dataset.textId);
    if (t) return { x: t.x, y: t.y, w: textEl.offsetWidth, h: textEl.offsetHeight };
  }
  const imgEl = target.closest('.bg-image');
  if (imgEl) {
    const i = getBgImages().find(x => x.id === imgEl.dataset.imageId);
    if (i) return { x: i.x, y: i.y, w: i.w, h: i.h };
  }
  const frame = target.closest('.board-frame');
  if (frame) {
    const b = boards.find(x => x.id === frame.dataset.boardId);
    if (b) return { x: b.x, y: b.y, w: frame.offsetWidth * boardScale(b), h: frame.offsetHeight * boardScale(b) };
  }
  const frameEl = target.closest('.canvas-frame');
  if (frameEl && typeof getFrames === 'function') {
    const f = getFrames().find(x => x.id === frameEl.dataset.frameId);
    if (f) return { x: f.x, y: f.y, w: f.w, h: f.h };
  }
  return null;
}

// Toggle Pan Mode
btnPanMode.addEventListener('click', () => {
  setTool(isPanModeActive ? 'select' : 'hand');
  showToast(isPanModeActive ? 'Modo Desplazamiento Activado' : 'Modo Selección Activado', 'info');
});

// Keyboard spacebar shortcut for panning
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    isSpacePressed = true;
    viewportArea.classList.add('pan-mode');
  }
  // Escape cierra el menú de proyectos
  if (e.key === 'Escape') closeProjectMenu();
  // Quick 'N' for new task
  const anyModalOpen = Array.from(document.querySelectorAll('.modal-backdrop')).some(m => m.style.display === 'flex');
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !anyModalOpen && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    openTaskModal(null, defaultColumnForNewTask());
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    isSpacePressed = false;
    if (!isPanModeActive) {
      viewportArea.classList.remove('pan-mode');
    }
  }
});

// Mouse Wheel Zoom & Pan handling
viewportArea.addEventListener('wheel', (e) => {
  const isInsideScrollableCards = e.target.closest('.column-cards');

  // If user holds Ctrl OR is in pan mode OR scrolled over background/header (not inside scrollable card list)
  if (e.ctrlKey || isPanModeActive || !isInsideScrollableCards) {
    e.preventDefault();
    const zoomDelta = -e.deltaY * ZOOM_CONFIG.WHEEL_FACTOR;
    const targetZoom = zoom * (1 + zoomDelta);
    zoomAtPoint(e.clientX, e.clientY, targetZoom);
  }
}, { passive: false });

// Sin menú contextual en el lienzo: el botón derecho mueve el lienzo
viewportArea.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input, textarea')) e.preventDefault();
});

// Pan with Mouse Drag
viewportArea.addEventListener('mousedown', (e) => {
  // Check if target should initiate panning
  const isCard = e.target.closest('.kanban-card');
  const isBtn = e.target.closest('button, input, select, textarea, .col-btn');
  const isScrollbar = e.target.closest('.column-cards');

  // Middle mouse click, space pressed, pan tool active, or clicking empty board background
  // Botón derecho o central, Espacio o herramienta Mano: mover el lienzo.
  // El botón izquierdo queda para seleccionar.
  const shouldPan = e.button === 1 || e.button === 2 || ((isSpacePressed || isPanModeActive) && e.button === 0);

  if (shouldPan) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    initialPanX = panX;
    initialPanY = panY;
    viewportArea.classList.add('is-panning');
    e.preventDefault();
  }
});

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    panX = initialPanX + dx;
    panY = initialPanY + dy;
    applyTransform();
  }
});

window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    viewportArea.classList.remove('is-panning');
  }
});

// =============================================================================
// 3. Touch Gestures Engine (Pinch to Zoom & Touch Pan on Mobile)
// =============================================================================

let initialPinchDistance = 0;
let initialPinchZoom = 1.0;
let pinchMidpoint = { x: 0, y: 0 };
let isTouchPanning = false;
let cancelSelectGesture = null; // cancela la selección o arrastre en curso (al poner un segundo dedo)
let touchStartX = 0;
let touchStartY = 0;

function getTouchesDistance(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

function getTouchesMidpoint(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2
  };
}

// Gestos con el dedo: dos dedos mueven el lienzo (y pellizcar hace zoom);
// un dedo selecciona y arrastra objetos (salvo con la herramienta Mano)
viewportArea.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    // El primer dedo pudo empezar una selección o un arrastre: se cancela
    if (cancelSelectGesture) cancelSelectGesture();
    isTouchPanning = false;
    initialPinchDistance = getTouchesDistance(e.touches[0], e.touches[1]);
    initialPinchZoom = zoom;
    pinchMidpoint = getTouchesMidpoint(e.touches[0], e.touches[1]);
    initialPanX = panX;
    initialPanY = panY;
    isPanning = false;
    return;
  }

  // Un dedo solo mueve el lienzo con la herramienta Mano
  if (e.touches.length === 1 && !dragState.active && !isDrawingTool() && !selectGestureActive) {
    const isInput = e.target.closest('button, input, select, textarea');
    if (isPanModeActive && !isInput) {
      isTouchPanning = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      initialPanX = panX;
      initialPanY = panY;
    }
  }
}, { passive: false });

viewportArea.addEventListener('touchmove', (e) => {
  // Handle 2-finger pinch zoom
  if (e.touches.length === 2 && initialPinchDistance > 0) {
    e.preventDefault();
    const currentDist = getTouchesDistance(e.touches[0], e.touches[1]);
    const factor = currentDist / initialPinchDistance;
    const targetZoom = initialPinchZoom * factor;

    const currentMidpoint = getTouchesMidpoint(e.touches[0], e.touches[1]);
    // Apply zoom centered at current midpoint
    zoomAtPoint(currentMidpoint.x, currentMidpoint.y, targetZoom);

    // El lienzo sigue a los dos dedos
    const dx = currentMidpoint.x - pinchMidpoint.x;
    const dy = currentMidpoint.y - pinchMidpoint.y;
    panX += dx;
    panY += dy;
    pinchMidpoint = currentMidpoint;
    applyTransform();
    return;
  }

  // Handle 1-finger canvas touch pan
  if (isTouchPanning && e.touches.length === 1) {
    e.preventDefault();
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    panX = initialPanX + dx;
    panY = initialPanY + dy;
    applyTransform();
    return;
  }

  // Seleccionando o arrastrando con un dedo: que el navegador no desplace la página
  if (selectGestureActive && e.touches.length === 1) e.preventDefault();
}, { passive: false });

viewportArea.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) {
    initialPinchDistance = 0;
  }
  if (e.touches.length === 0) {
    isTouchPanning = false;
  }
});

// =============================================================================
// 4. Unified Mobile & Desktop Drag & Drop Engine (Cards)
// =============================================================================

const dragState = {
  active: false,
  cardId: null,
  sourceColId: null,
  cardElement: null,
  ghostElement: null,
  placeholder: null,
  targetColId: null,
  targetIndex: -1,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
  isPointerDown: false,
  touchTimer: null,
  lastX: 0,
  lastY: 0,
  scrollContainer: null, // columna bajo la tarjeta, para desplazarla sola cerca de sus bordes
  autoScrollRaf: null
};

const CARD_LONG_PRESS_MS = 350; // tiempo que hay que mantener el dedo para tomar una tarjeta

// Create a visual drop indicator
function createPlaceholder(height = 64) {
  const ph = document.createElement('div');
  ph.className = 'drop-placeholder';
  ph.style.height = `${height}px`;
  return ph;
}

function startCardDrag(cardEl, clientX, clientY) {
  const cardId = cardEl.dataset.taskId;
  const colEl = cardEl.closest('.kanban-column');
  const sourceColId = colEl ? colEl.dataset.columnId : null;
  if (!cardId || !sourceColId) return;

  if (typeof hidePeek === 'function') hidePeek();
  dragState.active = true;
  dragState.cardId = cardId;
  dragState.sourceColId = sourceColId;
  dragState.cardElement = cardEl;
  dragState.targetColId = sourceColId;

  const cardRect = cardEl.getBoundingClientRect();
  dragState.offsetX = clientX - cardRect.left;
  dragState.offsetY = clientY - cardRect.top;

  // Create Drag Ghost Clone
  const ghost = cardEl.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${cardRect.width}px`;
  ghost.style.left = `${clientX - dragState.offsetX}px`;
  ghost.style.top = `${clientY - dragState.offsetY}px`;
  document.body.appendChild(ghost);
  dragState.ghostElement = ghost;

  // Create Placeholder
  dragState.placeholder = createPlaceholder(cardRect.height);
  cardEl.parentNode.insertBefore(dragState.placeholder, cardEl.nextSibling);

  // Mark original card
  cardEl.classList.add('is-dragging');

  // Trigger gentle vibration if supported
  if (navigator.vibrate) navigator.vibrate(35);
}

// Mientras se arrastra una tarjeta, la columna se desplaza sola si la tarjeta se acerca a su borde
// de arriba o de abajo (más rápido mientras más cerca), para poder ordenarla en columnas largas
const CARD_AUTOSCROLL_EDGE = 70;  // px de pantalla desde el borde donde empieza a desplazarse
const CARD_AUTOSCROLL_MAX = 18;   // px de pantalla por cuadro, con la tarjeta en el borde mismo

function startCardAutoScroll() {
  if (!dragState.autoScrollRaf) dragState.autoScrollRaf = requestAnimationFrame(cardAutoScrollStep);
}

function stopCardAutoScroll() {
  if (dragState.autoScrollRaf) cancelAnimationFrame(dragState.autoScrollRaf);
  dragState.autoScrollRaf = null;
  dragState.scrollContainer = null;
}

// Cerca de los bordes de la pantalla el lienzo se desplaza solo, para llevar la tarea (o cualquier
// objeto, o una columna) a lugares alejados
const CARD_PAN_EDGE = 60;   // px de pantalla desde el borde del lienzo
const CARD_PAN_MAX = 16;    // px de pantalla por cuadro, con el puntero en el borde mismo

function cardEdgePanStep() {
  return edgePanStep(dragState.lastX, dragState.lastY);
}

// Mientras se arrastra un objeto o una columna el lienzo avanza solo en los bordes; onPan vuelve a
// poner lo arrastrado bajo el puntero. Devuelve la función que lo detiene
function startEdgeAutoPan(getPoint, onPan) {
  let raf = requestAnimationFrame(function step() {
    const p = getPoint();
    if (p && edgePanStep(p.x, p.y)) onPan();
    raf = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(raf);
}

// Avanza el lienzo un cuadro si (x, y) está cerca de un borde; devuelve si se movió
function edgePanStep(x, y) {
  const vp = viewportArea.getBoundingClientRect();
  const pull = (dist) => Math.min(1, Math.max(0, dist) / CARD_PAN_EDGE);
  let dx = 0;
  let dy = 0;
  if (x < vp.left + CARD_PAN_EDGE) dx = pull(vp.left + CARD_PAN_EDGE - x);
  else if (x > vp.right - CARD_PAN_EDGE) dx = -pull(x - (vp.right - CARD_PAN_EDGE));
  if (y < vp.top + CARD_PAN_EDGE) dy = pull(vp.top + CARD_PAN_EDGE - y);
  else if (y > vp.bottom - CARD_PAN_EDGE) dy = -pull(y - (vp.bottom - CARD_PAN_EDGE));
  if (!dx && !dy) return false;
  panX += dx * CARD_PAN_MAX;
  panY += dy * CARD_PAN_MAX;
  applyTransform();
  return true;
}

function cardAutoScrollStep() {
  if (!dragState.active) { dragState.autoScrollRaf = null; return; }
  // El lienzo se movió bajo el puntero: se recalcula sobre qué columna está la tarjeta
  if (cardEdgePanStep()) updateCardDrag(dragState.lastX, dragState.lastY);
  const box = dragState.scrollContainer;
  if (box && box.scrollHeight > box.clientHeight) {
    const r = box.getBoundingClientRect();
    const edge = Math.min(CARD_AUTOSCROLL_EDGE, r.height / 3);
    const y = dragState.lastY;
    let speed = 0;
    if (y < r.top + edge) speed = -Math.min(1, (r.top + edge - y) / edge);
    else if (y > r.bottom - edge) speed = Math.min(1, (y - (r.bottom - edge)) / edge);
    if (speed) {
      const scale = (r.height / box.offsetHeight) || 1; // zoom del lienzo
      const before = box.scrollTop;
      box.scrollTop += (speed * CARD_AUTOSCROLL_MAX) / scale;
      // El contenido se movió bajo el dedo: se recalcula dónde caería la tarjeta
      if (box.scrollTop !== before) updateCardDrag(dragState.lastX, dragState.lastY);
    }
  }
  dragState.autoScrollRaf = requestAnimationFrame(cardAutoScrollStep);
}

function updateCardDrag(clientX, clientY) {
  if (!dragState.active || !dragState.ghostElement) return;
  dragState.lastX = clientX;
  dragState.lastY = clientY;
  startCardAutoScroll();

  // Move ghost
  dragState.ghostElement.style.left = `${clientX - dragState.offsetX}px`;
  dragState.ghostElement.style.top = `${clientY - dragState.offsetY}px`;

  // Find droppable column & position under pointer
  // Temporarily hide ghost to inspect elements beneath it
  dragState.ghostElement.style.display = 'none';
  const elemBelow = document.elementFromPoint(clientX, clientY);
  dragState.ghostElement.style.display = '';

  const targetColumn = elemBelow ? elemBelow.closest('.kanban-column') : null;
  dragState.scrollContainer = targetColumn ? targetColumn.querySelector('.column-cards') : null;
  if (!targetColumn) {
    // Fuera de las columnas (lienzo vacío, otro objeto…): si se suelta aquí, la tarea vuelve a su lugar
    returnPlaceholderToOrigin();
    return;
  }
  if (targetColumn) {
    const targetColId = targetColumn.dataset.columnId;
    const cardsContainer = targetColumn.querySelector('.column-cards');
    if (!cardsContainer) return;

    restoreEmptyStateIfLeaving(cardsContainer);
    dragState.targetColId = targetColId;

    // Determine target index inside column
    const cards = Array.from(cardsContainer.querySelectorAll('.kanban-card:not(.is-dragging)'));
    let insertBeforeCard = null;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) {
        insertBeforeCard = card;
        break;
      }
    }

    if (insertBeforeCard) {
      cardsContainer.insertBefore(dragState.placeholder, insertBeforeCard);
    } else {
      cardsContainer.appendChild(dragState.placeholder);
    }

    // Hide empty state while placeholder is in column
    const emptyState = cardsContainer.querySelector('.column-empty');
    if (emptyState) emptyState.style.display = 'none';
  }
}

// Si el hueco deja una columna vacía, vuelve a mostrar su aviso de "sin tareas"
function restoreEmptyStateIfLeaving(nextContainer) {
  const ph = dragState.placeholder;
  const prev = ph && ph.parentNode;
  if (!prev || prev === nextContainer) return;
  const emptyState = prev.querySelector('.column-empty');
  const others = prev.querySelectorAll('.kanban-card:not(.is-dragging)').length;
  if (emptyState && others === 0 && prev !== (dragState.cardElement && dragState.cardElement.parentNode)) emptyState.style.display = '';
}

// Devuelve el hueco a donde estaba la tarjeta: soltar fuera de una columna no la mueve
function returnPlaceholderToOrigin() {
  const card = dragState.cardElement;
  const ph = dragState.placeholder;
  if (!card || !ph || !card.parentNode) return;
  restoreEmptyStateIfLeaving(card.parentNode);
  if (card.nextSibling !== ph) card.after(ph);
  dragState.targetColId = dragState.sourceColId;
}

// ----- Vista rápida: con el mouse quieto sobre una tarjeta se ve todo su contenido sin abrirla -----
const PEEK_DELAY_MS = 600;
const PEEK_PRIORITY = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja', note: 'Nota', reminder: '🔔 Recordatorio' };
let peekEl = null;
let peekTimer = null;
let peekHideTimer = null;
let peekTaskId = null;

function peekPopup() {
  if (!peekEl) {
    peekEl = document.createElement('div');
    peekEl.className = 'card-peek';
    peekEl.hidden = true;
    peekEl.addEventListener('pointerenter', () => clearTimeout(peekHideTimer));
    peekEl.addEventListener('pointerleave', () => scheduleHidePeek());
    peekEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(peekEl);
  }
  return peekEl;
}

function hidePeek() {
  clearTimeout(peekTimer);
  clearTimeout(peekHideTimer);
  peekTaskId = null;
  if (peekEl) peekEl.hidden = true;
}

function scheduleHidePeek() {
  clearTimeout(peekTimer);
  clearTimeout(peekHideTimer);
  peekHideTimer = setTimeout(hidePeek, 150);
}

function showPeek(card) {
  const task = tasks.find(t => t.id === card.dataset.taskId);
  if (!task || dragState.active || selectGestureActive || !document.body.contains(card)) return;
  const col = columns.find(c => c.id === task.columnId);
  const board = col ? boards.find(b => b.id === col.boardId) : null;
  const subs = task.subtasks || [];
  const done = subs.filter(s => s.completed).length;
  const imgs = task.images || [];
  const today = getRelativeDate(0);
  const dueClass = task.dueDate && !task.completed && task.dueDate < today ? 'is-overdue' : (task.dueDate === today ? 'is-today' : '');
  const el = peekPopup();
  el.innerHTML = `
    <div class="card-peek-top">
      <span class="priority-badge priority-${effectivePriority(task)}">${PEEK_PRIORITY[effectivePriority(task)]}</span>${task.repeat ? `<span class="repeat-badge">🔁 ${REPEAT_LABELS[task.repeat]}</span>` : ''}
      ${task.completed ? '<span class="card-peek-done">✓ Completada</span>' : ''}
      ${task.dueDate ? `<span class="card-due-date ${dueClass}">📅 ${escapeHtml(task.dueDate)}</span>` : ''}
    </div>
    <h4 class="card-peek-title">${escapeHtml(task.title)}</h4>
    <div class="card-peek-where">${escapeHtml([board && board.title, col && col.title].filter(Boolean).join(' › '))}</div>
    ${(task.tags || []).length ? `<div class="card-tags">${task.tags.map(t => tagPillHtml(t)).join('')}</div>` : ''}
    ${task.description ? `<p class="card-peek-desc">${linkify(task.description, task.linkNames)}</p>` : ''}
    ${youtubePreviews([task.description, ...subs.map(s => s.text)].join('\n'), 3)}
    ${subs.length ? `
      <div class="card-peek-subs">
        <div class="card-peek-label">Subtareas ${done}/${subs.length}</div>
        <ul>${subs.map(s => `<li class="${s.completed ? 'is-done' : ''}">${s.completed ? '☑' : '☐'} ${linkify(s.text, task.linkNames)}</li>`).join('')}</ul>
      </div>` : ''}
    ${imgs.length ? `<div class="card-peek-imgs">${imgs.slice(0, 6).map(i => `<img alt="" data-img-id="${escapeHtml(i.id)}">`).join('')}${imgs.length > 6 ? `<span>+${imgs.length - 6}</span>` : ''}</div>` : ''}
    ${!task.description && !subs.length && !imgs.length ? '<p class="card-peek-empty">Sin descripción ni subtareas.</p>' : ''}`;
  el.querySelectorAll('img[data-img-id]').forEach(img => getImageVariantUrl(img.dataset.imgId, 160).then(url => { if (url) img.src = url; }));

  // Al lado de la tarjeta: a la derecha o, si no cabe, a la izquierda; siempre dentro de la pantalla
  el.hidden = false;
  el.style.left = '0px';
  el.style.top = '0px';
  const r = card.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const gap = 10;
  let left = r.right + gap;
  if (left + w > window.innerWidth - 8) left = r.left - gap - w;
  if (left < 8) left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  peekTaskId = task.id;
}

kanbanBoard.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const card = e.target.closest('.kanban-card');
  if (!card) return;
  clearTimeout(peekHideTimer);
  if (peekTaskId === card.dataset.taskId) return;
  clearTimeout(peekTimer);
  if (peekEl && !peekEl.hidden) hidePeek();
  peekTimer = setTimeout(() => showPeek(card), PEEK_DELAY_MS);
});
kanbanBoard.addEventListener('pointerout', (e) => {
  if (e.pointerType !== 'mouse') return;
  const card = e.target.closest('.kanban-card');
  if (!card || card.contains(e.relatedTarget)) return;
  if (peekEl && peekEl.contains(e.relatedTarget)) return;
  scheduleHidePeek();
});
// Cualquier clic, rueda, tecla o arrastre la cierra
const insidePeek = (target) => !!peekEl && target instanceof Node && peekEl.contains(target);
window.addEventListener('pointerdown', (e) => { if (!insidePeek(e.target)) hidePeek(); }, true);
window.addEventListener('wheel', (e) => { if (!insidePeek(e.target)) hidePeek(); }, { passive: true, capture: true });
window.addEventListener('keydown', hidePeek, true);
window.addEventListener('blur', hidePeek);

// La tarjeta recién soltada rebota y brilla un momento para ver dónde quedó
function highlightDroppedCard(taskId) {
  const card = kanbanBoard.querySelector(`.kanban-card[data-task-id="${taskId}"]`);
  if (!card) return;
  card.classList.remove('just-dropped');
  void card.offsetWidth; // reinicia la animación si se suelta dos veces seguidas
  card.classList.add('just-dropped');
  card.addEventListener('animationend', (e) => {
    if (e.animationName === 'card-drop-bounce') card.classList.remove('just-dropped');
  });
}

function finishCardDrag() {
  if (!dragState.active) return;
  stopCardAutoScroll();

  const { cardId, sourceColId, targetColId, placeholder, cardElement, ghostElement } = dragState;

  if (ghostElement && ghostElement.parentNode) {
    ghostElement.parentNode.removeChild(ghostElement);
  }

  if (cardElement) {
    cardElement.classList.remove('is-dragging');
  }

  if (targetColId && placeholder && placeholder.parentNode) {
    // Calculate new index in target column
    const parent = placeholder.parentNode;
    // Posición entre las demás tarjetas (sin contar la que se arrastra, que moveTask saca antes de insertarla)
    const cardsInCol = Array.from(parent.children).filter(el => (el.classList.contains('kanban-card') && el !== cardElement) || el === placeholder);
    const newIndex = cardsInCol.indexOf(placeholder);

    // Remove placeholder
    placeholder.parentNode.removeChild(placeholder);

    // Apply move in data model
    moveTask(cardId, sourceColId, targetColId, newIndex);
    highlightDroppedCard(cardId);
  } else if (placeholder && placeholder.parentNode) {
    placeholder.parentNode.removeChild(placeholder);
  }

  // Reset drag state
  dragState.active = false;
  dragState.cardId = null;
  dragState.ghostElement = null;
  dragState.placeholder = null;
  dragState.cardElement = null;
  dragState.isPointerDown = false;
}

// Attach Pointer Events to KanBan Board for smooth mouse & touch dragging
kanbanBoard.addEventListener('pointerdown', (e) => {
  if (isPanModeActive || isSpacePressed) return;

  // Con el dedo lo maneja el arrastre táctil (pulsación larga), más abajo
  if (e.pointerType === 'touch') return;

  const card = e.target.closest('.kanban-card');
  // Los links de la descripción y las miniaturas también sirven para arrastrar la tarjeta (un clic corto los abre)
  const isInteractive = e.target.closest('button, input, select, textarea, a, .card-subtask, .card-check-btn, .card-menu-btn') && !e.target.closest('.card-desc a, .yt-previews a');

  if (card && !isInteractive) {
    dragState.isPointerDown = true;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;

    const onPointerMove = (moveEvt) => {
      const dist = Math.hypot(moveEvt.clientX - dragState.startX, moveEvt.clientY - dragState.startY);
      if (!dragState.active && dist > 6) {
        startCardDrag(card, moveEvt.clientX, moveEvt.clientY);
      }
      if (dragState.active) {
        updateCardDrag(moveEvt.clientX, moveEvt.clientY);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      finishCardDrag();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }
});

// Touch specific fallback for mobile browsers that do not fire pointermove on touch
kanbanBoard.addEventListener('touchstart', (e) => {
  if (isPanModeActive || isDrawingTool() || e.touches.length > 1) return;

  const card = e.target.closest('.kanban-card');
  // Los links de la descripción y las miniaturas también sirven para arrastrar la tarjeta (un clic corto los abre)
  const isInteractive = e.target.closest('button, input, select, textarea, a, .card-subtask, .card-check-btn, .card-menu-btn') && !e.target.closest('.card-desc a, .yt-previews a');

  if (card && !isInteractive) {
    const touch = e.touches[0];
    dragState.startX = touch.clientX;
    dragState.startY = touch.clientY;
    let lastX = touch.clientX;
    let lastY = touch.clientY;

    // Con el dedo, la tarjeta se toma manteniéndola presionada; deslizar sin esperar hace scroll en la columna
    card.classList.add('is-pressing');
    let pressTimer = setTimeout(() => {
      pressTimer = null;
      card.classList.remove('is-pressing');
      startCardDrag(card, lastX, lastY);
    }, CARD_LONG_PRESS_MS);
    const cancelPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      card.classList.remove('is-pressing');
    };

    const onTouchMove = (moveEvt) => {
      if (moveEvt.touches.length > 1) { cancelPress(); return; }
      const t = moveEvt.touches[0];
      lastX = t.clientX;
      lastY = t.clientY;

      if (!dragState.active) {
        // Se movió antes de tiempo: es scroll, no arrastre
        if (pressTimer && Math.hypot(t.clientX - dragState.startX, t.clientY - dragState.startY) > 10) cancelPress();
        return;
      }
      moveEvt.preventDefault(); // Prevent scrolling while dragging card
      updateCardDrag(t.clientX, t.clientY);
    };

    const onTouchEnd = () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      cancelPress();
      if (dragState.active) {
        // Al soltar no debe abrirse la tarea por el clic que sigue
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
      }
      finishCardDrag();
    };

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
  }
}, { passive: true });

// Move Task in Model
function moveTask(taskId, sourceColId, targetColId, targetIndex) {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const task = tasks[taskIndex];
  tasks.splice(taskIndex, 1);

  task.columnId = targetColId;

  // If moved to Done column, automatically mark completed
  if (isDoneColumn(targetColId)) {
    task.completed = true;
    showToast(`¡Tarea "${task.title.substring(0, 24)}..." completada! 🎉`, 'success');
  } else if (isDoneColumn(sourceColId) && !isDoneColumn(targetColId)) {
    task.completed = false;
  }

  // Find tasks belonging to target column to position correctly
  const colTasks = tasks.filter(t => t.columnId === targetColId);
  if (targetIndex >= 0 && targetIndex < colTasks.length) {
    const refTask = colTasks[targetIndex];
    const globalRefIdx = tasks.indexOf(refTask);
    tasks.splice(globalRefIdx, 0, task);
  } else {
    tasks.push(task);
  }

  persist();
  renderBoard();
}

// =============================================================================
// 5. Board Rendering & UI Generation
// =============================================================================

// Redibuja el tablero conservando el scroll de cada columna (por ejemplo, al soltar una tarea
// en una columna larga, la columna queda donde estaba en vez de volver al principio)
function renderBoard() {
  applyCanvasColor();
  const projectId = activeProjectId;
  const scrolls = new Map();
  kanbanBoard.querySelectorAll('.kanban-column').forEach(col => {
    const box = col.querySelector('.column-cards');
    if (box && box.scrollTop) scrolls.set(col.dataset.columnId, box.scrollTop);
  });
  renderBoardContent();
  if (!scrolls.size || projectId !== activeProjectId) return;
  kanbanBoard.querySelectorAll('.kanban-column').forEach(col => {
    const box = col.querySelector('.column-cards');
    const top = scrolls.get(col.dataset.columnId);
    if (box && top) box.scrollTop = top;
  });
}

// Un tablero se puede agrandar o achicar entero, con sus columnas y tareas (board.scale, al escalar varios
// objetos a la vez). Se dibuja con una transformación, así que sus medidas en el lienzo son offsetWidth * escala.
function boardScale(b) {
  return b && b.scale > 0 ? b.scale : 1;
}

function applyBoardScale(el, b) {
  const s = boardScale(b);
  el.style.transformOrigin = s === 1 ? '' : '0 0';
  el.style.transform = s === 1 ? '' : `scale(${s})`;
}

function renderBoardContent() {
  kanbanBoard.innerHTML = '';
  refreshTagFilterOptions();
  ensureBoards();

  // Un lienzo puede no tener tableros: queda vacío (textos, dibujos, flechas e imágenes siguen funcionando)
  if (boards.length === 0) {
    updateStats();
    return;
  }

  // Cada tablero es un marco con sus columnas hijas
  boards.forEach(board => {
    const boardCols = columns.filter(c => c.boardId === board.id);
    const frame = document.createElement('section');
    frame.className = `board-frame ${board.id === focusedBoardId ? 'is-focused' : ''}`;
    frame.dataset.boardId = board.id;
    frame.style.left = `${board.x}px`;
    frame.style.top = `${board.y}px`;
    applyBoardScale(frame, board);
    frame.style.setProperty('--board-color', board.color || '#6366f1');
    // Ancho aproximado del tablero (limita el tamaño de su pestaña de imagen al alejar la vista)
    frame.style.setProperty('--board-w', `${Math.max(360, boardCols.length * 354 + 48 + 260)}px`);

    const taskCount = tasks.filter(t => boardCols.some(c => c.id === t.columnId)).length;
    frame.innerHTML = `
      <header class="board-header" title="Arrastra para mover el tablero con todas sus columnas">
        <span class="board-color-dot"></span>
        <h2 class="board-title">${escapeHtml(board.title)}</h2>
        <span class="board-count">${boardCols.length} col · ${taskCount} tareas</span>
        <div class="board-actions">
          <button type="button" class="col-btn" data-board-action="add-column" title="Agregar columna">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button type="button" class="col-btn" data-board-action="edit" title="Editar tablero">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
          </button>
        </div>
      </header>
      <div class="board-columns"></div>
    `;
    // Imagen del tablero: pestaña arriba a la izquierda (para reconocerlo y arrastrarlo; no se achica demasiado al alejar)
    if (board.image) {
      frame.insertAdjacentHTML('afterbegin', `<div class="board-image-tab" title="Arrastra para mover el tablero"><img data-board-img="${escapeHtml(board.image)}" alt="" draggable="false"></div>`);
      hydrateBoardImages(frame);
    }
    frame.querySelector('[data-board-action="add-column"]').addEventListener('click', () => openColumnModal(null, board.id));
    frame.querySelector('[data-board-action="edit"]').addEventListener('click', () => openBoardModal(board.id));

    // Filtros propios de este tablero
    const filters = getBoardFilters(board);
    if (boardHasFilters(board)) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'board-filter-badge';
      badge.title = 'Este tablero tiene filtros activos. Clic para quitarlos';
      badge.innerHTML = 'Filtrado <span>&times;</span>';
      badge.addEventListener('click', () => {
        board.filters = { q: '', priority: 'all', tag: 'all' };
        persist();
        renderBoard();
      });
      frame.querySelector('.board-count').after(badge);
    }

    const colsContainer = frame.querySelector('.board-columns');
    boardCols.forEach(col => {
      let colTasks = tasks.filter(t => t.columnId === col.id && taskMatchesFilters(t, filters));
      if (col.sortByPriority) colTasks = sortByPriority(colTasks);
      colsContainer.appendChild(createColumnElement(col, colTasks));
    });

    // Botón para agregar columna al final del tablero
    const addColTile = document.createElement('button');
    addColTile.type = 'button';
    addColTile.className = 'add-column-tile';
    addColTile.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>Agregar columna</span>
    `;
    addColTile.addEventListener('click', () => openColumnModal(null, board.id));
    colsContainer.appendChild(addColTile);

    kanbanBoard.appendChild(frame);
  });

  updateStats();
  applySelectionVisuals();
}

// ----- Tareas repetitivas y prioridad Recordatorio -----
// Una tarea repetitiva (cada día, semana o mes), al completarse, vuelve sola a su columna cuando
// empieza el siguiente período, con el vencimiento del nuevo período. Nunca se archiva.
// La prioridad 🔔 Recordatorio se ve como Recordatorio y sube a Alta y a Urgente a medida que se
// acerca su vencimiento (o pasa).
const REPEAT_LABELS = { daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual' };
const REPEAT_DAYS = { daily: 1, weekly: 7, monthly: 30 };

function dateToStr(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function strToDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Próximo vencimiento de una tarea repetitiva desde una fecha (incluida)
function nextRepeatDue(task, fromStr) {
  const from = strToDate(fromStr);
  const anchor = strToDate(task.repeatAnchor || task.dueDate || fromStr);
  if (task.repeat === 'daily') return fromStr;
  if (task.repeat === 'weekly') {
    const d = new Date(anchor);
    while (d < from) d.setDate(d.getDate() + 7);
    return dateToStr(d);
  }
  if (task.repeat === 'monthly') {
    if (anchor >= from) return dateToStr(anchor);
    const day = anchor.getDate();
    let y = from.getFullYear();
    let m = from.getMonth();
    const inMonth = (yy, mm) => new Date(yy, mm, Math.min(day, new Date(yy, mm + 1, 0).getDate()));
    let d = inMonth(y, m);
    if (d < from) { m++; if (m > 11) { m = 0; y++; } d = inMonth(y, m); }
    return dateToStr(d);
  }
  return fromStr;
}

// Prioridad que se muestra (y con la que se ordena y filtra)
function effectivePriority(t) {
  const p = t.priority || 'medium';
  if (p !== 'reminder') return p;
  if (t.completed || !t.dueDate) return 'reminder';
  const end = strToDate(t.dueDate);
  end.setHours(23, 59, 59, 999);
  const remaining = end - Date.now();
  const ratio = remaining / ((REPEAT_DAYS[t.repeat] || 7) * 86400000);
  if (remaining <= 0 || ratio <= 0.2) return 'urgent';
  if (ratio <= 0.5) return 'high';
  return 'reminder';
}

// Vuelve a abrir las repetitivas completadas cuyo período ya pasó (en todos los proyectos de este espacio)
function runRecurring() {
  const today = getRelativeDate(0);
  let changed = false;
  let activeChanged = false;
  projects.forEach(p => {
    const isActive = p.id === activeProjectId;
    const list = isActive ? tasks : (p.tasks || []);
    const cols = isActive ? columns : (p.columns || []);
    list.forEach(t => {
      if (!t.repeat) return;
      if (!t.dueDate) t.dueDate = nextRepeatDue(t, today);
      if (!(t.completed && t.dueDate < today)) return;
      t.completed = false;
      delete t.completedAt;
      const current = cols.find(c => c.id === t.columnId);
      const back = cols.find(c => c.id === t.repeatColumnId && !isDoneColumn(c.id));
      const sameBoard = current && cols.find(c => c.boardId === current.boardId && !isDoneColumn(c.id));
      t.columnId = (back || sameBoard || current || { id: t.columnId }).id;
      t.dueDate = nextRepeatDue(t, today);
      changed = true;
      if (isActive) activeChanged = true; else p.updatedAt = Date.now();
    });
  });
  if (!changed) return;
  if (activeChanged) persist(); else saveData(STORAGE_KEYS.PROJECTS, projects);
  renderBoard();
}
setTimeout(runRecurring, 1500);
setInterval(runRecurring, 60 * 1000);
// Widget de Windows: al abrir y cada 10 minutos (también recoge lo que llega de otros dispositivos)
setTimeout(() => { try { scheduleWidgetUpdate(); } catch (e) {} }, 5000);
setInterval(() => { try { scheduleWidgetUpdate(); } catch (e) {} }, 10 * 60 * 1000);
// La prioridad Recordatorio cambia con la hora: se redibuja cada 10 minutos si hay alguna
setInterval(() => { if (tasks.some(t => t.priority === 'reminder') && !document.querySelector('.modal-backdrop[style*="flex"]')) renderBoard(); }, 10 * 60 * 1000);

// Columnas con "Ordenar por prioridad": las más críticas arriba (las de igual prioridad conservan su orden)
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, reminder: 3.5, note: 4 };
function sortByPriority(list) {
  return list
    .map((t, i) => ({ t, i, r: PRIORITY_RANK[effectivePriority(t)] ?? 2 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.t);
}

window.toggleColumnPrioritySort = function (colId, e) {
  if (e) e.stopPropagation();
  const col = columns.find(c => c.id === colId);
  if (!col) return;
  col.sortByPriority = !col.sortByPriority;
  if (!col.sortByPriority) delete col.sortByPriority;
  persist();
  renderBoard();
  showToast(col.sortByPriority ? `"${col.title}": ordenada por prioridad (más críticas arriba)` : `"${col.title}": orden manual`, 'info');
};

function createColumnElement(col, colTasks) {
  const columnEl = document.createElement('section');
  columnEl.className = 'kanban-column';
  columnEl.dataset.columnId = col.id;
  columnEl.style.setProperty('--col-accent', col.color || '#6366f1');

  // Header
  const headerEl = document.createElement('div');
  headerEl.className = 'column-header';
  headerEl.innerHTML = `
    <div class="column-title-group">
      <span class="column-color-dot"></span>
      <h3 class="column-title" title="${escapeHtml(col.title)}">${escapeHtml(col.title)}</h3>
      <span class="column-count-badge">${colTasks.length}</span>
    </div>
    <div class="column-actions">
      <button class="col-btn col-sort-btn ${col.sortByPriority ? 'is-on' : ''}" title="${col.sortByPriority ? 'Ordenada por prioridad. Clic para volver al orden manual' : 'Ordenar por prioridad (más críticas arriba)'}" onclick="toggleColumnPrioritySort('${col.id}', event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16"></path><path d="M4 8l4-4 4 4"></path><line x1="14" y1="7" x2="21" y2="7"></line><line x1="14" y1="12" x2="19" y2="12"></line><line x1="14" y1="17" x2="17" y2="17"></line></svg>
      </button>
      <button class="col-btn" title="Añadir tarea a ${escapeHtml(col.title)}" onclick="openTaskModal(null, '${col.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button class="col-btn" title="Editar columna" onclick="openColumnModal('${col.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="1.5"></circle>
          <circle cx="19" cy="12" r="1.5"></circle>
          <circle cx="5" cy="12" r="1.5"></circle>
        </svg>
      </button>
    </div>
  `;

  // Cards Container
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'column-cards';

  if (colTasks.length === 0) {
    cardsContainer.innerHTML = `
      <div class="column-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 4"></rect>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <span>No hay tareas aquí</span>
      </div>
    `;
  } else {
    colTasks.forEach(task => {
      const cardEl = createCardElement(task);
      cardsContainer.appendChild(cardEl);
    });
  }

  // Footer Add Button
  const footerEl = document.createElement('div');
  footerEl.className = 'column-footer';
  footerEl.innerHTML = `
    <button class="btn-add-card" onclick="openTaskModal(null, '${col.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>Nueva Tarea</span>
    </button>
  `;

  columnEl.appendChild(headerEl);
  columnEl.appendChild(cardsContainer);
  columnEl.appendChild(footerEl);

  return columnEl;
}

const CARD_SUBTASKS_SHOWN = 5; // subtareas visibles en la tarjeta; el resto se resume en "+N más"

function createCardElement(task) {
  const card = document.createElement('article');
  card.className = `kanban-card ${task.completed ? 'is-completed' : ''}`;
  card.dataset.taskId = task.id;

  const priorityLabels = {
    urgent: 'Urgente',
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
    note: 'Nota',
    reminder: '🔔 Recordatorio'
  };
  const prio = effectivePriority(task);
  const reminderUp = task.priority === 'reminder' && prio !== 'reminder';

  // Subtasks progress calculation
  const totalSubtasks = task.subtasks ? task.subtasks.length : 0;
  const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
  const subtaskPercent = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  // Due date format & status
  let dueDateHtml = '';
  if (task.dueDate) {
    const today = getRelativeDate(0);
    const isOverdue = !task.completed && task.dueDate < today;
    const isToday = task.dueDate === today;
    const statusClass = isOverdue ? 'is-overdue' : (isToday ? 'is-today' : '');

    dueDateHtml = `
      <span class="card-due-date ${statusClass}" title="Vencimiento: ${task.dueDate}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        ${task.dueDate}
      </span>
    `;
  }

  // Tags HTML
  let tagsHtml = '';
  if (task.tags && task.tags.length > 0) {
    tagsHtml = `<div class="card-tags">` + 
      task.tags.map(tag => tagPillHtml(tag)).join('') + 
      `</div>`;
  }

  const taskImages = task.images || [];
  const coverHtml = taskImages.length > 0 ? `
    <div class="card-cover">
      <img alt="" draggable="false">
      ${taskImages.length > 1 ? `<span class="card-cover-count">📷 ${taskImages.length}</span>` : ''}
    </div>` : '';

  card.innerHTML = `
    ${coverHtml}
    <div class="card-top">
      <div class="card-top-left">
        <button class="card-check-btn" title="${task.completed ? 'Marcar pendiente' : 'Marcar completada'}" onclick="toggleTaskComplete('${task.id}', event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
        <span class="priority-badge priority-${prio}" ${reminderUp ? 'title="Recordatorio: subió de prioridad porque se acerca su vencimiento"' : ''}>
          ${reminderUp ? '🔔 ' : ''}${priorityLabels[prio]}
        </span>
        ${task.repeat ? `<span class="repeat-badge" title="Tarea repetitiva: vuelve sola cada período">🔁 ${REPEAT_LABELS[task.repeat]}</span>` : ''}
      </div>
      <div class="card-top-right">
        <button type="button" class="card-copy-btn" title="Copiar la descripción" aria-label="Copiar la descripción">
          ${COPY_ICON}
        </button>
        <button class="card-menu-btn" title="Editar tarea" onclick="openTaskModal('${task.id}', null, event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </button>
      </div>
    </div>

    <h4 class="card-title">${escapeHtml(task.title)}</h4>

    ${task.description ? `<p class="card-desc">${linkify(task.description, task.linkNames)}</p>` : ''}

    ${youtubePreviews([task.description, ...(task.subtasks || []).map(s => s.text)].join('\n'), 2, 'compact')}

    ${totalSubtasks > 0 ? `
      <div class="card-subtasks">
        <div class="subtasks-info">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            Subtareas
          </span>
          <span class="subtasks-info-right">
            ${completedSubtasks}/${totalSubtasks} (${subtaskPercent}%)
            <button type="button" class="card-subtasks-copy" title="Copiar todas las subtareas (numeradas)" aria-label="Copiar todas las subtareas">${COPY_ICON}</button>
          </span>
        </div>
        <div class="subtasks-progress-track">
          <div class="subtasks-progress-fill" style="width: ${subtaskPercent}%"></div>
        </div>
        <ul class="card-subtask-list">
          ${task.subtasks.slice(0, CARD_SUBTASKS_SHOWN).map(s => `
            <li class="card-subtask ${s.completed ? 'is-done' : ''}" data-subtask-id="${escapeHtml(s.id)}" title="${s.completed ? 'Marcar pendiente' : 'Marcar hecha'}">
              <span class="card-subtask-box">${s.completed ? '☑' : '☐'}</span><span class="card-subtask-text">${linkify(s.text, task.linkNames)}</span>
              <button type="button" class="card-subtask-copy" title="Copiar texto" aria-label="Copiar texto">${COPY_ICON}</button>
            </li>`).join('')}
          ${totalSubtasks > CARD_SUBTASKS_SHOWN ? `<li class="card-subtask-more">+${totalSubtasks - CARD_SUBTASKS_SHOWN} más</li>` : ''}
        </ul>
      </div>
    ` : ''}

    <div class="card-bottom">
      ${tagsHtml}
      ${dueDateHtml}
    </div>
  `;

  if (taskImages.length > 0) {
    const coverImg = card.querySelector('.card-cover img');
    coverImg.decoding = 'async';
    // La portada se ve chica: versión reducida (sin esperar si ya está lista, para que no parpadee)
    const coverCached = cachedImageVariant(taskImages[0].id, 480);
    if (coverCached) coverImg.src = coverCached;
    else getImageVariantUrl(taskImages[0].id, 480).then(url => { if (url) coverImg.src = url; });
  }

  // Tocar una subtarea en la tarjeta la marca hecha / pendiente sin abrir la tarea
  // (los links abren su página y el botón de copiar copia el texto, sin marcarla)
  card.querySelectorAll('.card-subtask').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = (task.subtasks || []).find(s => s.id === item.dataset.subtaskId);
      if (!st) return;
      if (e.target.closest('a')) return;
      if (e.target.closest('.card-subtask-copy')) {
        copyWithToast(st.text, 'Texto copiado');
        return;
      }
      st.completed = !st.completed;
      persist();
      renderBoard();
    });
  });

  // Copiar la descripción o todas las subtareas, sin abrir la tarea
  card.querySelector('.card-copy-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!(task.description || '').trim()) {
      showToast('Esta tarea no tiene descripción', 'info');
      return;
    }
    copyWithToast(task.description, 'Descripción copiada');
  });
  const copyAllSubs = card.querySelector('.card-subtasks-copy');
  if (copyAllSubs) copyAllSubs.addEventListener('click', (e) => {
    e.stopPropagation();
    copyWithToast(subtasksAsText(task.subtasks), 'Subtareas copiadas');
  });

  // Los links de la descripción abren su página sin abrir la tarea
  card.querySelectorAll('.card-desc a, .yt-preview, .yt-playlist a').forEach(a => a.addEventListener('click', (e) => e.stopPropagation()));

  // Clicking on card opens modal (unless check button or menu clicked)
  card.addEventListener('click', (e) => {
    if (!e.target.closest('button, input, select, a, .card-subtask')) {
      openTaskModal(task.id);
    }
  });

  return card;
}

// Toggle Task Complete Checkbox
window.toggleTaskComplete = function(taskId, e) {
  if (e) e.stopPropagation();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;

  // Al completarla pasa a la columna "Completadas" de su mismo tablero (si existe)
  const taskCol = columns.find(c => c.id === task.columnId);
  const boardId = taskCol ? taskCol.boardId : null;
  const boardCols = columns.filter(c => c.boardId === boardId);
  if (task.completed && !isDoneColumn(task.columnId)) {
    const doneCol = boardCols.find(c => isDoneColumn(c.id));
    if (doneCol) {
      task.columnId = doneCol.id;
      showToast(`¡"${task.title}" completada y movida a ${doneCol.title}! 🎉`, 'success');
    } else {
      showToast('Tarea marcada como lista', 'success');
    }
  } else if (!task.completed && isDoneColumn(task.columnId)) {
    const todoCol = boardCols.find(c => c.id === 'todo' || c.id.startsWith('todo-')) || boardCols[0];
    if (todoCol) task.columnId = todoCol.id;
    showToast('Tarea reactivada', 'info');
  }

  persist();
  renderBoard();
};

function updateStats() {
  if (typeof renderProjectSwitcher === 'function' && projectMenu && !projectMenu.hidden) renderProjectSwitcher();
  if (typeof updateContextBar === 'function') updateContextBar();
}

// =============================================================================
// 6. Task Modal (Create & Edit)
// =============================================================================

const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const modalTitle = document.getElementById('modalTitle');
const taskIdInput = document.getElementById('taskId');
const taskTitleInput = document.getElementById('taskTitleInput');
const taskDescInput = document.getElementById('taskDescInput');
const taskColumnSelect = document.getElementById('taskColumnSelect');
const taskPrioritySelect = document.getElementById('taskPrioritySelect');
const taskDueDate = document.getElementById('taskDueDate');
const taskHasDueDate = document.getElementById('taskHasDueDate');

// Activa o desactiva el campo de fecha según el checkbox
function setDueDateEnabled(enabled) {
  taskHasDueDate.checked = enabled;
  taskDueDate.disabled = !enabled;
  taskDueDate.required = enabled;
  if (enabled && !taskDueDate.value) {
    taskDueDate.value = getRelativeDate(0);
  }
}

// Guarda "Repetir" en la tarea: la fecha elegida es el primer vencimiento (y fija el día de la semana o del mes)
function applyRepeatFromModal(task) {
  const repeat = taskRepeatSelect.value;
  if (!repeat) {
    delete task.repeat;
    delete task.repeatAnchor;
    delete task.repeatColumnId;
    return;
  }
  const changed = task.repeat !== repeat || task.repeatAnchor !== task.dueDate;
  task.repeat = repeat;
  if (changed) task.repeatAnchor = task.dueDate || getRelativeDate(0);
  if (!task.dueDate) task.dueDate = nextRepeatDue(task, getRelativeDate(0));
  if (!isDoneColumn(task.columnId)) task.repeatColumnId = task.columnId;
}

// Repetir: al activarla, la tarea pasa a prioridad Recordatorio y lleva fecha (el primer vencimiento)
const taskRepeatSelect = document.getElementById('taskRepeatSelect');
function setRepeatField(value) {
  taskRepeatSelect.value = value || '';
  document.getElementById('taskRepeatHint').hidden = !value;
}
taskRepeatSelect.addEventListener('change', () => {
  const value = taskRepeatSelect.value;
  setRepeatField(value);
  if (!value) return;
  if (['medium', 'low', 'note'].includes(taskPrioritySelect.value)) taskPrioritySelect.value = 'reminder';
  if (!taskHasDueDate.checked) setDueDateEnabled(true);
});

taskHasDueDate.addEventListener('change', () => {
  setDueDateEnabled(taskHasDueDate.checked);
  if (taskHasDueDate.checked) taskDueDate.focus();
});
const tagPicker = document.getElementById('tagPicker');
const tagPickerToggle = document.getElementById('tagPickerToggle');
const tagPickerSelected = document.getElementById('tagPickerSelected');
const tagPickerPanel = document.getElementById('tagPickerPanel');
const tagSearchInput = document.getElementById('tagSearchInput');
const newTagColor = document.getElementById('newTagColor');
const createTagBtn = document.getElementById('createTagBtn');
const tagOptionList = document.getElementById('tagOptionList');

// ----- Selector de etiquetas -----
function renderTagPicker() {
  // Etiquetas seleccionadas (chips)
  if (currentModalTags.length === 0) {
    tagPickerSelected.innerHTML = '<span class="tag-picker-placeholder">Sin etiquetas — haz clic para elegir</span>';
  } else {
    tagPickerSelected.innerHTML = currentModalTags.map(name =>
      tagPillHtml(name, `<span class="tag-chip-remove" data-remove-tag="${escapeHtml(name)}" title="Quitar">&times;</span>`)
    ).join('');
  }

  // Lista desplegable
  const query = tagSearchInput.value.trim().toLowerCase();
  const visible = tagLibrary
    .filter(t => !query || t.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (visible.length === 0) {
    tagOptionList.innerHTML = `<li class="tag-option-empty">${tagLibrary.length === 0 ? 'Aún no tienes etiquetas. Escribe un nombre, elige un color y presiona Crear.' : 'Sin coincidencias. Presiona Crear para agregarla.'}</li>`;
  } else {
    tagOptionList.innerHTML = '';
    visible.forEach(tag => {
      const selected = currentModalTags.some(n => n.toLowerCase() === tag.name.toLowerCase());
      const li = document.createElement('li');
      li.className = `tag-option ${selected ? 'is-selected' : ''}`;
      li.innerHTML = `
        <label class="tag-option-main">
          <input type="checkbox" ${selected ? 'checked' : ''}>
          <span class="tag-pill tag-colored" style="--tag-color: ${tag.color}">${escapeHtml(tag.name)}</span>
        </label>
        <input type="color" class="tag-option-color" value="${tag.color}" title="Cambiar color">
        <button type="button" class="tag-option-delete" title="Eliminar etiqueta">&times;</button>
      `;
      li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleModalTag(tag.name));
      const colorInput = li.querySelector('.tag-option-color');
      colorInput.addEventListener('input', () => {
        tag.color = colorInput.value;
        li.querySelector('.tag-pill').style.setProperty('--tag-color', tag.color);
        tagPickerSelected.querySelectorAll('.tag-pill').forEach(p => {
          if (p.firstChild && p.firstChild.textContent.toLowerCase() === tag.name.toLowerCase()) p.style.setProperty('--tag-color', tag.color);
        });
      });
      colorInput.addEventListener('change', () => {
        saveData(STORAGE_KEYS.TAGS, tagLibrary);
        renderBoard();
      });
      li.querySelector('.tag-option-delete').addEventListener('click', () => deleteTag(tag));
      tagOptionList.appendChild(li);
    });
  }

  const exact = query && findTag(query);
  createTagBtn.disabled = !query || !!exact;
}

function toggleModalTag(name) {
  const idx = currentModalTags.findIndex(n => n.toLowerCase() === name.toLowerCase());
  if (idx >= 0) currentModalTags.splice(idx, 1);
  else currentModalTags.push(name);
  renderTagPicker();
}

function createTagFromInput() {
  const name = tagSearchInput.value.trim();
  if (!name) return;
  const existing = findTag(name);
  if (existing) {
    if (!currentModalTags.some(n => n.toLowerCase() === existing.name.toLowerCase())) toggleModalTag(existing.name);
  } else {
    tagLibrary.push({ id: generateId('tag'), name: name, color: newTagColor.value });
    saveData(STORAGE_KEYS.TAGS, tagLibrary);
    currentModalTags.push(name);
    showToast(`Etiqueta "${name}" creada`, 'success');
    // Sugerir otro color para la siguiente etiqueta
    newTagColor.value = TAG_DEFAULT_COLORS[tagLibrary.length % TAG_DEFAULT_COLORS.length];
  }
  tagSearchInput.value = '';
  renderTagPicker();
  tagSearchInput.focus();
}

async function deleteTag(tag) {
  const usage = projects.reduce((n, p) => n + (p.tasks || []).filter(t => (t.tags || []).some(x => x.toLowerCase() === tag.name.toLowerCase())).length, 0);
  const ok = await askConfirm({
    title: `¿Eliminar la etiqueta «${tag.name}»?`,
    message: usage > 0 ? `Se quitará de ${usage} tarea(s).` : 'Ninguna tarea la usa.',
    confirmText: 'Eliminar', danger: true
  });
  if (!ok) return;

  const key = tag.name.toLowerCase();
  tagLibrary = tagLibrary.filter(t => t !== tag);
  projects.forEach(p => (p.tasks || []).forEach(t => {
    if (t.tags) t.tags = t.tags.filter(x => x.toLowerCase() !== key);
  }));
  currentModalTags = currentModalTags.filter(x => x.toLowerCase() !== key);
  saveData(STORAGE_KEYS.TAGS, tagLibrary);
  persist();
  renderTagPicker();
  renderBoard();
  showToast('Etiqueta eliminada', 'warning');
}

function setTagPanelOpen(open) {
  tagPickerPanel.hidden = !open;
  tagPickerToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    renderTagPicker();
    setTimeout(() => tagSearchInput.focus(), 30);
  }
}

tagPickerToggle.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove-tag]');
  if (removeBtn) {
    toggleModalTag(removeBtn.dataset.removeTag);
    return;
  }
  setTagPanelOpen(tagPickerPanel.hidden);
});

tagSearchInput.addEventListener('input', renderTagPicker);
tagSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    createTagFromInput();
  }
});
createTagBtn.addEventListener('click', createTagFromInput);
const modalSubtaskList = document.getElementById('modalSubtaskList');
const newSubtaskInput = document.getElementById('newSubtaskInput');
const addSubtaskBtn = document.getElementById('addSubtaskBtn');
const deleteTaskBtn = document.getElementById('deleteTaskBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const fabNewTask = document.getElementById('fabNewTask');
const quickAddBtn = document.getElementById('quickAddBtn');

// Con una ventana abierta se puede usar el lienzo; para no perder lo que se está escribiendo,
// no se abre encima otra igual (otra tarea, otro tablero…) hasta cerrarla
function modalAlreadyOpen(modal) {
  if (!modal || modal.style.display !== 'flex') return false;
  showToast('Guarda o cierra la ventana abierta antes de abrir otra', 'info');
  const card = modal.querySelector('.modal-card');
  if (card) { card.classList.remove('attention'); void card.offsetWidth; card.classList.add('attention'); }
  return true;
}

window.openTaskModal = function(taskId = null, defaultColId = null, event = null) {
  if (event) event.stopPropagation();
  if (modalAlreadyOpen(taskModal)) return;

  if (columns.length === 0) {
    showToast('Primero agrega una columna a este proyecto', 'info');
    openColumnModal();
    return;
  }

  // Populate column select options
  ensureBoards();
  taskColumnSelect.innerHTML = boards.length > 1
    ? boards.map(b => {
        const opts = columns.filter(c => c.boardId === b.id).map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
        return opts ? `<optgroup label="${escapeHtml(b.title)}">${opts}</optgroup>` : '';
      }).join('')
    : columns.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');

  if (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    modalTitle.textContent = 'Editar Tarea';
    taskIdInput.value = task.id;
    taskTitleInput.value = task.title;
    taskDescInput.value = task.description || '';
    taskColumnSelect.value = task.columnId;
    taskPrioritySelect.value = task.priority || 'medium';
    taskDueDate.value = task.dueDate || '';
    setDueDateEnabled(!!task.dueDate);
    setRepeatField(task.repeat || '');
    currentModalTags = [...(task.tags || [])];
    currentModalSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
    currentModalImages = JSON.parse(JSON.stringify(task.images || []));
    currentModalLinkNames = { ...(task.linkNames || {}) };
    deleteTaskBtn.style.display = 'block';
    document.getElementById('sendTaskBtn').style.display = 'block';
    document.getElementById('archiveTaskBtn').style.display = 'block';
  } else {
    modalTitle.textContent = 'Nueva Tarea';
    taskIdInput.value = '';
    taskTitleInput.value = '';
    taskDescInput.value = '';
    taskColumnSelect.value = defaultColId || defaultColumnForNewTask() || (columns[0] ? columns[0].id : '');
    taskPrioritySelect.value = 'medium';
    taskDueDate.value = '';
    setDueDateEnabled(false);
    setRepeatField('');
    currentModalTags = [];
    currentModalSubtasks = [];
    currentModalImages = [];
    currentModalLinkNames = {};
    deleteTaskBtn.style.display = 'none';
    document.getElementById('sendTaskBtn').style.display = 'none';
    document.getElementById('archiveTaskBtn').style.display = 'none';
  }

  renderModalSubtasks();
  modalAddedImageIds = [];
  renderModalImages();
  tagSearchInput.value = '';
  setTagPanelOpen(false);
  renderTagPicker();
  taskModal.style.display = 'flex';
  // El título se va completando con la descripción mientras no se escriba a mano
  // (en tareas nuevas, o si el título es justo el inicio de la descripción)
  titleFollowsDescription = !taskTitleInput.value.trim() || taskTitleInput.value === titleFromDescription(taskDescInput.value);
  // Se escribe directo en la descripción. En el celular, al abrir una tarea existente no se enfoca nada:
  // el teclado taparía la tarea. Solo al crear una nueva se enfoca para escribir de inmediato.
  const isTouchScreen = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (!(taskIdInput.value && isTouchScreen)) {
    setTimeout(() => {
      taskDescInput.focus();
      const end = taskDescInput.value.length;
      taskDescInput.setSelectionRange(end, end);
    }, 60);
  }
};

// Título automático: la primera línea de la descripción, hasta TITLE_FROM_DESC_MAX caracteres (cortando en una palabra)
const TITLE_FROM_DESC_MAX = 60;
let titleFollowsDescription = false;

function titleFromDescription(desc) {
  const line = (String(desc).split('\n').find(l => l.trim()) || '').trim().replace(/\s+/g, ' ');
  if (line.length <= TITLE_FROM_DESC_MAX) return line;
  const cut = line.slice(0, TITLE_FROM_DESC_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > TITLE_FROM_DESC_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

taskDescInput.addEventListener('input', () => {
  if (titleFollowsDescription) taskTitleInput.value = titleFromDescription(taskDescInput.value);
});
taskTitleInput.addEventListener('input', () => {
  // Al escribir el título a mano deja de seguir a la descripción; si se borra, vuelve a seguirla
  titleFollowsDescription = !taskTitleInput.value.trim();
});

function closeTaskModal() {
  taskModal.style.display = 'none';
  // Descartar imágenes subidas en esta ventana que no se guardaron
  modalAddedImageIds.forEach(id => ImageStore.del(id));
  modalAddedImageIds = [];
}

closeModalBtn.addEventListener('click', closeTaskModal);
cancelTaskBtn.addEventListener('click', closeTaskModal);
quickAddBtn.addEventListener('click', () => openTaskModal(null, defaultColumnForNewTask()));
if (fabNewTask) fabNewTask.addEventListener('click', () => openTaskModal(null, defaultColumnForNewTask()));

// Las ventanas emergentes solo se cierran con los botones Cerrar/Cancelar/Guardar (no al hacer clic fuera)

// Subtasks Management inside Modal
// Cada subtarea: manija para reordenar, casilla, texto editable ahí mismo, copiar y quitar
function renderModalSubtasks() {
  modalSubtaskList.innerHTML = '';
  currentModalSubtasks.forEach((st, idx) => {
    const li = document.createElement('li');
    li.className = `subtask-item ${st.completed ? 'completed' : ''}`;
    li.dataset.subtaskId = st.id;
    li.innerHTML = `
      <span class="subtask-handle" title="Arrastra para reordenar" aria-label="Reordenar">⠿</span>
      <input type="checkbox" ${st.completed ? 'checked' : ''} aria-label="Hecha">
      <input type="text" class="subtask-text-input" value="${escapeHtml(st.text)}" maxlength="300" aria-label="Texto de la subtarea">
      <button type="button" class="subtask-copy-btn" title="Copiar texto" aria-label="Copiar texto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <button type="button" class="subtask-del-btn" title="Quitar" aria-label="Quitar">&times;</button>
    `;
    li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleModalSubtask(idx));
    li.querySelector('.subtask-del-btn').addEventListener('click', () => removeModalSubtask(idx));

    const textInput = li.querySelector('.subtask-text-input');
    textInput.addEventListener('input', () => { st.text = textInput.value; });
    textInput.addEventListener('keydown', (e) => {
      // Enter o Esc terminan de editar (sin enviar el formulario de la tarea)
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        textInput.blur();
      }
    });
    textInput.addEventListener('blur', () => {
      const text = textInput.value.trim();
      if (!text) {
        // Vacía: se deja el texto que tenía antes de editar
        textInput.value = textInput.defaultValue;
        st.text = textInput.defaultValue;
      } else {
        st.text = text;
        textInput.value = text;
        textInput.defaultValue = text;
      }
    });

    li.querySelector('.subtask-copy-btn').addEventListener('click', async () => {
      const text = st.text.trim();
      try {
        await navigator.clipboard.writeText(text);
        showToast('Subtarea copiada', 'success');
      } catch (err) {
        // Sin permiso para el portapapeles moderno: copia clásica y, si tampoco, queda seleccionado
        textInput.focus();
        textInput.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } catch (e2) {}
        showToast(copied ? 'Subtarea copiada' : 'Texto seleccionado: usa Copiar', copied ? 'success' : 'info');
      }
    });

    li.querySelector('.subtask-handle').addEventListener('pointerdown', (e) => startSubtaskDrag(e, li));
    modalSubtaskList.appendChild(li);
  });
}

// Reordenar subtareas arrastrando la manija (mouse o dedo)
function startSubtaskDrag(e, li) {
  if (e.button !== 0) return;
  e.preventDefault();
  const pointerId = e.pointerId;
  li.classList.add('is-dragging');
  // Se escucha en window: al mover el elemento en la lista, el navegador le quitaría la captura del puntero
  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const items = [...modalSubtaskList.children].filter(x => x !== li);
    const before = items.find(x => {
      const r = x.getBoundingClientRect();
      return ev.clientY < r.top + r.height / 2;
    });
    if (before) {
      if (li.nextElementSibling !== before) modalSubtaskList.insertBefore(li, before);
    } else if (modalSubtaskList.lastElementChild !== li) {
      modalSubtaskList.appendChild(li);
    }
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    li.classList.remove('is-dragging');
    // El nuevo orden es el de la lista en pantalla
    const order = [...modalSubtaskList.children].map(x => x.dataset.subtaskId);
    currentModalSubtasks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    renderModalSubtasks();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function addSubtaskFromInput() {
  const text = newSubtaskInput.value.trim();
  if (text) {
    currentModalSubtasks.push({
      id: 'st-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      text: text,
      completed: false
    });
    newSubtaskInput.value = '';
    renderModalSubtasks();
  }
}

addSubtaskBtn.addEventListener('click', addSubtaskFromInput);
newSubtaskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addSubtaskFromInput();
  }
});

window.toggleModalSubtask = function(idx) {
  if (currentModalSubtasks[idx]) {
    currentModalSubtasks[idx].completed = !currentModalSubtasks[idx].completed;
    renderModalSubtasks();
  }
};

window.removeModalSubtask = function(idx) {
  currentModalSubtasks.splice(idx, 1);
  renderModalSubtasks();
};

// Save Task Form
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = taskTitleInput.value.trim();
  if (!title) return;

  const id = taskIdInput.value;
  const colId = taskColumnSelect.value;
  const priority = taskPrioritySelect.value;
  const dueDate = taskHasDueDate.checked ? taskDueDate.value : '';
  const tags = [...currentModalTags];

  if (id) {
    // Edit existing
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.title = title;
      task.description = taskDescInput.value.trim();
      task.columnId = colId;
      task.priority = priority;
      task.dueDate = dueDate;
      task.tags = tags;
      task.subtasks = currentModalSubtasks;
      (task.images || [])
        .filter(img => !currentModalImages.some(c => c.id === img.id))
        .forEach(img => ImageStore.del(img.id));
      task.images = currentModalImages;
      task.linkNames = currentModalLinkNames;
      if (isDoneColumn(colId)) task.completed = true;
      applyRepeatFromModal(task);
      showToast('Tarea actualizada', 'info');
    }
  } else {
    // Create new
    const newTask = {
      id: generateId('task'),
      columnId: colId,
      title: title,
      description: taskDescInput.value.trim(),
      priority: priority,
      dueDate: dueDate,
      tags: tags,
      completed: isDoneColumn(colId),
      subtasks: currentModalSubtasks,
      images: currentModalImages,
      linkNames: currentModalLinkNames,
      createdAt: Date.now()
    };
    applyRepeatFromModal(newTask);
    tasks.unshift(newTask);
    showToast('Nueva tarea añadida', 'success');
  }

  modalAddedImageIds = []; // ya quedaron guardadas en la tarea
  persist();
  closeTaskModal();
  renderBoard();
});

// Delete Task
deleteTaskBtn.addEventListener('click', async () => {
  const id = taskIdInput.value;
  if (!id) return;
  const task = tasks.find(t => t.id === id);
  const ok = await askConfirm({
    title: '¿Eliminar esta tarea?',
    message: `«${task ? task.title : ''}» se borrará con sus subtareas e imágenes. Si solo quieres sacarla del tablero, usa 📦 Archivar.`,
    confirmText: 'Eliminar', danger: true
  });
  if (ok) {
    const removedTask = tasks.find(t => t.id === id);
    if (removedTask) deleteTaskImages(removedTask);
    tasks = tasks.filter(t => t.id !== id);
    persist();
    closeTaskModal();
    renderBoard();
    showToast('Tarea eliminada', 'warning');
  }
});

// =============================================================================
// 7. Column Modal (Add & Edit)
// =============================================================================

const columnModal = document.getElementById('columnModal');
const columnForm = document.getElementById('columnForm');
const columnModalTitle = document.getElementById('columnModalTitle');
const columnIdInput = document.getElementById('columnId');
const columnTitleInput = document.getElementById('columnTitleInput');
const columnColorInput = document.getElementById('columnColorInput');
const colorPickerPalette = document.getElementById('colorPickerPalette');
const deleteColumnBtn = document.getElementById('deleteColumnBtn');
const closeColumnModalBtn = document.getElementById('closeColumnModalBtn');
const cancelColumnBtn = document.getElementById('cancelColumnBtn');
const addColumnBtn = document.getElementById('addColumnBtn');
const columnBoardSelect = document.getElementById('columnBoardSelect');
const columnBoardGroup = document.getElementById('columnBoardGroup');

const PALETTE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', 
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'
];

// Construye una paleta de colores ligada a un input oculto
function buildColorPalette(container, hiddenInput) {
  container.innerHTML = '';
  PALETTE_COLORS.forEach(color => {
    const dot = document.createElement('div');
    dot.className = 'color-option';
    dot.style.backgroundColor = color;
    dot.dataset.color = color;
    if (color === hiddenInput.value) dot.classList.add('selected');
    dot.addEventListener('click', () => {
      container.querySelectorAll('.color-option').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      hiddenInput.value = color;
    });
    container.appendChild(dot);
  });
}

window.openColumnModal = function(colId = null, boardId = null) {
  if (modalAlreadyOpen(document.getElementById('columnModal'))) return;
  ensureBoards();
  if (boards.length === 0) {
    showToast('Primero crea un tablero', 'info');
    openBoardModal();
    return;
  }
  // Tablero destino: el indicado, el seleccionado o el primero
  const selectedBoard = [...selection].find(k => k.startsWith('board:'));
  const col0 = colId ? columns.find(c => c.id === colId) : null;
  const targetBoard = (col0 && col0.boardId) || boardId || (selectedBoard && selectedBoard.slice(6)) || boards[0].id;
  columnBoardSelect.innerHTML = boards.map(b => `<option value="${b.id}">${escapeHtml(b.title)}</option>`).join('');
  columnBoardSelect.value = targetBoard;
  columnBoardGroup.style.display = boards.length > 1 ? '' : 'none';

  if (colId) {
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    columnModalTitle.textContent = 'Editar Columna';
    columnIdInput.value = col.id;
    columnTitleInput.value = col.title;
    columnColorInput.value = col.color || '#6366f1';
    deleteColumnBtn.style.display = 'block';
    document.getElementById('columnArchiveGroup').style.display = '';
  } else {
    columnModalTitle.textContent = 'Nueva Columna';
    columnIdInput.value = '';
    columnTitleInput.value = '';
    columnColorInput.value = PALETTE_COLORS[columns.length % PALETTE_COLORS.length];
    deleteColumnBtn.style.display = 'none';
    document.getElementById('columnArchiveGroup').style.display = 'none';
  }

  buildColorPalette(colorPickerPalette, columnColorInput);

  columnModal.style.display = 'flex';
  setTimeout(() => columnTitleInput.focus(), 60);
};

function closeColumnModal() {
  columnModal.style.display = 'none';
}

closeColumnModalBtn.addEventListener('click', closeColumnModal);
cancelColumnBtn.addEventListener('click', closeColumnModal);
addColumnBtn.addEventListener('click', () => openColumnModal(null, contextBoardId()));


columnForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = columnTitleInput.value.trim();
  if (!title) return;

  const id = columnIdInput.value;
  const color = columnColorInput.value;

  if (id) {
    const col = columns.find(c => c.id === id);
    if (col) {
      col.title = title;
      col.color = color;
      if (col.boardId !== columnBoardSelect.value) {
        // Cambió de tablero: pasa al final del nuevo tablero
        columns.splice(columns.indexOf(col), 1);
        col.boardId = columnBoardSelect.value;
        columns.push(col);
      }
      showToast('Columna actualizada', 'info');
    }
  } else {
    const newCol = {
      id: generateId('col'),
      title: title,
      color: color,
      boardId: columnBoardSelect.value
    };
    columns.push(newCol);
    showToast('Columna creada con éxito', 'success');
  }

  persist();
  closeColumnModal();
  renderBoard();
});

deleteColumnBtn.addEventListener('click', async () => {
  const id = columnIdInput.value;
  if (!id) return;

  const tasksInCol = tasks.filter(t => t.columnId === id);
  if (tasksInCol.length > 0) {
    const col = columns.find(c => c.id === id);
    const ok = await askConfirm({
      title: `¿Eliminar la columna «${col ? col.title : ''}»?`,
      message: `Tiene ${tasksInCol.length} tarea(s) que también se borrarán.`,
      confirmText: 'Eliminar columna', danger: true
    });
    if (!ok) return;
  }

  columns = columns.filter(c => c.id !== id);
  tasks.filter(t => t.columnId === id).forEach(deleteTaskImages);
  tasks = tasks.filter(t => t.columnId !== id);
  persist();
  closeColumnModal();
  renderBoard();
  showToast('Columna eliminada', 'warning');
});

// =============================================================================
// 7b. Projects (cada proyecto tiene sus propias columnas y tareas)
// =============================================================================

const projectSwitcher = document.getElementById('projectSwitcher');
const projectSwitcherBtn = document.getElementById('projectSwitcherBtn');
const projectMenu = document.getElementById('projectMenu');
const projectList = document.getElementById('projectList');
const currentProjectName = document.getElementById('currentProjectName');
const currentProjectDot = document.getElementById('currentProjectDot');
const newProjectBtn = document.getElementById('newProjectBtn');

const projectModal = document.getElementById('projectModal');
const projectForm = document.getElementById('projectForm');
const projectModalTitle = document.getElementById('projectModalTitle');
const projectIdInput = document.getElementById('projectId');
const projectNameInput = document.getElementById('projectNameInput');
const projectColorInput = document.getElementById('projectColorInput');
const projectColorPalette = document.getElementById('projectColorPalette');
const projectTemplateGroup = document.getElementById('projectTemplateGroup');
const projectTemplateSelect = document.getElementById('projectTemplateSelect');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const closeProjectModalBtn = document.getElementById('closeProjectModalBtn');
const cancelProjectBtn = document.getElementById('cancelProjectBtn');

function renderProjectSwitcher() {
  const active = getActiveProject();
  currentProjectName.textContent = active.name;
  currentProjectName.title = active.name;
  currentProjectDot.style.backgroundColor = active.color || '#6366f1';
  document.title = `${active.name} • ZenBan`;

  projectList.innerHTML = '';
  const collapsed = collapsedFolders();
  projectGroups(projects).forEach(group => {
    if (group.folder) {
      // Carpeta: se pliega o despliega tocándola; si tiene el proyecto abierto, se muestra abierta
      const key = folderKey(tabSpaceKey, group.folder);
      const open = !collapsed.has(key) || group.items.some(p => p.id === active.id);
      projectList.appendChild(folderHeaderEl(group.folder, group.items.length, open, collapsed, key));
      if (!open) return;
    }
    group.items.forEach(project => projectList.appendChild(projectItemEl(project, active, group.folder)));
  });
}

// Las carpetas son de cada espacio: plegar "Ideas" en el personal no pliega la "Ideas" del compartido
function folderKey(space, folder) {
  return `${space}|${folder}`;
}

function folderHeaderEl(folder, count, open, collapsed, key, extraClass = '') {
  const head = document.createElement('li');
  head.className = `project-folder ${open ? 'is-open' : ''} ${extraClass}`;
  head.dataset.folder = folder;
  const movable = !extraClass.includes('is-other-space');
  head.innerHTML = `${movable ? '<span class="project-drag folder-drag" title="Arrastra para ordenar la carpeta" aria-hidden="true">⠿</span>' : ''}<button type="button" class="project-folder-btn" title="${open ? 'Plegar' : 'Desplegar'} la carpeta">
    <span class="project-folder-chevron">▸</span><span>📁 ${escapeHtml(folder)}</span><small>${count}</small></button>`;
  head.querySelector('button').addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) collapsed.add(key); else collapsed.delete(key);
    saveCollapsedFolders(collapsed);
    renderProjectSwitcher();
  });
  if (movable) head.querySelector('.folder-drag').addEventListener('pointerdown', (e) => startFolderDrag(e, head, folder));
  return head;
}

// Arrastrar una carpeta por su manija: se mueve con sus proyectos y queda en ese orden
function startFolderDrag(e, head, folder) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  // La carpeta y sus proyectos visibles se mueven como un bloque
  const block = () => {
    const els = [head];
    let n = head.nextElementSibling;
    while (n && n.classList.contains('in-folder') && n.dataset.folder === folder) { els.push(n); n = n.nextElementSibling; }
    return els;
  };
  block().forEach(x => x.classList.add('is-dragging'));
  projectList.classList.add('is-sorting');
  const onMove = (ev) => {
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const other = under && under.closest('.project-folder:not(.is-other-space)');
    if (!other || other === head || !projectList.contains(other)) return;
    const r = other.getBoundingClientRect();
    const current = block();
    if (ev.clientY < r.top + r.height / 2) {
      current.forEach(x => other.before(x));
    } else {
      // Después de la otra carpeta y sus proyectos
      let last = other;
      while (last.nextElementSibling && last.nextElementSibling.classList.contains('in-folder') && last.nextElementSibling.dataset.folder === other.dataset.folder) last = last.nextElementSibling;
      current.slice().reverse().forEach(x => last.after(x));
    }
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    projectList.classList.remove('is-sorting');
    // Nuevo orden de las carpetas: el que quedó en la lista
    const order = [...projectList.querySelectorAll('.project-folder:not(.is-other-space)')].map(x => x.dataset.folder);
    projects.forEach(p => {
      const i = order.indexOf(projectFolder(p));
      if (i >= 0 && p.folderPos !== i) { p.folderPos = i; p.updatedAt = Date.now(); }
    });
    saveData(STORAGE_KEYS.PROJECTS, projects);
    renderProjectSwitcher();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// ----- Ventana de confirmación con el estilo de ZenBan (en vez de la del navegador) -----
// askConfirm({ title, message, confirmText, cancelText, danger, icon }) → Promise<boolean>
// Enter acepta, Esc cancela. El mensaje acepta saltos de línea.
function askConfirm(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'modal-backdrop confirm-backdrop';
    m.style.display = 'flex';
    const paragraphs = String(o.message || '').split(/\n\s*\n|\n/).filter(Boolean)
      .map(p => `<p>${escapeHtml(p)}</p>`).join('');
    m.innerHTML = `
      <div class="modal-card confirm-card ${o.danger ? 'is-danger' : ''}" role="alertdialog" aria-modal="true">
        <div class="confirm-head">
          <span class="confirm-icon" aria-hidden="true">${o.icon || (o.danger ? '🗑️' : '❔')}</span>
          <h2>${escapeHtml(o.title || '¿Confirmas?')}</h2>
        </div>
        <div class="confirm-body">${paragraphs}</div>
        <div class="confirm-actions">
          <button type="button" class="btn btn-ghost" data-answer="no">${escapeHtml(o.cancelText || 'Cancelar')}</button>
          <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-answer="yes">${escapeHtml(o.confirmText || 'Aceptar')}</button>
        </div>
      </div>`;
    const done = (answer) => {
      document.removeEventListener('keydown', onKey, true);
      m.remove();
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
    };
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (b) done(b.dataset.answer === 'yes');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(m);
    setTimeout(() => m.querySelector('[data-answer="yes"]').focus(), 30);
  });
}

// ----- Aviso de carga sobre el lienzo (al cambiar de proyecto o de espacio) -----
let busyCount = 0;
function showBusy(text) {
  let el = document.getElementById('busyOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'busyOverlay';
    el.className = 'busy-overlay';
    el.innerHTML = '<div class="busy-box"><span class="busy-spinner" aria-hidden="true"></span><span class="busy-text"></span></div>';
    document.body.appendChild(el);
  }
  el.querySelector('.busy-text').textContent = text || 'Cargando…';
  busyCount++;
  el.hidden = false;
}

function hideBusy() {
  busyCount = Math.max(0, busyCount - 1);
  const el = document.getElementById('busyOverlay');
  if (el && !busyCount) el.hidden = true;
}

// ----- Orden de la lista de proyectos: estrellas, carpetas y orden manual (arrastrando) -----
const STARRED_POSITION_KEY = 'zenban_starred_position'; // 'top' | 'bottom'
const COLLAPSED_FOLDERS_KEY = 'zenban_collapsed_folders';

function starredPosition() {
  return localStorage.getItem(STARRED_POSITION_KEY) === 'bottom' ? 'bottom' : 'top';
}

function collapsedFolders() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_FOLDERS_KEY) || '[]')); } catch (e) { return new Set(); }
}

function saveCollapsedFolders(set) {
  localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...set]));
}

function projectFolder(p) {
  return (p.folder || '').trim();
}

// Grupos de la lista: primero los proyectos sueltos y después cada carpeta (A-Z).
// Dentro de cada grupo, los de estrella arriba o abajo (según Configuración) y el resto en su orden manual.
function projectGroups(list) {
  const byOrder = (a, b) => (a.order ?? list.indexOf(a)) - (b.order ?? list.indexOf(b));
  const starredFirst = starredPosition() === 'top';
  const sortGroup = (items) => {
    const starred = items.filter(p => p.starred).sort(byOrder);
    const rest = items.filter(p => !p.starred).sort(byOrder);
    return starredFirst ? [...starred, ...rest] : [...rest, ...starred];
  };
  // Carpetas en el orden elegido arrastrándolas (folderPos de sus proyectos); las nuevas, al final por nombre
  const folderPos = (f) => {
    const pos = list.filter(p => projectFolder(p) === f && typeof p.folderPos === 'number').map(p => p.folderPos);
    return pos.length ? Math.min(...pos) : Infinity;
  };
  const folders = [...new Set(list.map(projectFolder).filter(Boolean))]
    .sort((a, b) => (folderPos(a) - folderPos(b)) || a.localeCompare(b, 'es'));
  return [
    { folder: '', items: sortGroup(list.filter(p => !projectFolder(p))) },
    ...folders.map(folder => ({ folder, items: sortGroup(list.filter(p => projectFolder(p) === folder)) }))
  ].filter(g => g.folder || g.items.length);
}

function projectItemEl(project, active, folder) {
  const total = (project.tasks || []).length;
  const done = (project.tasks || []).filter(t => t.completed).length;
  const colCount = (project.columns || []).length;
  const isActive = project.id === active.id;

  const li = document.createElement('li');
  li.className = `project-item ${isActive ? 'is-active' : ''} ${folder ? 'in-folder' : ''}`;
  li.dataset.projectId = project.id;
  li.dataset.folder = folder || '';
  li.innerHTML = `
    <span class="project-drag" title="Arrastra para ordenar o mover a una carpeta" aria-hidden="true">⠿</span>
    <button type="button" class="project-item-main" title="Abrir ${escapeHtml(project.name)}">
      <span class="project-dot" style="background-color: ${project.color || '#6366f1'}"></span>
      <span class="project-item-text">
        <span class="project-item-name">${escapeHtml(project.name)}</span>
        <span class="project-item-meta">${colCount} columna${colCount === 1 ? '' : 's'} · ${done}/${total} tareas</span>
      </span>
      ${isActive ? `<svg class="project-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
    </button>
    <button type="button" class="project-item-star ${project.starred ? 'is-starred' : ''}" title="${project.starred ? 'Quitar la estrella' : 'Marcar con estrella'}" aria-label="Estrella">${project.starred ? '★' : '☆'}</button>
    <button type="button" class="project-item-edit" title="Editar proyecto" aria-label="Editar ${escapeHtml(project.name)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </svg>
    </button>
  `;
  li.querySelector('.project-item-main').addEventListener('click', () => {
    closeProjectMenu();
    if (project.id === activeProjectId) return;
    // Se muestra "Abriendo…" y se cambia en el siguiente cuadro (así el aviso alcanza a verse)
    showBusy(`Abriendo «${project.name}»…`);
    setTimeout(() => {
      try { switchProject(project.id); } finally { hideBusy(); }
    }, 40);
  });
  li.querySelector('.project-item-star').addEventListener('click', (e) => {
    e.stopPropagation();
    project.starred = !project.starred;
    project.updatedAt = Date.now();
    saveData(STORAGE_KEYS.PROJECTS, projects);
    renderProjectSwitcher();
  });
  li.querySelector('.project-item-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    closeProjectMenu();
    openProjectModal(project.id);
  });
  li.querySelector('.project-drag').addEventListener('pointerdown', (e) => startProjectDrag(e, li, project));
  return li;
}

// Arrastrar un proyecto por su manija: se reordena o se pasa a otra carpeta (o fuera de ellas)
function startProjectDrag(e, li, project) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  li.classList.add('is-dragging');
  projectList.classList.add('is-sorting');
  let targetFolder = projectFolder(project);
  const onMove = (ev) => {
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const overItem = under && under.closest('.project-item[data-project-id]');
    const overFolder = under && under.closest('.project-folder');
    projectList.querySelectorAll('.project-folder.is-drop').forEach(x => x.classList.remove('is-drop'));
    if (overFolder && projectList.contains(overFolder)) {
      // Sobre una carpeta: entra al final de esa carpeta
      overFolder.classList.add('is-drop');
      targetFolder = overFolder.dataset.folder;
      let last = overFolder;
      while (last.nextElementSibling && last.nextElementSibling.classList.contains('in-folder')) last = last.nextElementSibling;
      if (last !== li) last.after(li);
    } else if (overItem && overItem !== li && projectList.contains(overItem)) {
      const r = overItem.getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) overItem.before(li); else overItem.after(li);
      targetFolder = overItem.dataset.folder || '';
    }
    // Cerca de los bordes, la lista se desplaza
    const box = projectList.getBoundingClientRect();
    if (ev.clientY < box.top + 30) projectList.scrollTop -= 8;
    else if (ev.clientY > box.bottom - 30) projectList.scrollTop += 8;
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    li.classList.remove('is-dragging');
    projectList.classList.remove('is-sorting');
    project.folder = targetFolder || undefined;
    if (!project.folder) delete project.folder;
    // Nuevo orden: el que quedó en la lista (solo los proyectos de este espacio)
    [...projectList.querySelectorAll('.project-item[data-project-id]')].forEach((el, i) => {
      const p = projects.find(x => x.id === el.dataset.projectId);
      if (p && p.order !== i) { p.order = i; p.updatedAt = Date.now(); }
    });
    project.updatedAt = Date.now();
    saveData(STORAGE_KEYS.PROJECTS, projects);
    renderProjectSwitcher();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function switchProject(projectId) {
  if (!projects.some(p => p.id === projectId)) return;
  activeProjectId = projectId;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, projectId);

  const project = getActiveProject();
  project.columns = project.columns || [];
  project.tasks = project.tasks || [];
  columns = project.columns;
  tasks = project.tasks;

  selection = new Set();
  focusedBoardId = null;
  renderProjectSwitcher();
  renderBoard();
  renderBgImages();
  renderTexts();
  undoStack.length = 0;
  renderDrawings();
  resetHistory();

  // Al abrir el proyecto se ajusta todo su contenido a la pantalla (como el botón Ajustar)
  fitBoardToScreen();
}

function openProjectMenu() {
  renderProjectSwitcher();
  projectMenu.hidden = false;
  projectSwitcherBtn.setAttribute('aria-expanded', 'true');
}

function closeProjectMenu() {
  if (!projectMenu) return;
  projectMenu.hidden = true;
  projectSwitcherBtn.setAttribute('aria-expanded', 'false');
}

projectSwitcherBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (projectMenu.hidden) openProjectMenu(); else closeProjectMenu();
});

document.addEventListener('click', (e) => {
  if (!projectMenu.hidden && !projectSwitcher.contains(e.target)) closeProjectMenu();
});

newProjectBtn.addEventListener('click', () => {
  closeProjectMenu();
  openProjectModal();
});

window.openProjectModal = function(projectId = null) {
  if (modalAlreadyOpen(document.getElementById('projectModal'))) return;
  if (projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    projectModalTitle.textContent = 'Editar Proyecto';
    projectIdInput.value = project.id;
    projectNameInput.value = project.name;
    projectColorInput.value = project.color || '#6366f1';
    projectTemplateGroup.style.display = 'none';
    deleteProjectBtn.style.display = projects.length > 1 ? 'block' : 'none';
  } else {
    projectModalTitle.textContent = 'Nuevo Proyecto';
    projectIdInput.value = '';
    projectNameInput.value = '';
    projectColorInput.value = PALETTE_COLORS[projects.length % PALETTE_COLORS.length];
    // Los proyectos nuevos empiezan con el lienzo vacío (sin tableros ni columnas)
    projectTemplateGroup.style.display = 'none';
    deleteProjectBtn.style.display = 'none';
  }
  // Carpeta: se elige una existente o se escribe un nombre nuevo para crearla
  const folderInput = document.getElementById('projectFolderInput');
  const current = projectId ? projects.find(p => p.id === projectId) : null;
  folderInput.value = current ? projectFolder(current) : '';
  document.getElementById('projectFolderList').innerHTML = [...new Set(projects.map(projectFolder).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es')).map(f => `<option value="${escapeHtml(f)}"></option>`).join('');

  buildColorPalette(projectColorPalette, projectColorInput);
  projectModal.style.display = 'flex';
  setTimeout(() => projectNameInput.focus(), 60);
};

function closeProjectModal() {
  projectModal.style.display = 'none';
}

closeProjectModalBtn.addEventListener('click', closeProjectModal);
cancelProjectBtn.addEventListener('click', closeProjectModal);

projectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = projectNameInput.value.trim();
  if (!name) return;

  const id = projectIdInput.value;
  const color = projectColorInput.value;
  const folder = document.getElementById('projectFolderInput').value.trim().replace(/\s+/g, ' ');

  if (id) {
    const project = projects.find(p => p.id === id);
    if (project) {
      project.name = name;
      project.color = color;
      if (folder) project.folder = folder; else delete project.folder;
      showToast('Proyecto actualizado', 'info');
    }
    persist();
    renderProjectSwitcher();
    renderBoard();
  } else {
    const newProject = {
      id: generateId('proj'),
      name: name,
      color: color,
      columns: [],
      tasks: [],
      boards: [],
      createdAt: Date.now()
    };
    if (folder) newProject.folder = folder;
    projects.push(newProject);
    persist();
    switchProject(newProject.id);
    showToast(`Proyecto "${name}" creado`, 'success');
  }

  closeProjectModal();
});

deleteProjectBtn.addEventListener('click', async () => {
  const id = projectIdInput.value;
  if (!id || projects.length <= 1) return;

  const project = projects.find(p => p.id === id);
  if (!project) return;
  const taskCount = (project.tasks || []).length;
  const ok = await askConfirm({
    title: `¿Eliminar el proyecto «${project.name}»?`,
    message: taskCount > 0 ? `Se borrarán sus ${taskCount} tarea(s), tableros e imágenes. No se puede deshacer.` : 'No se puede deshacer.',
    confirmText: 'Eliminar proyecto', danger: true
  });
  if (!ok) return;

  // Los archivos de sus imágenes del lienzo se borran si ningún otro proyecto los usa
  const others = projects.filter(p => p.id !== project.id);
  (project.bgImages || []).forEach(img => releaseImageFile(bgImageRef(img), others));
  (project.tasks || []).forEach(deleteTaskImages);
  recordDeletedProject(id);
  projects = projects.filter(p => p.id !== id);
  if (activeProjectId === id) {
    activeProjectId = projects[0].id;
  }
  saveData(STORAGE_KEYS.PROJECTS, projects);
  closeProjectModal();
  switchProject(activeProjectId);
  showToast('Proyecto eliminado', 'warning');
});

// =============================================================================
// 7c. Imágenes de fondo en el lienzo (por proyecto)
//     Los datos de la imagen se guardan en IndexedDB; la posición/tamaño en el proyecto.
// =============================================================================

const ImageStore = {
  dbPromise: null,
  open() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('zenban_images', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('images');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', mode);
      const req = fn(tx.objectStore('images'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  },
  put(id, blob) { return this.run('readwrite', s => s.put(blob, id)); },
  get(id) { return this.run('readonly', s => s.get(id)); },
  // Borrado diferido: así Deshacer puede recuperar imágenes. Las que ya nadie usa se limpian al iniciar.
  del(id) { return Promise.resolve(); },
  purge(id) { return this.run('readwrite', s => s.delete(id)).catch(() => {}); },
  keys() { return this.run('readonly', s => s.getAllKeys()); },
  async gc() {
    try {
      // Lienzo, tareas, pestañas de tableros y links con imagen (la misma lista que se sincroniza)
      const used = referencedImageIds();
      const all = await this.keys();
      // Las versiones reducidas ("id@tamaño") se conservan mientras su imagen original se use
      for (const k of all || []) if (!used.has(String(k).split('@')[0])) await this.purge(k);
    } catch (e) {
      console.warn('Limpieza de imágenes', e);
    }
  }
};

const bgImageLayer = document.getElementById('bgImageLayer');
const btnAddBgImage = document.getElementById('btnAddBgImage');
const bgImageInput = document.getElementById('bgImageInput');
const bgImageUrls = new Map(); // id -> objectURL
let selectedBgImageId = null;

function getBgImages() {
  const project = getActiveProject();
  if (!project.bgImages) project.bgImages = [];
  return project.bgImages;
}

// Archivo de una imagen del lienzo. Normalmente es su propio id; una insertada desde la Biblioteca usa el
// archivo ya guardado (src) en vez de una copia, así la misma imagen sirve en varios lugares y aparece una
// sola vez en la Biblioteca.
function bgImageRef(img) {
  return (img && img.src) || (img && img.id);
}

// Borra el archivo de una imagen solo si ya nada lo usa (otra imagen del lienzo, una tarea, una pestaña…)
function releaseImageFile(ref, list = projects) {
  if (!ref || isRemoteImage(ref) || referencedImageIds(list).has(ref)) return;
  ImageStore.del(ref);
  const url = bgImageUrls.get(ref);
  if (url) URL.revokeObjectURL(url);
  bgImageUrls.delete(ref);
}

// Reduce imágenes muy grandes para no llenar el almacenamiento
function prepareImageBlob(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 2000;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      URL.revokeObjectURL(url);
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
        resolve({ blob: file, w, h });
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve({ blob: b, w, h }) : reject(new Error('No se pudo procesar la imagen')), 'image/webp', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Archivo de imagen no válido')); };
    img.src = url;
  });
}

// Convierte un punto de pantalla a coordenadas del lienzo
function screenToCanvas(clientX, clientY) {
  const rect = viewportArea.getBoundingClientRect();
  return { x: (clientX - rect.left - panX) / zoom, y: (clientY - rect.top - panY) / zoom };
}

// opts.at: punto del lienzo donde va el centro (si no, el punto de pantalla o el centro de la vista);
// opts.focus: acerca la vista a la imagen; opts.message: aviso al terminar
async function addBgImageFromFile(file, clientX = null, clientY = null, opts = {}) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    const { id, w, h } = await storeImageFile(file);

    // Tamaño inicial: como máximo 600px de ancho en el lienzo
    const width = Math.min(600, w);
    const height = Math.round(width * (h / w));
    let center;
    if (opts.at) {
      center = opts.at;
    } else if (clientX !== null) {
      center = screenToCanvas(clientX, clientY);
    } else {
      const rect = viewportArea.getBoundingClientRect();
      center = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    const img = { id, name: nextImageName(), x: Math.round(center.x - width / 2), y: Math.round(center.y - height / 2), w: width, h: height, ...(typeof defaultStyleFor === 'function' ? defaultStyleFor('img') : {}) };
    getBgImages().push(img);
    persist();
    selection = new Set([`img:${id}`]);
    renderBgImages();
    if (opts.focus) fitRectToScreen(img.x, img.y, img.w, img.h);
    showToast(opts.message || 'Imagen agregada al fondo. Arrástrala para moverla y usa la esquina para escalarla.', 'success');
  } catch (err) {
    console.error(err);
    showToast('No se pudo agregar la imagen', 'warning');
  }
}

function deleteBgImage(id) {
  const project = getActiveProject();
  const ref = bgImageRef(getBgImages().find(img => img.id === id));
  project.bgImages = getBgImages().filter(img => img.id !== id);
  releaseImageFile(ref);
  selection.delete(`img:${id}`);
  persist();
  renderBgImages();
  showToast('Imagen eliminada', 'warning');
}

function moveBgImageInStack(id, toFront) {
  const list = getBgImages();
  const idx = list.findIndex(img => img.id === id);
  if (idx < 0) return;
  const [item] = list.splice(idx, 1);
  if (toFront) list.push(item); else list.unshift(item);
  persist();
  renderBgImages();
  showToast(toFront ? 'Imagen traída al frente' : 'Imagen enviada atrás', 'info');
}

function selectBgImage(id) {
  setSelection(id ? [`img:${id}`] : []);
}

function renderBgImages() {
  bgImageLayer.innerHTML = '';
  const images = getBgImages();

  images.forEach(data => {
    const el = document.createElement('div');
    el.className = 'bg-image';
    el.dataset.imageId = data.id;
    el.dataset.imageRef = bgImageRef(data);
    el.style.left = `${data.x}px`;
    el.style.top = `${data.y}px`;
    el.style.width = `${data.w}px`;
    el.style.height = `${data.h}px`;
    el.innerHTML = `
      <img alt="" draggable="false">
      <div class="bg-image-toolbar">
        <button type="button" data-action="back" title="Enviar atrás">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="7 13 12 18 17 13"></polyline><line x1="12" y1="6" x2="12" y2="18"></line></svg>
        </button>
        <button type="button" data-action="front" title="Traer adelante">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="17 11 12 6 7 11"></polyline><line x1="12" y1="18" x2="12" y2="6"></line></svg>
        </button>
        <button type="button" data-action="delete" class="is-danger" title="Eliminar imagen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
        </button>
      </div>
      <div class="bg-image-handle" title="Arrastra para escalar"></div>
    `;

    const imgEl = el.querySelector('img');
    // Las imágenes del lienzo se dibujan esperando a estar descomprimidas (no "async"): al pasar rápido
    // de un zoom alto a uno bajo, el celular las mostraba por trozos mientras las volvía a descomprimir
    imgEl.decoding = 'sync';
    imgEl.style.opacity = typeof data.opacity === 'number' ? data.opacity : 1;
    loadBgImageInto(el, bgImageRef(data));

    el.querySelector('.bg-image-toolbar').addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelector('.bg-image-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.action === 'delete') deleteBgImage(data.id);
      if (btn.dataset.action === 'front') moveBgImageInStack(data.id, true);
      if (btn.dataset.action === 'back') moveBgImageInStack(data.id, false);
    });

    el.addEventListener('pointerdown', (e) => {
      if (isPanModeActive || isSpacePressed || e.button !== 0) return;
      const isResize = !!e.target.closest('.bg-image-handle');
      if (!isResize) return; // mover lo gestiona la selección múltiple
      e.preventDefault();
      e.stopPropagation();
      selectBgImage(data.id);

      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { x: data.x, y: data.y, w: data.w, h: data.h };
      const aspect = orig.h / orig.w;
      el.setPointerCapture(e.pointerId);
      el.classList.add(isResize ? 'is-resizing' : 'is-moving');

      const onMove = (ev) => {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        if (isResize) {
          data.w = Math.max(40, Math.round(orig.w + dx));
          data.h = Math.round(data.w * aspect);
          el.style.width = `${data.w}px`;
          el.style.height = `${data.h}px`;
          if (typeof followResize === 'function') followResize(`img:${data.id}`);
        } else {
          data.x = Math.round(orig.x + dx);
          data.y = Math.round(orig.y + dy);
          el.style.left = `${data.x}px`;
          el.style.top = `${data.y}px`;
          // ¿Está el puntero sobre una tarea?
          targetCard = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => n.classList && n.classList.contains('kanban-card')) || null;
          highlightDropCard(targetCard);
          el.classList.toggle('is-over-card', !!targetCard);
        }
      };
      let targetCard = null;
      const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.classList.remove('is-resizing', 'is-moving', 'is-over-card');
        highlightDropCard(null);
        if (targetCard) {
          // Soltada sobre una tarea: la imagen pasa a la tarea
          data.x = orig.x;
          data.y = orig.y;
          transferBgImageToTask(data.id, targetCard.dataset.taskId);
          return;
        }
        persist();
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });

    bgImageLayer.appendChild(el);
  });
  applySelectionVisuals();
}

// Pone la imagen en su caja del lienzo. Mientras no está lista se ve un ícono de carga
// (antes la caja quedaba vacía y parecía que la imagen se había borrado).
function loadBgImageInto(el, id) {
  const imgEl = el.querySelector('img');
  if (!imgEl) return;
  // En el celular el lienzo usa una versión de tamaño moderado (ver getImageVariantUrl)
  const cached = IS_TOUCH_SCREEN ? cachedImageVariant(id, CANVAS_IMAGE_MAX_TOUCH) : bgImageUrls.get(id);
  const setSrc = (url) => {
    if (!url) {
      // No está en este dispositivo: con sesión se está descargando (sigue el ícono de carga);
      // sin sesión se avisa que llega al sincronizar
      const waiting = !!(syncEnabled() && SYNC.token);
      el.classList.toggle('is-loading', waiting);
      el.classList.toggle('is-missing', !waiting);
      return;
    }
    imgEl.onload = () => el.classList.remove('is-loading', 'is-missing');
    imgEl.src = url;
    // Descomprimida completa una vez: el navegador la achica al instante para cualquier zoom
    // en vez de descomprimirla de nuevo a cada tamaño
    imgEl.decode().then(() => el.classList.remove('is-loading', 'is-missing')).catch(() => {});
  };
  if (cached) {
    setSrc(cached); // sin esperar, para que no parpadee al redibujar
    if (imgEl.complete) return;
  }
  el.classList.add('is-loading');
  if (cached) return;
  (IS_TOUCH_SCREEN ? getImageVariantUrl(id, CANVAS_IMAGE_MAX_TOUCH) : getImageUrl(id))
    .then(setSrc)
    .catch(() => {});
}

// ----- Imágenes de tareas -----
async function getImageUrl(id) {
  if (bgImageUrls.has(id)) return bgImageUrls.get(id);
  try {
    const blob = await ImageStore.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    bgImageUrls.set(id, url);
    return url;
  } catch (e) {
    return null;
  }
}

// Versiones reducidas de las imágenes para mostrarlas donde se ven chicas (portadas, vista rápida,
// miniaturas) y, en el celular, también en el lienzo. Una imagen de 2000 px ocupa ~16 MB ya
// descomprimida: con varias, el celular se quedaba sin memoria gráfica y las dibujaba por trozos.
// Se generan de a una (para no descomprimir muchas a la vez), con una pausa entre cada una para no
// demorar los toques, y se guardan en el dispositivo ("id@tamaño") para no repetirlo en cada inicio.
const imageVariantUrls = new Map();   // "id@tamaño" -> url lista
const imageVariantJobs = new Map();   // "id@tamaño" -> promesa en curso
let imageVariantQueue = Promise.resolve();
const IS_TOUCH_SCREEN = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const CANVAS_IMAGE_MAX_TOUCH = 1200;

function cachedImageVariant(id, max) {
  return imageVariantUrls.get(`${id}@${max}`) || null;
}

function getImageVariantUrl(id, max) {
  const key = `${id}@${max}`;
  if (imageVariantUrls.has(key)) return Promise.resolve(imageVariantUrls.get(key));
  if (imageVariantJobs.has(key)) return imageVariantJobs.get(key);
  const job = imageVariantQueue
    .then(() => makeImageVariant(id, max))
    .catch(() => getImageUrl(id))
    .then(url => {
      imageVariantJobs.delete(key);
      if (url) imageVariantUrls.set(key, url); // si aún no está descargada, se vuelve a intentar después
      return url;
    });
  imageVariantQueue = job.catch(() => {});
  imageVariantJobs.set(key, job);
  return job;
}

async function makeImageVariant(id, max) {
  const key = `${id}@${max}`;
  // Ya generada en otra sesión
  const stored = await ImageStore.get(key).catch(() => null);
  if (stored) return URL.createObjectURL(stored);
  await new Promise(r => setTimeout(r, 40)); // deja pasar los toques pendientes antes de trabajar
  const blob = await ImageStore.get(id);
  if (!blob) return null;
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch (e) { return getImageUrl(id); } // se descomprime fuera del hilo principal
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale > 0.85) { bmp.close(); return getImageUrl(id); } // ya es casi de ese tamaño
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.85));
  canvas.width = 0;
  canvas.height = 0;
  if (!out) return getImageUrl(id);
  ImageStore.put(key, out).catch(() => {});
  return URL.createObjectURL(out);
}

// Procesa y guarda un archivo de imagen; devuelve { id, w, h }
async function storeImageFile(file) {
  const { blob, w, h } = await prepareImageBlob(file);
  const id = generateId('img');
  await ImageStore.put(id, blob);
  bgImageUrls.set(id, URL.createObjectURL(blob));
  return { id, w, h };
}

function deleteTaskImages(task) {
  (task.images || []).forEach(img => ImageStore.del(img.id));
}

function highlightDropCard(card) {
  document.querySelectorAll('.kanban-card.is-image-drop').forEach(c => {
    if (c !== card) c.classList.remove('is-image-drop');
  });
  if (card) card.classList.add('is-image-drop');
}

async function addFilesToTask(taskId, files) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  task.images = task.images || [];
  let added = 0;
  for (const file of files) {
    try {
      task.images.push(await storeImageFile(file));
      added++;
    } catch (e) {
      console.error(e);
    }
  }
  if (added === 0) {
    showToast('No se pudo agregar la imagen', 'warning');
    return;
  }
  persist();
  renderBoard();
  showToast(`${added === 1 ? 'Imagen agregada' : added + ' imágenes agregadas'} a "${task.title.substring(0, 28)}"`, 'success');
}

// ----- Soltar una imagen sobre un link (se muestra con esa imagen) o sobre un tablero (su pestaña) -----
// Sirve tanto para una imagen del lienzo arrastrada como para una que viene de afuera (archivo o navegador).
function imageDropTargetAt(clientX, clientY) {
  const nodes = document.elementsFromPoint(clientX, clientY);
  for (const n of nodes) {
    if (!(n instanceof Element)) continue;
    const link = n.closest('a.auto-link[data-url]');
    if (link) {
      const textEl = link.closest('.canvas-text');
      const card = link.closest('.kanban-card');
      const owner = textEl ? getTexts().find(t => t.id === textEl.dataset.textId)
        : card ? tasks.find(t => t.id === card.dataset.taskId) : null;
      if (owner) return { type: 'link', owner, url: unescapeHtml(link.dataset.url), el: link };
    }
    const boardPart = n.closest('.board-image-tab, .board-header');
    if (boardPart) {
      const frame = boardPart.closest('.board-frame');
      const board = frame && boards.find(b => b.id === frame.dataset.boardId);
      if (board) return { type: 'board', board, el: boardPart };
    }
    // Pestaña o título de un frame: la imagen pasa a ser la de su pestaña
    const framePart = n.closest('.frame-image-tab, .frame-title');
    if (framePart && typeof getFrames === 'function') {
      const fel = framePart.closest('.canvas-frame');
      const frame = fel && getFrames().find(f => f.id === fel.dataset.frameId);
      // La pestaña se marca a sí misma; el título marca la barra superior (línea segmentada)
      if (frame) return { type: 'frame', frame, el: framePart.classList.contains('frame-title') ? (fel.querySelector('.frame-drop-bar') || framePart) : framePart };
    }
    // Barra superior o pestaña de una ventana web / plugin: la imagen pasa a ser su pestaña
    const webPart = n.closest('.webwin-bar, .webwin-image-tab');
    if (webPart) {
      const tel = webPart.closest('.canvas-text');
      const text = tel && getTexts().find(t => t.id === tel.dataset.textId);
      if (text && text.web) return { type: 'webwin', text, el: webPart };
    }
    // Barra superior del frame (aunque no tenga título ni pestaña), como el encabezado de un tablero
    if (n.classList.contains('canvas-frame') && !n.classList.contains('is-locked') && typeof getFrames === 'function'
      && clientY - n.getBoundingClientRect().top <= 40) {
      const frame = getFrames().find(f => f.id === n.dataset.frameId);
      if (frame) return { type: 'frame', frame, el: n.querySelector('.frame-drop-bar') || n };
    }
  }
  return null;
}

let imageDropHighlight = null;
function highlightImageDropTarget(target) {
  const el = target ? target.el : null;
  if (imageDropHighlight === el) return;
  if (imageDropHighlight) imageDropHighlight.classList.remove('is-image-drop');
  imageDropHighlight = el;
  if (el) el.classList.add('is-image-drop');
}

function applyImageToTarget(target, ref) {
  if (target.type === 'link') {
    const names = target.owner.linkNames || (target.owner.linkNames = {});
    names[target.url] = { text: linkOption(names, target.url).text || '', hide: false, image: ref };
    showToast('Imagen puesta en el link', 'success');
  } else if (target.type === 'frame') {
    target.frame.image = ref;
    showToast('Imagen puesta en la pestaña del frame', 'success');
  } else if (target.type === 'webwin') {
    target.text.web.image = ref;
    showToast('Imagen puesta en la pestaña de la ventana: tómala de ahí para moverla', 'success');
  } else {
    target.board.image = ref;
    showToast(`Imagen puesta en el tablero "${target.board.title}"`, 'success');
  }
  persist();
  renderBoard();
  renderTexts();
}

// Imagen de otra página: se intenta guardar una copia; si el sitio no lo permite, se usa su dirección
async function imageRefFromUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    if (!res.ok || !blob.type.startsWith('image/')) throw new Error('no es imagen');
    return (await storeImageFile(new File([blob], 'imagen', { type: blob.type }))).id;
  } catch (e) {
    return /^https?:/i.test(url) ? url : null;
  }
}

// Dirección de la imagen arrastrada desde un navegador (o null)
function draggedImageUrl(dt) {
  const html = dt.getData('text/html') || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1].replace(/&amp;/g, '&');
  const uri = (dt.getData('text/uri-list') || '').split('\n').find(l => l && !l.startsWith('#'));
  if (uri && /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(uri.trim())) return uri.trim();
  return null;
}

// Arrastrando desde afuera: se marca el link o tablero de destino
viewportArea.addEventListener('dragover', (e) => {
  const types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
  if (!types.some(t => t === 'Files' || t === 'text/uri-list' || t === 'text/html')) return;
  const target = imageDropTargetAt(e.clientX, e.clientY);
  highlightImageDropTarget(target);
  if (target) {
    e.preventDefault();
    viewportArea.classList.remove('is-drop-target');
  }
}, true);
viewportArea.addEventListener('dragleave', (e) => {
  if (!viewportArea.contains(e.relatedTarget)) highlightImageDropTarget(null);
}, true);
// Soltada sobre un link o un tablero: va a ese link o tablero (antes que los demás manejadores)
viewportArea.addEventListener('drop', async (e) => {
  highlightImageDropTarget(null);
  const dt = e.dataTransfer;
  if (!dt) return;
  const target = imageDropTargetAt(e.clientX, e.clientY);
  if (!target) return;
  const file = Array.from(dt.files || []).find(f => f.type.startsWith('image/'));
  const url = file ? null : draggedImageUrl(dt);
  if (!file && !url) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  viewportArea.classList.remove('is-drop-target');
  const ref = file ? (await storeImageFile(file)).id : await imageRefFromUrl(url);
  if (ref) applyImageToTarget(target, ref);
  else showToast('No se pudo usar esa imagen', 'warning');
}, true);

function transferBgImageToTask(imageId, taskId) {
  const task = tasks.find(t => t.id === taskId);
  const project = getActiveProject();
  const img = getBgImages().find(i => i.id === imageId);
  if (!task || !img) return;
  project.bgImages = getBgImages().filter(i => i.id !== imageId);
  task.images = task.images || [];
  // Una imagen que comparte su archivo con otras (de la Biblioteca) pasa a la tarea con su propia copia:
  // borrar la tarea no debe borrar la imagen de los demás lugares
  if (img.src) {
    copyImageBlob(img.src).then(newId => {
      if (!newId) return;
      task.images.push({ id: newId, w: img.w, h: img.h });
      persist();
      renderBoard();
    });
  } else {
    task.images.push({ id: img.id, w: img.w, h: img.h });
  }
  selection.delete(`img:${imageId}`);
  persist();
  renderBgImages();
  renderBoard();
  showToast(`Imagen movida a la tarea "${task.title.substring(0, 28)}"`, 'success');
}

document.getElementById('copyAllSubtasksBtn').addEventListener('click', () => {
  if (!currentModalSubtasks.length) {
    showToast('Esta tarea no tiene subtareas', 'info');
    return;
  }
  copyWithToast(subtasksAsText(currentModalSubtasks), 'Subtareas copiadas');
});

// Link interno en la descripción: se agrega donde está el cursor (o al final)
document.getElementById('taskInternalLinkBtn').addEventListener('click', () => {
  const start = taskDescInput.selectionStart ?? taskDescInput.value.length;
  const end = taskDescInput.selectionEnd ?? start;
  openInternalLinkPicker(url => {
    const v = taskDescInput.value;
    const before = v.slice(0, start);
    const insert = `${before && !/\s$/.test(before) ? ' ' : ''}${url} `;
    taskDescInput.value = before + insert + v.slice(end);
    taskDescInput.dispatchEvent(new Event('input'));
    taskDescInput.focus();
  });
});

// Texto que muestra cada link de la tarea ({ dirección: texto })
let currentModalLinkNames = {};
document.getElementById('taskLinksBtn').addEventListener('click', () => {
  const urls = extractUrls(taskDescInput.value, ...currentModalSubtasks.map(s => s.text));
  openLinkNamesDialog(urls, currentModalLinkNames, (names) => { currentModalLinkNames = names; });
});

// Imágenes dentro de la ventana de tarea
let currentModalImages = [];
let modalAddedImageIds = [];
const taskImagesGrid = document.getElementById('taskImagesGrid');
const taskImagesDrop = document.getElementById('taskImagesDrop');
const taskImagesAddBtn = document.getElementById('taskImagesAddBtn');
const taskImagesInput = document.getElementById('taskImagesInput');

function renderModalImages() {
  taskImagesGrid.innerHTML = '';
  currentModalImages.forEach((img, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'task-image-thumb';
    thumb.innerHTML = `
      <img alt="" draggable="false">
      <button type="button" class="task-image-remove" title="Quitar imagen">&times;</button>
    `;
    const imgEl = thumb.querySelector('img');
    imgEl.decoding = 'async';
    getImageVariantUrl(img.id, 240).then(url => { if (url) imgEl.src = url; });
    imgEl.addEventListener('click', () => openLightbox(img.id));
    thumb.querySelector('.task-image-remove').addEventListener('click', () => {
      currentModalImages.splice(idx, 1);
      renderModalImages();
    });
    taskImagesGrid.appendChild(thumb);
  });
  taskImagesGrid.style.display = currentModalImages.length ? '' : 'none';
}

async function addImagesToModal(files) {
  for (const file of files) {
    if (!file || !file.type.startsWith('image/')) continue;
    try {
      const info = await storeImageFile(file);
      currentModalImages.push(info);
      modalAddedImageIds.push(info.id);
    } catch (e) {
      showToast('No se pudo agregar la imagen', 'warning');
    }
  }
  renderModalImages();
}

taskImagesAddBtn.addEventListener('click', () => taskImagesInput.click());
taskImagesInput.addEventListener('change', async () => {
  await addImagesToModal(Array.from(taskImagesInput.files));
  taskImagesInput.value = '';
});
taskImagesDrop.addEventListener('dragover', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
    e.preventDefault();
    taskImagesDrop.classList.add('is-drop-target');
  }
});
taskImagesDrop.addEventListener('dragleave', (e) => {
  if (!taskImagesDrop.contains(e.relatedTarget)) taskImagesDrop.classList.remove('is-drop-target');
});
taskImagesDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  taskImagesDrop.classList.remove('is-drop-target');
  addImagesToModal(Array.from(e.dataTransfer.files || []));
});

// Evita que el navegador abra la imagen si se suelta fuera de una zona válida
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
});

// Visor de imagen a pantalla completa
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');

async function openLightbox(imageId) {
  const url = await getImageUrl(imageId);
  if (!url) return;
  lightboxImg.src = url;
  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.removeAttribute('src');
}

lightbox.addEventListener('click', closeLightbox);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});


// Botón del HUD y selector de archivos
btnAddBgImage.addEventListener('click', () => bgImageInput.click());
bgImageInput.addEventListener('change', async () => {
  for (const file of Array.from(bgImageInput.files)) await addBgImageFromFile(file);
  bgImageInput.value = '';
});

// Arrastrar y soltar imágenes sobre el lienzo
viewportArea.addEventListener('dragover', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
    e.preventDefault();
    const card = e.target.closest('.kanban-card');
    highlightDropCard(card);
    viewportArea.classList.toggle('is-drop-target', !card);
  }
});
viewportArea.addEventListener('dragleave', (e) => {
  if (e.target === viewportArea || !viewportArea.contains(e.relatedTarget)) {
    viewportArea.classList.remove('is-drop-target');
    highlightDropCard(null);
  }
});
viewportArea.addEventListener('drop', async (e) => {
  viewportArea.classList.remove('is-drop-target');
  highlightDropCard(null);
  const all = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
  // PDFs soltados en el lienzo: quedan como un archivo (link con ícono) donde se soltaron
  const pdfs = all.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (pdfs.length) {
    e.preventDefault();
    let point = screenToCanvas(e.clientX, e.clientY);
    for (const f of pdfs) { await addPdfFile(f, point); point = { x: point.x + 30, y: point.y + 60 }; }
  }
  const files = all.filter(f => f.type.startsWith('image/'));
  if (files.length === 0) return;
  e.preventDefault();

  // Soltada sobre una tarea: se agrega a la tarea
  const card = e.target.closest('.kanban-card');
  if (card) {
    addFilesToTask(card.dataset.taskId, files);
    return;
  }

  let offset = 0;
  for (const file of files) {
    await addBgImageFromFile(file, e.clientX + offset, e.clientY + offset);
    offset += 30;
  }
});

// Pegar imagen desde el portapapeles (Ctrl+V) cuando no se está escribiendo
document.addEventListener('paste', (e) => {
  const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
  const imageItem = items.find(it => it.type.startsWith('image/'));
  // Con la ventana de tarea abierta, la imagen pegada va a la tarea
  if (taskModal.style.display === 'flex') {
    if (imageItem) {
      e.preventDefault();
      addImagesToModal([imageItem.getAsFile()]);
    }
    return;
  }
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  const anyModalOpen = Array.from(document.querySelectorAll('.modal-backdrop')).some(m => m.style.display === 'flex');
  if (anyModalOpen) return;
  const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
  if (text === CANVAS_CLIPBOARD_MARK && canvasClipboard) {
    e.preventDefault();
    pasteClipboard();
    return;
  }
  if (imageItem) {
    e.preventDefault();
    addBgImageFromFile(imageItem.getAsFile());
  } else if (text && text !== CANVAS_CLIPBOARD_MARK && text.trim()) {
    // Texto copiado en otra app: se agrega como texto del lienzo donde está el puntero
    e.preventDefault();
    addText(text);
  } else if (canvasClipboard && !text) {
    e.preventDefault();
    pasteClipboard();
  }
});


// =============================================================================
// 7d. Caja de herramientas y dibujo sobre el lienzo (por proyecto)
// =============================================================================

const toolbox = document.getElementById('toolbox');
const drawLayer = document.getElementById('drawLayer');
const penOptions = document.getElementById('penOptions');
const penColorsEl = document.getElementById('penColors');
const penSizesEl = document.getElementById('penSizes');
const penCustomColor = document.getElementById('penCustomColor');
const shapePickerEl = document.getElementById('shapePicker');
const SVG_NS = 'http://www.w3.org/2000/svg';

const PEN_COLORS = ['#f8fafc', '#0f172a', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];
const PEN_SIZES = [2, 4, 8, 14];
const PEN_PREFS_KEY = 'zenban_pen_prefs_v1';

let currentTool = 'select';
let penPrefs = loadData(PEN_PREFS_KEY, { color: '#f43f5e', size: 4 });
const undoStack = [];

function isDrawingTool() {
  return currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'arrow';
}

function getDrawings() {
  const project = getActiveProject();
  if (!project.drawings) project.drawings = [];
  return project.drawings;
}

function setTool(tool) {
  currentTool = tool;
  toolbox.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));

  isPanModeActive = tool === 'hand';
  btnPanMode.classList.toggle('active', isPanModeActive);
  viewportArea.classList.toggle('pan-mode', isPanModeActive);
  viewportArea.classList.toggle('tool-pen', tool === 'pen');
  viewportArea.classList.toggle('tool-eraser', tool === 'eraser');
  viewportArea.classList.toggle('tool-text', tool === 'text');
  viewportArea.classList.toggle('tool-arrow', tool === 'arrow');
  viewportArea.classList.toggle('tool-connector', tool === 'connector');
  // La flecha y las formas usan el mismo color y grosor que el lápiz
  penOptions.hidden = tool !== 'pen' && tool !== 'arrow';
  shapePickerEl.hidden = tool !== 'arrow';
  eraserOptions.hidden = tool !== 'eraser';
  if (tool !== 'eraser') eraserCursor.hidden = true;

  if (isDrawingTool() && selection.size) setSelection([]);
  if (typeof updateConnectHandle === 'function') updateConnectHandle();
}

// Construye un trazo suave (curvas por puntos medios)
function strokeToPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} L ${x + 0.01} ${y}`;
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    d += ` Q ${x1} ${y1} ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

// Flecha: una línea del primer punto al segundo con la punta en el segundo
function arrowToPath(stroke) {
  const [[x1, y1], [x2, y2]] = stroke.points.length > 1 ? stroke.points : [stroke.points[0], stroke.points[0]];
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const head = Math.min(stroke.size * 3.5 + 4, len * 0.5);
  const spread = Math.PI / 7;
  const hx1 = x2 - head * Math.cos(angle - spread);
  const hy1 = y2 - head * Math.sin(angle - spread);
  const hx2 = x2 - head * Math.cos(angle + spread);
  const hy2 = y2 - head * Math.sin(angle + spread);
  const f = (n) => +n.toFixed(1);
  return `M ${x1} ${y1} L ${x2} ${y2} M ${f(hx1)} ${f(hy1)} L ${x2} ${y2} L ${f(hx2)} ${f(hy2)}`;
}

// ----- Formas básicas (en el mismo botón que la flecha) -----
// Se guardan como trazos de dos puntos (esquinas opuestas del recuadro, o inicio y fin de la línea) con
// stroke.shape; así se mueven, escalan, borran y deshacen igual que la flecha.
const SHAPES = [
  { id: 'arrow', label: 'Flecha', icon: '<line x1="5" y1="19" x2="19" y2="5"></line><polyline points="10 5 19 5 19 14"></polyline>' },
  { id: 'line', label: 'Línea', icon: '<line x1="5" y1="19" x2="19" y2="5"></line>' },
  { id: 'dashed', label: 'Línea segmentada', icon: '<line x1="5" y1="19" x2="19" y2="5" stroke-dasharray="3.5 3"></line>' },
  { id: 'rect', label: 'Cuadrado', icon: '<rect x="4" y="4" width="16" height="16" rx="1.5"></rect>' },
  { id: 'ellipse', label: 'Círculo', icon: '<circle cx="12" cy="12" r="8.5"></circle>' },
  { id: 'triangle', label: 'Triángulo', icon: '<path d="M12 4 L20.5 19.5 H3.5 Z"></path>' },
  { id: 'diamond', label: 'Rombo', icon: '<path d="M12 3 L21 12 L12 21 L3 12 Z"></path>' }
];

function isTwoPointStroke(stroke) {
  return !!(stroke.arrow || stroke.shape);
}

// Contorno de la forma como polilínea (para dibujarla, tocarla, borrarla y seleccionarla con recuadro)
function shapeOutline(stroke) {
  const [[x1, y1], [x2, y2]] = stroke.points.length > 1 ? stroke.points : [stroke.points[0], stroke.points[0]];
  const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
  const cx = (l + r) / 2, cy = (t + b) / 2;
  switch (stroke.shape) {
    case 'rect': return [[l, t], [r, t], [r, b], [l, b], [l, t]];
    case 'triangle': return [[cx, t], [r, b], [l, b], [cx, t]];
    case 'diamond': return [[cx, t], [r, cy], [cx, b], [l, cy], [cx, t]];
    case 'ellipse': {
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push([cx + ((r - l) / 2) * Math.cos(a), cy + ((b - t) / 2) * Math.sin(a)]);
      }
      return pts;
    }
    default: return [[x1, y1], [x2, y2]]; // flecha, línea y línea segmentada
  }
}

function shapeToPath(stroke) {
  const f = (n) => +n.toFixed(1);
  if (stroke.shape === 'ellipse') {
    const [[x1, y1], [x2, y2]] = stroke.points;
    const rx = f(Math.abs(x2 - x1) / 2), ry = f(Math.abs(y2 - y1) / 2);
    const cx = f((x1 + x2) / 2), cy = f((y1 + y2) / 2);
    return `M ${f(cx - rx)} ${cy} A ${rx} ${ry} 0 1 0 ${f(cx + rx)} ${cy} A ${rx} ${ry} 0 1 0 ${f(cx - rx)} ${cy} Z`;
  }
  const pts = shapeOutline(stroke);
  const closed = pts.length > 2;
  return pts.slice(0, closed ? -1 : pts.length).map(([x, y], i) => `${i ? 'L' : 'M'} ${f(x)} ${f(y)}`).join(' ') + (closed ? ' Z' : '');
}

function strokePathD(stroke) {
  if (stroke.arrow) return arrowToPath(stroke);
  return stroke.shape ? shapeToPath(stroke) : strokeToPath(stroke.points);
}

// Grosor, punta de la flecha y segmentos de la línea segmentada dependen del grosor del trazo
function applyStrokeAttrs(path, stroke) {
  path.setAttribute('d', strokePathD(stroke));
  path.setAttribute('stroke-width', stroke.size);
  if (stroke.shape === 'dashed') path.setAttribute('stroke-dasharray', `${+(stroke.size * 3).toFixed(2)} ${+(stroke.size * 2.5).toFixed(2)}`);
}

function createStrokeEl(stroke) {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke', stroke.color);
  applyStrokeAttrs(path, stroke);
  path.dataset.strokeId = stroke.id;
  return path;
}

function renderDrawings() {
  drawLayer.innerHTML = '';
  getDrawings().forEach(stroke => drawLayer.appendChild(createStrokeEl(stroke)));
  applySelectionVisuals();
}

function renderPenOptions() {
  penColorsEl.innerHTML = '';
  PEN_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pen-color ${penPrefs.color.toLowerCase() === color ? 'active' : ''}`;
    btn.style.backgroundColor = color;
    btn.title = color;
    btn.addEventListener('click', () => {
      penPrefs.color = color;
      saveData(PEN_PREFS_KEY, penPrefs);
      renderPenOptions();
    });
    penColorsEl.appendChild(btn);
  });
  penCustomColor.value = penPrefs.color;
  penCustomColor.classList.toggle('active', !PEN_COLORS.includes(penPrefs.color.toLowerCase()));

  penSizesEl.innerHTML = '';
  PEN_SIZES.forEach(size => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pen-size ${penPrefs.size === size ? 'active' : ''}`;
    btn.title = `Grosor ${size}`;
    btn.innerHTML = `<span style="width:${Math.max(3, size)}px;height:${Math.max(3, size)}px;background:${penPrefs.color}"></span>`;
    btn.addEventListener('click', () => {
      penPrefs.size = size;
      saveData(PEN_PREFS_KEY, penPrefs);
      renderPenOptions();
    });
    penSizesEl.appendChild(btn);
  });
  renderShapePicker();
}

// Formas del botón Flecha: la elegida queda como ícono del botón
function currentShape() {
  return SHAPES.find(s => s.id === penPrefs.shape) || SHAPES[0];
}

function renderShapePicker() {
  const svg = (icon) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
  const shape = currentShape();
  shapePickerEl.innerHTML = '';
  SHAPES.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `shape-btn ${s.id === shape.id ? 'active' : ''}`;
    btn.title = s.label;
    btn.setAttribute('aria-label', s.label);
    btn.innerHTML = svg(s.icon);
    btn.addEventListener('click', () => {
      penPrefs.shape = s.id;
      saveData(PEN_PREFS_KEY, penPrefs);
      renderShapePicker();
    });
    shapePickerEl.appendChild(btn);
  });
  const toolBtn = toolbox.querySelector('.tool-btn[data-tool="arrow"]');
  if (toolBtn) {
    toolBtn.innerHTML = svg(shape.icon);
    toolBtn.title = `${shape.label} (A): arrastra para dibujarla (Shift: ángulos de 45° o proporción exacta). Elige la forma al lado`;
    toolBtn.setAttribute('aria-label', 'Flecha y formas');
  }
}

penCustomColor.addEventListener('input', () => {
  penPrefs.color = penCustomColor.value;
  saveData(PEN_PREFS_KEY, penPrefs);
  renderPenOptions();
});

// ----- Dibujo y borrado con puntero (mouse, lápiz o dedo) -----
let activeStroke = null;
let activeStrokeEl = null;
let drawPointerId = null;
let erasedInGesture = [];

// ----- Tamaño del borrador (diámetro en pantalla) y círculo que lo muestra al moverlo -----
const ERASER_SIZES = [12, 24, 48, 96];
const ERASER_PREFS_KEY = 'zenban_eraser_prefs_v1';
let eraserPrefs = loadData(ERASER_PREFS_KEY, { size: 24 });
const eraserOptions = document.getElementById('eraserOptions');
const eraserSizesEl = document.getElementById('eraserSizes');
const eraserCursor = document.createElement('div');
eraserCursor.className = 'eraser-cursor';
eraserCursor.hidden = true;
viewportArea.appendChild(eraserCursor);

function renderEraserOptions() {
  eraserSizesEl.innerHTML = '';
  ERASER_SIZES.forEach(size => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pen-size eraser-size ${eraserPrefs.size === size ? 'active' : ''}`;
    btn.title = `Borrador de ${size} px`;
    const dot = Math.round(4 + (ERASER_SIZES.indexOf(size) / (ERASER_SIZES.length - 1)) * 16);
    btn.innerHTML = `<span style="width:${dot}px;height:${dot}px"></span>`;
    btn.addEventListener('click', () => {
      eraserPrefs.size = size;
      saveData(ERASER_PREFS_KEY, eraserPrefs);
      renderEraserOptions();
    });
    eraserSizesEl.appendChild(btn);
  });
  document.getElementById('eraserSizeLabel').textContent = `Tamaño ${eraserPrefs.size} px`;
  eraserCursor.style.width = eraserCursor.style.height = `${eraserPrefs.size}px`;
}

function moveEraserCursor(clientX, clientY) {
  const rect = viewportArea.getBoundingClientRect();
  eraserCursor.style.transform = `translate(${clientX - rect.left - eraserPrefs.size / 2}px, ${clientY - rect.top - eraserPrefs.size / 2}px)`;
  eraserCursor.hidden = false;
}

viewportArea.addEventListener('pointermove', (e) => {
  if (currentTool !== 'eraser') return;
  if (e.target.closest('.toolbox, .zoom-hud, .mobile-fab, .context-bar')) { eraserCursor.hidden = true; return; }
  moveEraserCursor(e.clientX, e.clientY);
});
viewportArea.addEventListener('pointerleave', () => { eraserCursor.hidden = true; });
// En pantallas táctiles el círculo se ve solo mientras se borra
viewportArea.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') eraserCursor.hidden = true; });

function eraseAt(clientX, clientY) {
  moveEraserCursor(clientX, clientY);
  const p = screenToCanvas(clientX, clientY);
  const radius = eraserPrefs.size / 2 / zoom;
  const drawings = getDrawings();
  for (let i = drawings.length - 1; i >= 0; i--) {
    const stroke = drawings[i];
    const reach = radius + stroke.size / 2;
    const pts = isTwoPointStroke(stroke) && stroke.points.length > 1 ? shapeOutline(stroke) : stroke.points;
    const hit = isTwoPointStroke(stroke) && pts.length > 1
      ? pts.slice(1).some(([x, y], j) => distToSegment(p.x, p.y, pts[j][0], pts[j][1], x, y) <= reach)
      : pts.some(([x, y]) => Math.hypot(x - p.x, y - p.y) <= reach);
    if (hit) {
      erasedInGesture.push({ stroke, index: i });
      drawings.splice(i, 1);
      const el = drawLayer.querySelector(`[data-stroke-id="${stroke.id}"]`);
      if (el) el.remove();
    }
  }
}

viewportArea.addEventListener('pointerdown', (e) => {
  if (!isDrawingTool() || isSpacePressed || e.button !== 0) return;
  if (e.target.closest('.toolbox, .zoom-hud, .mobile-fab')) return;
  // Un segundo dedo cancela el trazo para permitir el zoom con pellizco
  if (drawPointerId !== null && e.pointerId !== drawPointerId) {
    if (activeStrokeEl) activeStrokeEl.remove();
    activeStroke = null;
    activeStrokeEl = null;
    drawPointerId = null;
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  drawPointerId = e.pointerId;
  viewportArea.setPointerCapture(e.pointerId);

  if (currentTool === 'arrow') {
    const p = screenToCanvas(e.clientX, e.clientY);
    const start = [+p.x.toFixed(1), +p.y.toFixed(1)];
    const shape = currentShape().id;
    activeStroke = {
      id: generateId('stroke'),
      ...(shape === 'arrow' ? { arrow: true } : { shape }),
      color: penPrefs.color,
      size: +(penPrefs.size / zoom).toFixed(2),
      points: [start, start.slice()]
    };
    activeStrokeEl = createStrokeEl(activeStroke);
    drawLayer.appendChild(activeStrokeEl);
  } else if (currentTool === 'pen') {
    const p = screenToCanvas(e.clientX, e.clientY);
    activeStroke = {
      id: generateId('stroke'),
      color: penPrefs.color,
      size: +(penPrefs.size / zoom).toFixed(2),
      points: [[+p.x.toFixed(1), +p.y.toFixed(1)]]
    };
    activeStrokeEl = createStrokeEl(activeStroke);
    drawLayer.appendChild(activeStrokeEl);
  } else {
    erasedInGesture = [];
    eraseAt(e.clientX, e.clientY);
  }
}, true);

viewportArea.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drawPointerId) return;
  if (currentTool === 'arrow' && activeStroke) {
    const p = screenToCanvas(e.clientX, e.clientY);
    const [x1, y1] = activeStroke.points[0];
    let x2 = p.x;
    let y2 = p.y;
    const boxShape = ['rect', 'ellipse', 'triangle', 'diamond'].includes(activeStroke.shape);
    // Con Shift las formas quedan con el mismo ancho que alto (cuadrado, círculo…)
    if (e.shiftKey && boxShape) {
      const side = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      x2 = x1 + side * (x2 < x1 ? -1 : 1);
      y2 = y1 + side * (y2 < y1 ? -1 : 1);
    } else if (e.shiftKey) {
      // y las flechas y líneas en ángulos de 45°
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(y2 - y1, x2 - x1) / step) * step;
      const len = Math.hypot(x2 - x1, y2 - y1);
      x2 = x1 + len * Math.cos(angle);
      y2 = y1 + len * Math.sin(angle);
    }
    activeStroke.points[1] = [+x2.toFixed(1), +y2.toFixed(1)];
    activeStrokeEl.setAttribute('d', strokePathD(activeStroke));
  } else if (currentTool === 'pen' && activeStroke) {
    const p = screenToCanvas(e.clientX, e.clientY);
    const last = activeStroke.points[activeStroke.points.length - 1];
    // Ignora puntos demasiado cercanos para mantener los trazos livianos
    if (Math.hypot(p.x - last[0], p.y - last[1]) < 1.5 / zoom) return;
    activeStroke.points.push([+p.x.toFixed(1), +p.y.toFixed(1)]);
    activeStrokeEl.setAttribute('d', strokeToPath(activeStroke.points));
  } else if (currentTool === 'eraser') {
    eraseAt(e.clientX, e.clientY);
  }
});

function endDrawGesture(e) {
  if (e.pointerId !== drawPointerId) return;
  drawPointerId = null;
  // Una flecha o forma sin largo (solo un toque) no se guarda
  if (activeStroke && isTwoPointStroke(activeStroke)) {
    const [[x1, y1], [x2, y2]] = activeStroke.points;
    if (Math.hypot(x2 - x1, y2 - y1) < 6 / zoom) {
      if (activeStrokeEl) activeStrokeEl.remove();
      activeStroke = null;
      activeStrokeEl = null;
      return;
    }
  }
  if (activeStroke) {
    getDrawings().push(activeStroke);
    undoStack.push({ type: 'add', stroke: activeStroke });
    activeStroke = null;
    activeStrokeEl = null;
    persist();
  } else if (erasedInGesture.length > 0) {
    undoStack.push({ type: 'erase', items: erasedInGesture });
    erasedInGesture = [];
    persist();
  }
}

viewportArea.addEventListener('pointerup', endDrawGesture);
viewportArea.addEventListener('pointercancel', endDrawGesture);

function undoDrawing() {
  const action = undoStack.pop();
  if (!action) {
    showToast('No hay dibujos para deshacer', 'info');
    return;
  }
  const drawings = getDrawings();
  if (action.type === 'add') {
    const idx = drawings.findIndex(s => s.id === action.stroke.id);
    if (idx >= 0) drawings.splice(idx, 1);
  } else if (action.type === 'erase') {
    action.items.slice().reverse().forEach(({ stroke, index }) => {
      drawings.splice(Math.min(index, drawings.length), 0, stroke);
    });
  } else if (action.type === 'clear') {
    getActiveProject().drawings = action.strokes;
  }
  persist();
  renderDrawings();
}

async function clearDrawings() {
  const drawings = getDrawings();
  if (drawings.length === 0) {
    showToast('No hay dibujos en este proyecto', 'info');
    return;
  }
  const ok = await askConfirm({
    title: '¿Borrar todos los dibujos?',
    message: `Se borrarán los ${drawings.length} trazo(s) de este proyecto. Puedes recuperarlos con Ctrl+Z.`,
    confirmText: 'Borrar dibujos', danger: true
  });
  if (!ok) return;
  undoStack.push({ type: 'clear', strokes: drawings.slice() });
  getActiveProject().drawings = [];
  persist();
  renderDrawings();
  showToast('Dibujos borrados (Ctrl+Z para recuperarlos)', 'warning');
}

// Tocar la herramienta que ya está activa vuelve a Seleccionar (como el botón de la mano de abajo)
toolbox.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    setTool(tool === currentTool && tool !== 'select' ? 'select' : tool);
  });
});
document.getElementById('toolUndo').addEventListener('click', undoLastChange);
document.getElementById('toolClear').addEventListener('click', clearDrawings);

// Atajos: V, P, E, H y Ctrl+Z
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const anyModalOpen = Array.from(document.querySelectorAll('.modal-backdrop')).some(m => m.style.display === 'flex');
  if (anyModalOpen) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoLastChange();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { v: 'select', p: 'pen', e: 'eraser', h: 'hand', t: 'text', a: 'arrow' };
  const tool = map[e.key.toLowerCase()];
  if (tool) setTool(tool);
});

renderPenOptions();
renderEraserOptions();

// =============================================================================
// 7e. Lienzo libre tipo Miro: tableros (marcos con columnas hijas),
//     trazos e imágenes; selección múltiple y arrastre de columnas entre tableros
// =============================================================================

const COLUMN_LAYOUT = { ORIGIN_X: 40, ORIGIN_Y: 32, WIDTH: 330, GAP: 24 };
let boards = [];

function isDoneColumn(id) {
  return id === 'done' || String(id).startsWith('done-');
}

// Garantiza que el proyecto activo tenga tableros y que cada columna pertenezca a uno
function ensureBoards() {
  const project = getActiveProject();
  let changed = false;
  if (!Array.isArray(project.boards)) {
    project.boards = [];
    if (columns.length > 0) {
      const xs = columns.filter(c => typeof c.x === 'number').map(c => c.x);
      const ys = columns.filter(c => typeof c.y === 'number').map(c => c.y);
      project.boards.push({
        id: generateId('board'),
        title: 'Tablero principal',
        color: '#6366f1',
        x: xs.length ? Math.min(...xs) : COLUMN_LAYOUT.ORIGIN_X,
        y: ys.length ? Math.min(...ys) : COLUMN_LAYOUT.ORIGIN_Y
      });
      // Respeta el orden horizontal que tenían las columnas
      if (xs.length) columns.sort((p, q) => (p.x || 0) - (q.x || 0));
    }
    changed = true;
  }
  boards = project.boards;
  if (boards.length > 0) {
    columns.forEach(c => {
      if (!c.boardId || !boards.some(b => b.id === c.boardId)) { c.boardId = boards[0].id; changed = true; }
      if ('x' in c || 'y' in c) { delete c.x; delete c.y; changed = true; }
    });
  }
  if (changed) persist();
}

function getBoardEl(id) {
  return kanbanBoard.querySelector(`.board-frame[data-board-id="${id}"]`);
}

function getColumnEl(id) {
  return kanbanBoard.querySelector(`.kanban-column[data-column-id="${id}"]`);
}

// ----- Ventana de tablero (crear / editar / eliminar) -----
const boardModal = document.getElementById('boardModal');
const boardForm = document.getElementById('boardForm');
const boardModalTitle = document.getElementById('boardModalTitle');
const boardIdInput = document.getElementById('boardId');
const boardTitleInput = document.getElementById('boardTitleInput');
const boardColorInput = document.getElementById('boardColorInput');
const boardColorPalette = document.getElementById('boardColorPalette');
const boardTemplateGroup = document.getElementById('boardTemplateGroup');
const boardTemplateSelect = document.getElementById('boardTemplateSelect');
const deleteBoardBtn = document.getElementById('deleteBoardBtn');

// Imagen del tablero (pestaña arriba a la izquierda para reconocerlo y arrastrarlo)
const boardImagePreview = document.getElementById('boardImagePreview');
const boardImageInput = document.getElementById('boardImageInput');
const boardImageRemoveBtn = document.getElementById('boardImageRemoveBtn');
let boardModalImage = null;

function renderBoardImageField() {
  boardImagePreview.innerHTML = boardModalImage ? `<img data-board-img="${escapeHtml(boardModalImage)}" alt="">` : '<span>Sin imagen</span>';
  boardImageRemoveBtn.hidden = !boardModalImage;
  hydrateBoardImages(boardImagePreview);
}

document.getElementById('boardImagePickBtn').addEventListener('click', () => boardImageInput.click());
boardImageRemoveBtn.addEventListener('click', () => { boardModalImage = null; renderBoardImageField(); });
boardImageInput.addEventListener('change', async () => {
  const file = boardImageInput.files && boardImageInput.files[0];
  boardImageInput.value = '';
  if (!file) return;
  try {
    boardModalImage = (await storeImageFile(file)).id;
    renderBoardImageField();
  } catch (e) {
    showToast('No se pudo usar esa imagen', 'warning');
  }
});

function hydrateBoardImages(root = document) {
  root.querySelectorAll('img[data-board-img]:not([src])').forEach(img => {
    const id = img.dataset.boardImg;
    if (isRemoteImage(id)) { img.src = id; return; }
    const cached = cachedImageVariant(id, 480);
    if (cached) { img.src = cached; return; }
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    getImageVariantUrl(id, 480).then(url => { if (url) img.src = url; });
  });
}

window.openBoardModal = function(boardId = null) {
  if (modalAlreadyOpen(document.getElementById('boardModal'))) return;
  ensureBoards();
  if (boardId) {
    const board = boards.find(b => b.id === boardId);
    if (!board) return;
    boardModalTitle.textContent = 'Editar Tablero';
    boardIdInput.value = board.id;
    boardTitleInput.value = board.title;
    boardColorInput.value = board.color || '#6366f1';
    boardModalImage = board.image || null;
    boardTemplateGroup.style.display = 'none';
    deleteBoardBtn.style.display = 'block';
  } else {
    boardModalTitle.textContent = 'Nuevo Tablero';
    boardIdInput.value = '';
    boardTitleInput.value = '';
    boardColorInput.value = PALETTE_COLORS[boards.length % PALETTE_COLORS.length];
    boardModalImage = null;
    boardTemplateGroup.style.display = '';
    boardTemplateSelect.value = 'basic';
    deleteBoardBtn.style.display = 'none';
  }
  renderBoardImageField();
  buildColorPalette(boardColorPalette, boardColorInput);
  boardModal.style.display = 'flex';
  setTimeout(() => boardTitleInput.focus(), 60);
};

function closeBoardModal() {
  boardModal.style.display = 'none';
}

document.getElementById('closeBoardModalBtn').addEventListener('click', closeBoardModal);
document.getElementById('cancelBoardBtn').addEventListener('click', closeBoardModal);

boardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = boardTitleInput.value.trim();
  if (!title) return;
  const id = boardIdInput.value;

  if (id) {
    const board = boards.find(b => b.id === id);
    if (board) {
      board.title = title;
      board.color = boardColorInput.value;
      if (boardModalImage) board.image = boardModalImage;
      else delete board.image;
    }
    showToast('Tablero actualizado', 'info');
  } else {
    // Se crea a la derecha de todo el contenido, sin encimarse con otros tableros
    const hasContent = boards.length > 0 || getBgImages().length > 0 || getDrawings().length > 0 || getTexts().length > 0;
    const bounds = getContentBounds();
    const board = {
      id: generateId('board'),
      title: title,
      color: boardColorInput.value,
      x: hasContent ? Math.round(bounds.maxX + 80) : COLUMN_LAYOUT.ORIGIN_X,
      y: hasContent ? Math.round(bounds.minY) : COLUMN_LAYOUT.ORIGIN_Y
    };
    if (boardModalImage) board.image = boardModalImage;
    // Lleva la vista hasta el nuevo tablero
    panX = 90 - board.x * zoom;
    panY = 40 - board.y * zoom;
    applyTransform(true);
    boards.push(board);
    const template = PROJECT_TEMPLATES[boardTemplateSelect.value] || [];
    const suffix = Math.random().toString(36).substr(2, 5);
    template.forEach(t => columns.push({ id: `${t.id}-${suffix}`, title: t.title, color: t.color, boardId: board.id }));
    selection = new Set([`board:${board.id}`]);
    showToast(`Tablero "${title}" creado`, 'success');
  }
  persist();
  closeBoardModal();
  renderBoard();
  renderProjectSwitcher();
});

deleteBoardBtn.addEventListener('click', async () => {
  const id = boardIdInput.value;
  const board = boards.find(b => b.id === id);
  if (!board) return;
  const colIds = columns.filter(c => c.boardId === id).map(c => c.id);
  const taskCount = tasks.filter(t => colIds.includes(t.columnId)).length;
  const ok = await askConfirm({
    title: `¿Eliminar el tablero «${board.title}»?`,
    message: taskCount > 0 ? `Se borrarán sus ${colIds.length} columna(s) y ${taskCount} tarea(s). No se puede deshacer.` : 'No tiene tareas.',
    confirmText: 'Eliminar tablero', danger: true
  });
  if (!ok) return;

  tasks.filter(t => colIds.includes(t.columnId)).forEach(deleteTaskImages);
  tasks = tasks.filter(t => !colIds.includes(t.columnId));
  columns = columns.filter(c => c.boardId !== id);
  getActiveProject().boards = boards.filter(b => b.id !== id);
  boards = getActiveProject().boards;
  selection.delete(`board:${id}`);
  persist();
  closeBoardModal();
  renderBoard();
  renderProjectSwitcher();
  showToast('Tablero eliminado', 'warning');
});

document.getElementById('toolNewBoard').addEventListener('click', () => openBoardModal());

// ----- Límites del contenido (para "ajustar a pantalla") -----
function getContentBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const extend = (x, y, w, h) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  };
  boards.forEach(b => {
    const el = getBoardEl(b.id);
    extend(b.x, b.y, (el ? el.offsetWidth : 600) * boardScale(b), (el ? el.offsetHeight : 300) * boardScale(b));
    // La pestaña con la imagen del tablero sobresale hacia arriba
    const tab = el && el.querySelector('.board-image-tab');
    if (tab) extend(b.x, b.y - tab.offsetHeight, tab.offsetWidth, tab.offsetHeight);
  });
  getBgImages().forEach(i => extend(i.x, i.y, i.w, i.h));
  getTexts().forEach(t => {
    const el = getTextEl(t.id);
    extend(t.x, t.y, el ? el.offsetWidth : t.w, el ? el.offsetHeight : t.size * 1.3);
  });
  if (typeof getFrames === 'function') getFrames().forEach(f => extend(f.x, f.y, f.w, f.h));
  getDrawings().forEach(s => s.points.forEach(([x, y]) => extend(x, y, 0, 0)));
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 500, maxY: 300 };
  return { minX, minY, maxX, maxY };
}

// ----- Selección -----
let selection = new Set();
let selectGestureActive = false;
let handlesFollowDrag = false; // durante un arrastre las manijas se mueven junto al objeto (startGroupDrag)

function applySelectionVisuals() {
  if (typeof applyFrameSelection === 'function') applyFrameSelection();
  kanbanBoard.querySelectorAll('.board-frame').forEach(el => {
    el.classList.toggle('is-selected', selection.has(`board:${el.dataset.boardId}`));
  });
  drawLayer.querySelectorAll('path').forEach(p => {
    p.classList.toggle('is-selected', selection.has(`stroke:${p.dataset.strokeId}`));
  });
  const imgKeys = [...selection].filter(k => k.startsWith('img:'));
  const solo = selection.size === 1 && imgKeys.length === 1;
  selectedBgImageId = solo ? imgKeys[0].slice(4) : null;
  bgImageLayer.classList.toggle('has-selection', imgKeys.length > 0);
  bgImageLayer.querySelectorAll('.bg-image').forEach(el => {
    const sel = selection.has(`img:${el.dataset.imageId}`);
    el.classList.toggle('is-selected', sel);
    el.classList.toggle('is-solo', sel && solo);
  });
  const textSolo = selection.size === 1 && [...selection][0].startsWith('text:');
  textLayer.querySelectorAll('.canvas-text').forEach(el => {
    const sel = selection.has(`text:${el.dataset.textId}`);
    el.classList.toggle('is-selected', sel);
    el.classList.toggle('is-solo', sel && textSolo);
  });
  updateContextBar();
}

function setSelection(keys) {
  selection = new Set(expandGroups(keys));
  applySelectionVisuals();
}

// ----- Grupos: objetos del lienzo (tableros, textos, imágenes, trazos) que se seleccionan y mueven juntos -----
function canvasObjectsByKey() {
  const map = new Map();
  boards.forEach(o => map.set(`board:${o.id}`, o));
  getTexts().forEach(o => map.set(`text:${o.id}`, o));
  getBgImages().forEach(o => map.set(`img:${o.id}`, o));
  getDrawings().forEach(o => map.set(`stroke:${o.id}`, o));
  if (typeof getFrames === 'function') {
    getFrames().forEach(o => map.set(`frame:${o.id}`, o));
    getConnectors().forEach(o => map.set(`conn:${o.id}`, o));
  }
  return map;
}

// Al tomar un objeto de un grupo se toma el grupo completo
function expandGroups(keys) {
  const list = [...keys];
  const objs = canvasObjectsByKey();
  const groups = new Set(list.map(k => objs.get(k)).filter(o => o && o.group).map(o => o.group));
  if (!groups.size) return list;
  objs.forEach((o, k) => { if (o.group && groups.has(o.group) && !list.includes(k)) list.push(k); });
  return list;
}

function groupKeysFor(key) {
  return expandGroups([key]);
}

function selectionGroups() {
  const objs = canvasObjectsByKey();
  return new Set([...selection].map(k => objs.get(k)).filter(o => o && o.group).map(o => o.group));
}

function groupSelection() {
  if (selection.size < 2) { showToast('Selecciona dos o más objetos para agruparlos', 'info'); return; }
  const id = generateId('grp');
  const objs = canvasObjectsByKey();
  [...selection].forEach(k => { const o = objs.get(k); if (o) o.group = id; });
  persist();
  applySelectionVisuals();
  showToast(`${selection.size} objetos agrupados: se mueven juntos`, 'success');
}

function ungroupSelection() {
  const groups = selectionGroups();
  if (!groups.size) { showToast('Lo seleccionado no está agrupado', 'info'); return; }
  canvasObjectsByKey().forEach(o => { if (o.group && groups.has(o.group)) delete o.group; });
  persist();
  applySelectionVisuals();
  showToast('Grupo deshecho', 'success');
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Trazo bajo el puntero (el de más arriba)
function hitStroke(clientX, clientY) {
  const p = screenToCanvas(clientX, clientY);
  const drawings = getDrawings();
  for (let i = drawings.length - 1; i >= 0; i--) {
    const s = drawings[i];
    const tol = 6 / zoom + s.size / 2;
    // Las formas se tocan por su contorno (un cuadrado solo guarda dos esquinas)
    const pts = s.shape && s.points.length > 1 ? shapeOutline(s) : s.points;
    if (pts.length === 1 && Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) <= tol) return s.id;
    for (let j = 1; j < pts.length; j++) {
      if (distToSegment(p.x, p.y, pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1]) <= tol) return s.id;
    }
  }
  return null;
}

// Mueve todo lo seleccionado (tableros con sus columnas, trazos e imágenes)
function startGroupDrag(e) {
  const startX = e.clientX;
  const startY = e.clientY;
  // Un frame se lleva lo que tiene dentro (textos, notas, imágenes, dibujos y otros frames)
  const moveKeys = new Set(selection);
  if (typeof objectsInsideFrame === 'function') {
    getFrames().filter(f => selection.has(`frame:${f.id}`)).forEach(f => objectsInsideFrame(f).forEach(k => moveKeys.add(k)));
  }
  const brds = boards.filter(b => moveKeys.has(`board:${b.id}`)).map(b => ({ b, el: getBoardEl(b.id), x: b.x, y: b.y }));
  const strokes = getDrawings().filter(s => moveKeys.has(`stroke:${s.id}`)).map(s => ({ s, el: drawLayer.querySelector(`[data-stroke-id="${s.id}"]`) }));
  const imgs = getBgImages().filter(i => moveKeys.has(`img:${i.id}`)).map(i => ({ i, el: bgImageLayer.querySelector(`.bg-image[data-image-id="${i.id}"]`), x: i.x, y: i.y }));
  const txts = getTexts().filter(t => moveKeys.has(`text:${t.id}`)).map(t => ({ t, el: getTextEl(t.id), x: t.x, y: t.y }));
  const frms = typeof getFrames === 'function' ? getFrames().filter(f => moveKeys.has(`frame:${f.id}`)).map(f => ({ f, el: getFrameEl(f.id), x: f.x, y: f.y })) : [];
  const singleImg = selection.size === 1 && imgs.length === 1 ? imgs[0] : null;
  // Solo se redibujan las flechas en cada cuadro si alguna toca lo que se mueve (redibujarlas siempre
  // costaba ~40 veces más por cuadro y en el celular el arrastre se trababa)
  const movesConnectors = typeof getConnectors === 'function' && getConnectors().some(c => moveKeys.has(endpointKey(c.from)) || moveKeys.has(endpointKey(c.to)));
  let moved = false, dx = 0, dy = 0, targetCard = null, imageTarget = null;
  // Las manijas (conector y progreso de listas) acompañan al objeto: se corren lo mismo que él, sin
  // volver a medirlo en cada cuadro (eso trababa el celular)
  const handles = [typeof connectHandle !== 'undefined' && connectHandle, typeof ytListHandle !== 'undefined' && ytListHandle,
    typeof selScaleHandle !== 'undefined' && selScaleHandle, typeof selScaleBox !== 'undefined' && selScaleBox]
    .filter(h => h && !h.hidden).map(h => ({ h, x: parseFloat(h.style.left) || 0, y: parseFloat(h.style.top) || 0 }));

  selectGestureActive = true;
  handlesFollowDrag = handles.length > 0;
  viewportArea.setPointerCapture(e.pointerId);

  // Punto del lienzo donde empezó el arrastre: si el lienzo se desplaza (bordes, rueda) lo arrastrado
  // sigue bajo el puntero
  const startWX = (startX - panX) / zoom;
  const startWY = (startY - panY) / zoom;
  let lastX = startX, lastY = startY, stopAutoPan = null;

  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
    if (!moved) {
      brds.forEach(o => o.el && o.el.classList.add('is-moving'));
      stopAutoPan = startEdgeAutoPan(() => ({ x: lastX, y: lastY }), () => moveTo(lastX, lastY));
    }
    moved = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    moveTo(lastX, lastY);
  };

  const moveTo = (clientX, clientY) => {
    dx = (clientX - panX) / zoom - startWX;
    dy = (clientY - panY) / zoom - startWY;
    brds.forEach(o => {
      o.b.x = Math.round(o.x + dx);
      o.b.y = Math.round(o.y + dy);
      if (o.el) { o.el.style.left = `${o.b.x}px`; o.el.style.top = `${o.b.y}px`; }
    });
    strokes.forEach(o => o.el && o.el.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`));
    imgs.forEach(o => {
      o.i.x = Math.round(o.x + dx);
      o.i.y = Math.round(o.y + dy);
      if (o.el) { o.el.style.left = `${o.i.x}px`; o.el.style.top = `${o.i.y}px`; }
    });
    txts.forEach(o => {
      o.t.x = Math.round(o.x + dx);
      o.t.y = Math.round(o.y + dy);
      if (o.el) { o.el.style.left = `${o.t.x}px`; o.el.style.top = `${o.t.y}px`; }
    });
    frms.forEach(o => {
      o.f.x = Math.round(o.x + dx);
      o.f.y = Math.round(o.y + dy);
      if (o.el) { o.el.style.left = `${o.f.x}px`; o.el.style.top = `${o.f.y}px`; }
    });
    handles.forEach(o => { o.h.style.left = `${o.x + dx}px`; o.h.style.top = `${o.y + dy}px`; });
    // Las flechas los siguen (unen frames, tableros, imágenes, textos y notas)
    if (movesConnectors) renderConnectors();
    if (singleImg) {
      // Sobre un link o un tablero gana ese destino; si no, una tarea
      imageTarget = imageDropTargetAt(clientX, clientY);
      highlightImageDropTarget(imageTarget);
      targetCard = imageTarget ? null : document.elementsFromPoint(clientX, clientY).find(n => n.classList && n.classList.contains('kanban-card')) || null;
      highlightDropCard(targetCard);
      if (singleImg.el) singleImg.el.classList.toggle('is-over-card', !!(targetCard || imageTarget));
    }
  };

  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
    if (stopAutoPan) stopAutoPan();
    selectGestureActive = false;
    handlesFollowDrag = false;
    cancelSelectGesture = null;
    brds.forEach(o => o.el && o.el.classList.remove('is-moving'));
    highlightDropCard(null);
    highlightImageDropTarget(null);
    // La manija de conexión vuelve junto al objeto (se escondió durante el arrastre)
    if (typeof updateConnectHandle === 'function') updateConnectHandle();
    if (!moved) return;

    // Imagen del lienzo soltada sobre un link o un tablero: pasa a ser la imagen de ese link o tablero
    if (singleImg && imageTarget) {
      singleImg.i.x = singleImg.x;
      singleImg.i.y = singleImg.y;
      getActiveProject().bgImages = getBgImages().filter(i => i.id !== singleImg.i.id);
      selection.delete(`img:${singleImg.i.id}`);
      renderBgImages();
      applyImageToTarget(imageTarget, bgImageRef(singleImg.i));
      return;
    }
    if (singleImg && targetCard) {
      singleImg.i.x = singleImg.x;
      singleImg.i.y = singleImg.y;
      transferBgImageToTask(singleImg.i.id, targetCard.dataset.taskId);
      return;
    }
    strokes.forEach(o => {
      o.s.points = o.s.points.map(([x, y]) => [+(x + dx).toFixed(1), +(y + dy).toFixed(1)]);
    });
    persist();
    if (strokes.length) renderDrawings();
    if (imgs.length) renderBgImages();
  };

  viewportArea.addEventListener('pointermove', onMove);
  viewportArea.addEventListener('pointerup', onUp);
  viewportArea.addEventListener('pointercancel', onUp);

  // Segundo dedo: se deja todo donde estaba
  cancelSelectGesture = () => {
    cancelSelectGesture = null;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
    if (stopAutoPan) stopAutoPan();
    selectGestureActive = false;
    brds.forEach(o => {
      o.b.x = o.x; o.b.y = o.y;
      if (o.el) { o.el.classList.remove('is-moving'); o.el.style.left = `${o.x}px`; o.el.style.top = `${o.y}px`; }
    });
    strokes.forEach(o => o.el && o.el.removeAttribute('transform'));
    imgs.forEach(o => { o.i.x = o.x; o.i.y = o.y; if (o.el) { o.el.style.left = `${o.x}px`; o.el.style.top = `${o.y}px`; } });
    txts.forEach(o => { o.t.x = o.x; o.t.y = o.y; if (o.el) { o.el.style.left = `${o.x}px`; o.el.style.top = `${o.y}px`; } });
    frms.forEach(o => { o.f.x = o.x; o.f.y = o.y; if (o.el) { o.el.style.left = `${o.x}px`; o.el.style.top = `${o.y}px`; } });
    if (typeof renderConnectors === 'function') renderConnectors();
    highlightDropCard(null);
  };
}

// ----- Arrastrar una columna: reordenar dentro del tablero o pasarla a otro -----
function startColumnDrag(e, colId) {
  const colEl = getColumnEl(colId);
  if (!colEl) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const rect = colEl.getBoundingClientRect();
  const offX = startX - rect.left;
  const offY = startY - rect.top;
  let ghost = null;
  let placeholder = null;
  let target = null; // { boardId, beforeColId }
  let lastX = startX, lastY = startY, stopAutoPan = null;

  selectGestureActive = true;
  viewportArea.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!ghost && Math.hypot(lastX - startX, lastY - startY) < 4) return;
    // El lienzo avanzó bajo la columna: se recalcula a qué tablero caería
    if (!ghost) stopAutoPan = startEdgeAutoPan(() => ({ x: lastX, y: lastY }), () => moveTo(lastX, lastY));
    moveTo(lastX, lastY);
  };

  const moveTo = (clientX, clientY) => {
    if (!ghost) {
      ghost = colEl.cloneNode(true);
      ghost.classList.add('column-drag-ghost');
      ghost.style.width = `${rect.width}px`;
      ghost.style.transform = `scale(${Math.min(1, zoom)})`;
      document.body.appendChild(ghost);
      colEl.classList.add('is-dragging-column');
      placeholder = document.createElement('div');
      placeholder.className = 'column-drop-placeholder';
    }
    ghost.style.left = `${clientX - offX * Math.min(1, zoom)}px`;
    ghost.style.top = `${clientY - offY * Math.min(1, zoom)}px`;

    const under = document.elementsFromPoint(clientX, clientY);
    const frame = under.find(n => n.classList && n.classList.contains('board-frame'));
    if (!frame) {
      target = null;
      if (placeholder.parentNode) placeholder.remove();
      return;
    }
    const container = frame.querySelector('.board-columns');
    const siblings = Array.from(container.querySelectorAll('.kanban-column')).filter(c => c !== colEl);
    let before = null;
    for (const sib of siblings) {
      const r = sib.getBoundingClientRect();
      if (clientX < r.left + r.width / 2) { before = sib; break; }
    }
    container.insertBefore(placeholder, before || container.querySelector('.add-column-tile'));
    target = { boardId: frame.dataset.boardId, beforeColId: before ? before.dataset.columnId : null };
  };

  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
    if (stopAutoPan) stopAutoPan();
    selectGestureActive = false;
    if (ghost) ghost.remove();
    if (placeholder) placeholder.remove();
    colEl.classList.remove('is-dragging-column');
    if (!ghost || !target) return;

    const col = columns.find(c => c.id === colId);
    columns.splice(columns.indexOf(col), 1);
    const movedBoard = col.boardId !== target.boardId;
    col.boardId = target.boardId;
    if (target.beforeColId) {
      columns.splice(columns.findIndex(c => c.id === target.beforeColId), 0, col);
    } else {
      // Al final de su tablero
      let lastIdx = -1;
      columns.forEach((c, i) => { if (c.boardId === target.boardId) lastIdx = i; });
      columns.splice(lastIdx + 1, 0, col);
    }
    persist();
    renderBoard();
    if (movedBoard) {
      const b = boards.find(x => x.id === target.boardId);
      showToast(`Columna movida a "${b ? b.title : 'otro tablero'}"`, 'success');
    }
  };

  viewportArea.addEventListener('pointermove', onMove);
  viewportArea.addEventListener('pointerup', onUp);
  viewportArea.addEventListener('pointercancel', onUp);
}

// Elementos que tocan un rectángulo (coordenadas del lienzo)
function itemsInRect(x1, y1, x2, y2) {
  const keys = [];
  const overlaps = (x, y, w, h) => x < x2 && x + w > x1 && y < y2 && y + h > y1;
  boards.forEach(b => {
    const el = getBoardEl(b.id);
    if (el && overlaps(b.x, b.y, el.offsetWidth * boardScale(b), el.offsetHeight * boardScale(b))) keys.push(`board:${b.id}`);
  });
  getBgImages().forEach(i => { if (overlaps(i.x, i.y, i.w, i.h)) keys.push(`img:${i.id}`); });
  getTexts().forEach(t => {
    const el = getTextEl(t.id);
    if (el && overlaps(t.x, t.y, el.offsetWidth, el.offsetHeight)) keys.push(`text:${t.id}`);
  });
  getDrawings().forEach(s => {
    const pts = s.shape && s.points.length > 1 ? shapeOutline(s) : s.points;
    if (pts.some(([x, y]) => x >= x1 && x <= x2 && y >= y1 && y <= y2)) keys.push(`stroke:${s.id}`);
  });
  // Frames: solo si quedan completos dentro del recuadro (así se puede seleccionar lo de adentro sin tomar el frame)
  if (typeof getFrames === 'function') {
    // Un frame en "Trabajar dentro" no se toma, para poder seleccionar lo que tiene adentro
    getFrames().forEach(f => { if (!f.locked && f.x >= x1 && f.y >= y1 && f.x + f.w <= x2 && f.y + f.h <= y2) keys.push(`frame:${f.id}`); });
    getConnectors().forEach(c => { if (keys.includes(endpointKey(c.from)) && keys.includes(endpointKey(c.to))) keys.push(`conn:${c.id}`); });
  }
  return keys;
}

// Selección por recuadro (arrastrar con el botón izquierdo en un espacio vacío)
function startMarquee(e, additive) {
  const vp = viewportArea.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const base = additive ? new Set(selection) : new Set();
  const box = document.createElement('div');
  box.className = 'marquee-box';
  viewportArea.appendChild(box);
  selectGestureActive = true;
  viewportArea.setPointerCapture(e.pointerId);
  if (!additive) setSelection([]);

  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    const x1 = Math.min(startX, ev.clientX), y1 = Math.min(startY, ev.clientY);
    const x2 = Math.max(startX, ev.clientX), y2 = Math.max(startY, ev.clientY);
    box.style.left = `${x1 - vp.left}px`;
    box.style.top = `${y1 - vp.top}px`;
    box.style.width = `${x2 - x1}px`;
    box.style.height = `${y2 - y1}px`;
    const a = screenToCanvas(x1, y1);
    const b = screenToCanvas(x2, y2);
    selection = new Set(expandGroups([...base, ...itemsInRect(a.x, a.y, b.x, b.y)]));
    applySelectionVisuals();
  };
  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
    selectGestureActive = false;
    cancelSelectGesture = null;
    box.remove();
    // Las manijas se escondieron durante el recuadro: vuelven junto a lo seleccionado
    if (typeof updateConnectHandle === 'function') updateConnectHandle();
    if (selection.size > 1) showToast(`${selection.size} elementos seleccionados`, 'info');
  };
  viewportArea.addEventListener('pointermove', onMove);
  viewportArea.addEventListener('pointerup', onUp);
  viewportArea.addEventListener('pointercancel', onUp);

  // Segundo dedo: se vuelve a la selección anterior
  cancelSelectGesture = () => {
    cancelSelectGesture = null;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
    selectGestureActive = false;
    box.remove();
    setSelection([...base]);
  };
}

// ----- Textos libres del lienzo -----
// Cada texto: { id, x, y, w (ancho máximo), size (tamaño de letra), color (null = el del tema), text }
const textLayer = document.getElementById('textLayer');
const ctxTextColor = document.getElementById('ctxTextColor');
let editingTextId = null;
let lastViewportPointer = null; // último punto del puntero sobre el lienzo (para pegar ahí)

function getTexts() {
  const project = getActiveProject();
  if (!project.texts) project.texts = [];
  return project.texts;
}

function selectedTexts() {
  return getTexts().filter(t => selection.has(`text:${t.id}`));
}

function getTextEl(id) {
  return textLayer.querySelector(`.canvas-text[data-text-id="${id}"]`);
}

function applyTextStyle(el, t) {
  el.style.left = `${t.x}px`;
  el.style.top = `${t.y}px`;
  // Si se le dio ancho con la esquina, la caja mide eso; si no, se ajusta al texto hasta ese ancho
  el.style.width = t.fixedWidth ? `${t.w}px` : 'max-content';
  el.style.maxWidth = `${t.w}px`;
  el.style.fontSize = `${t.size}px`;
  el.style.color = t.color || '';
  // Nota adhesiva: un texto con fondo de color (el selector de color de la barra cambia su fondo)
  el.classList.toggle('is-sticky', !!t.sticky);
  el.style.background = t.sticky || '';
}

const STICKY_DEFAULT = '#fde68a';

// Nota adhesiva nueva (cuadrada, amarilla) en un punto o al centro de la vista; se abre para escribir
function addStickyNote(at = null) {
  if (!at) {
    const rect = viewportArea.getBoundingClientRect();
    at = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  const w = Math.round(220 / zoom);
  return addText('', { x: at.x - w / 2, y: at.y - w / 2 }, {
    sticky: STICKY_DEFAULT,
    fixedWidth: true,
    w,
    size: Math.max(4, Math.round(18 / zoom))
  });
}

// Crea un texto en un punto del lienzo (o al centro de la vista). Sin contenido, se abre para escribir.
// extra: propiedades adicionales (por ejemplo, las de una nota adhesiva)
function addText(content = '', at = null, extra = null) {
  if (!at) {
    if (lastViewportPointer) {
      at = screenToCanvas(lastViewportPointer.x, lastViewportPointer.y);
    } else {
      const rect = viewportArea.getBoundingClientRect();
      at = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }
  const t = {
    id: generateId('text'),
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: Math.round(480 / zoom),
    size: Math.max(4, Math.round(22 / zoom)),
    color: null,
    text: content.replace(/\r\n/g, '\n').replace(/\s+$/, ''),
    ...(extra || {}),
    // Estilo principal del texto o de la nota adhesiva (si se eligió uno)
    ...(typeof defaultStyleFor === 'function' ? defaultStyleFor(extra && extra.sticky ? 'sticky' : 'text') : {})
  };
  getTexts().push(t);
  if (currentTool === 'text') setTool('select');
  if (t.text) {
    selection = new Set([`text:${t.id}`]);
    persist();
    renderTexts();
    showToast('Texto agregado. Arrástralo para moverlo y usa la esquina para cambiar su tamaño.', 'success');
  } else {
    renderTexts();
    editText(t.id);
  }
  return t;
}

// Guarda lo escrito en el texto que se está editando (sin redibujar)
function commitEditingText() {
  const id = editingTextId;
  if (!id) return;
  editingTextId = null;
  const t = getTexts().find(x => x.id === id);
  const el = getTextEl(id);
  const ta = el && el.querySelector('textarea');
  if (t && ta) t.text = ta.value.replace(/\s+$/, '');
  if (t && !t.text.trim()) {
    getActiveProject().texts = getTexts().filter(x => x.id !== id);
    selection.delete(`text:${id}`);
  }
}

function finishTextEdit() {
  if (!editingTextId) return;
  commitEditingText();
  persist();
  renderTexts();
}

function editText(id) {
  if (editingTextId && editingTextId !== id) finishTextEdit();
  const t = getTexts().find(x => x.id === id);
  const el = getTextEl(id);
  if (!t || !el) return;
  setSelection([`text:${id}`]);
  editingTextId = id;
  el.classList.add('is-editing');
  el.style.width = `${t.w}px`;
  el.textContent = '';
  const ta = document.createElement('textarea');
  ta.value = t.text;
  ta.rows = 1;
  ta.placeholder = 'Escribe aquí…';
  el.appendChild(ta);
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => {
    // Esc o Ctrl+Enter terminan la edición
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      e.stopPropagation(); // que Esc no quite además la selección del lienzo
      ta.blur();
    }
  });
  ta.addEventListener('blur', () => { if (editingTextId === id) finishTextEdit(); });
  fit();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function renderTexts() {
  if (editingTextId) commitEditingText();
  textLayer.innerHTML = '';
  getTexts().forEach(t => {
    const el = document.createElement('div');
    el.className = 'canvas-text';
    el.dataset.textId = t.id;
    applyTextStyle(el, t);
    // Widget "Progreso de listas" (t.ytLists) o texto normal
    const isWidget = Array.isArray(t.ytLists);
    // Ventana web o plugin (webwin.js)
    const isWeb = !!t.web && typeof webWindowHtml === 'function';
    el.classList.toggle('is-ytprogress', isWidget);
    el.classList.toggle('is-webwin', isWeb);
    el.innerHTML = isWeb ? webWindowHtml(t) : isWidget ? ytProgressWidgetHtml(t) : linkify(t.text, t.linkNames) + youtubePreviews(t.text);
    const handle = document.createElement('div');
    handle.className = 'canvas-text-handle';
    handle.title = 'Arrastra para cambiar el ancho de la caja';
    handle.addEventListener('pointerdown', (e) => startTextResize(e, t, el));
    el.appendChild(handle);
    textLayer.appendChild(el);
  });
  applySelectionVisuals();
}

// Arrastrar la esquina cambia solo el ancho de la caja (el texto se reacomoda); la letra se cambia con A+ / A−
function startTextResize(e, t, el) {
  if (isPanModeActive || isSpacePressed || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  setSelection([`text:${t.id}`]);
  const startX = e.clientX;
  const startWidth = el.offsetWidth;
  el.setPointerCapture(e.pointerId);
  const onMove = (ev) => {
    t.fixedWidth = true;
    t.w = Math.max(40, Math.round(startWidth + (ev.clientX - startX) / zoom));
    applyTextStyle(el, t);
    if (typeof followResize === 'function') followResize(`text:${t.id}`);
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

// A+ / A− cambian solo el tamaño de la letra; la caja conserva su ancho
function scaleSelectedTexts(factor) {
  selectedTexts().forEach(t => {
    t.size = Math.max(4, +(t.size * factor).toFixed(1));
    const el = getTextEl(t.id);
    if (el) applyTextStyle(el, t);
  });
  persist();
}

function rgbToHex(rgb) {
  const m = String(rgb).match(/\d+/g);
  if (!m || m.length < 3) return '#f8fafc';
  return '#' + m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

// Herramienta Texto: tocar el lienzo crea un texto ahí (o edita el que se toque)
viewportArea.addEventListener('pointerdown', (e) => {
  if (currentTool !== 'text' || isSpacePressed || e.button !== 0) return;
  const t = e.target;
  if (t.closest('.toolbox, .zoom-hud, .mobile-fab, button, input, select, textarea, a, label')) return;
  e.preventDefault();
  e.stopPropagation();
  const existing = t.closest('.canvas-text');
  if (existing) {
    setTool('select');
    editText(existing.dataset.textId);
    return;
  }
  addText('', screenToCanvas(e.clientX, e.clientY));
}, true);

// Doble clic: sobre un texto lo edita; sobre una imagen o un tablero acerca la vista; en un espacio vacío crea un texto
viewportArea.addEventListener('dblclick', (e) => {
  if (currentTool !== 'select' || isPanModeActive) return;
  if (lastPointerType === 'touch') return; // con el dedo, el doble toque lo maneja el gesto táctil
  if (linkAtEvent(e)) return; // doble clic sobre un link: lo abre (no edita el texto)
  const under = document.elementsFromPoint(e.clientX, e.clientY);
  const textEl = under.find(n => n.classList && n.classList.contains('canvas-text'));
  // Un plugin no se escribe: el doble clic acerca la vista a él, como con los demás objetos
  const textObj = textEl && getTexts().find(x => x.id === textEl.dataset.textId);
  if (textEl && !(textObj && textObj.web && textObj.web.plugin)) {
    e.preventDefault();
    editText(textEl.dataset.textId);
    return;
  }
  const top = under[0];
  if (!top || top.closest('.kanban-card, .toolbox, .zoom-hud, .mobile-fab, button, input, select, textarea')) return;
  // Doble clic sobre una imagen o un tablero: acerca la vista a ese objeto (como el doble toque)
  const rect = objectRectAt(top);
  if (rect) {
    e.preventDefault();
    fitRectToScreen(rect.x, rect.y, rect.w, rect.h);
    return;
  }
  if (hitStroke(e.clientX, e.clientY)) return;
  e.preventDefault();
  addText('', screenToCanvas(e.clientX, e.clientY));
});

// Tocar fuera del texto que se está escribiendo termina la edición
// (el lienzo evita el cambio de foco normal, así que no basta con el blur)
window.addEventListener('pointerdown', (e) => {
  if (editingTextId && !e.target.closest('.canvas-text.is-editing')) finishTextEdit();
}, true);

viewportArea.addEventListener('pointermove', (e) => {
  lastViewportPointer = { x: e.clientX, y: e.clientY };
}, { passive: true });
viewportArea.addEventListener('pointerleave', () => { lastViewportPointer = null; });

// Arrastrar texto (de otra app o página) y soltarlo en el lienzo
viewportArea.addEventListener('dragover', (e) => {
  const types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
  if (types.includes('Files') || !types.includes('text/plain')) return;
  if (e.target.closest('.kanban-card, input, textarea')) return;
  e.preventDefault();
  viewportArea.classList.add('is-drop-target');
});
viewportArea.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  if (!dt || Array.from(dt.types).includes('Files')) return;
  if (e.target.closest('.kanban-card, input, textarea')) return;
  const text = dt.getData('text/plain');
  viewportArea.classList.remove('is-drop-target');
  if (!text || !text.trim()) return;
  e.preventDefault();
  addText(text, screenToCanvas(e.clientX, e.clientY));
});

document.getElementById('ctxAddText').addEventListener('click', () => addText(''));
document.getElementById('ctxTextEdit').addEventListener('click', () => {
  const first = selectedTexts()[0];
  if (first) editText(first.id);
});
document.getElementById('toolSticky').addEventListener('click', () => addStickyNote());
// Atajo S: nota adhesiva donde está el puntero
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 's' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || editingTextId) return;
  if (Array.from(document.querySelectorAll('.modal-backdrop')).some(m => m.style.display === 'flex')) return;
  addStickyNote(lastViewportPointer ? screenToCanvas(lastViewportPointer.x, lastViewportPointer.y) : null);
});

document.getElementById('ctxGroup').addEventListener('click', groupSelection);
document.getElementById('ctxUngroup').addEventListener('click', ungroupSelection);
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'g') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  e.preventDefault();
  if (e.shiftKey) ungroupSelection(); else groupSelection();
});

document.getElementById('ctxTextInternal').addEventListener('click', () => {
  const t = selectedTexts()[0];
  if (!t) return;
  openInternalLinkPicker(url => {
    t.text = t.text ? `${t.text}\n${url}` : url;
    persist();
    renderTexts();
  });
});
document.getElementById('ctxTextLinks').addEventListener('click', () => {
  const t = selectedTexts()[0];
  if (!t) return;
  openLinkNamesDialog(extractUrls(t.text), t.linkNames, (names) => {
    t.linkNames = names;
    persist();
    renderTexts();
  });
});
document.getElementById('ctxTextBigger').addEventListener('click', () => scaleSelectedTexts(1.2));
document.getElementById('ctxTextSmaller').addEventListener('click', () => scaleSelectedTexts(1 / 1.2));
ctxTextColor.addEventListener('input', () => {
  selectedTexts().forEach(t => {
    // En una nota adhesiva el color es el del papel; en un texto, el de la letra
    if (t.sticky) t.sticky = ctxTextColor.value;
    else t.color = ctxTextColor.value;
    const el = getTextEl(t.id);
    if (el) applyTextStyle(el, t);
  });
  ctxDot.style.background = ctxTextColor.value;
});
ctxTextColor.addEventListener('change', () => persist());

// Herramienta Seleccionar (botón izquierdo): decide qué se toma con cada clic
viewportArea.addEventListener('pointerdown', (e) => {
  if (currentTool !== 'select' || isSpacePressed || isPanModeActive || e.button !== 0) return;
  if (e.pointerType === 'touch' && !e.isPrimary) return; // segundo dedo: es para mover el lienzo
  const t = e.target;
  if (t.closest('.toolbox, .zoom-hud, .mobile-fab, .bg-image-handle, .bg-image-toolbar, .canvas-text-handle, .frame-handle, .frame-scale-handle, .sel-scale-handle, .connect-handle, .ytlist-handle, .webwin-resize')) return;
  // Un link dentro de un texto del lienzo también sirve para tomar y mover ese texto (un clic corto lo abre)
  if (t.closest('button, input, select, textarea, a, label') && !t.closest('.canvas-text a')) return;

  let key = null;
  const strokeId = hitStroke(e.clientX, e.clientY);
  if (strokeId) {
    key = `stroke:${strokeId}`;
  } else if (t.closest('[data-conn-id]')) {
    key = `conn:${t.closest('[data-conn-id]').dataset.connId}`;
  } else if (t.closest('.canvas-text')) {
    key = `text:${t.closest('.canvas-text').dataset.textId}`;
  } else if (t.closest('.kanban-card')) {
    // Las tarjetas mantienen su propio arrastre entre columnas
    focusBoard(t.closest('.board-frame'));
    if (!e.shiftKey && selection.size) setSelection([]);
    return;
  } else if (t.closest('.column-header')) {
    e.preventDefault();
    e.stopPropagation();
    focusBoard(t.closest('.board-frame'));
    if (selection.size) setSelection([]);
    startColumnDrag(e, t.closest('.kanban-column').dataset.columnId);
    return;
  } else if (t.closest('.kanban-column')) {
    // Zona interior de una columna: enfoca su tablero (permite desplazar sus tarjetas)
    focusBoard(t.closest('.board-frame'));
    if (selection.size) setSelection([]);
    return;
  } else if (t.closest('.board-frame')) {
    key = `board:${t.closest('.board-frame').dataset.boardId}`;
  } else if (t.closest('.bg-image')) {
    key = `img:${t.closest('.bg-image').dataset.imageId}`;
  } else if (t.closest('.canvas-frame')) {
    key = `frame:${t.closest('.canvas-frame').dataset.frameId}`;
  }

  if (key) {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      // Con Shift se suma o se quita el objeto (o su grupo completo)
      const members = groupKeysFor(key);
      if (selection.has(key)) {
        members.forEach(k => selection.delete(k));
        applySelectionVisuals();
        return;
      }
      members.forEach(k => selection.add(k));
      applySelectionVisuals();
    } else if (!selection.has(key)) {
      setSelection([key]);
    }
    startGroupDrag(e);
    return;
  }

  if (t.closest('.board-empty')) return;
  if (!e.shiftKey) focusBoard(null);
  // Con el dedo en un espacio vacío también se selecciona con un recuadro
  // (el lienzo se mueve con dos dedos)
  e.preventDefault();
  e.stopPropagation();
  startMarquee(e, e.shiftKey);
}, true);

// =============================================================================
// 7f. Barra contextual + portapapeles del lienzo (copiar, cortar, pegar, duplicar)
// =============================================================================

let focusedBoardId = null;
const CANVAS_CLIPBOARD_MARK = 'zenban-canvas-clipboard';
let canvasClipboard = null;
let pasteCount = 0;

const contextBar = document.getElementById('contextBar');
const ctxTitle = document.getElementById('ctxTitle');
const ctxDot = document.getElementById('ctxDot');
const quickStats = document.getElementById('quickStats');
const ctxImgOpacity = document.getElementById('ctxImgOpacity');
const ctxStrokeColor = document.getElementById('ctxStrokeColor');
const ctxStrokeSize = document.getElementById('ctxStrokeSize');

function focusBoard(frameOrNull) {
  const id = frameOrNull ? frameOrNull.dataset.boardId : null;
  if (id === focusedBoardId) return;
  focusedBoardId = id;
  kanbanBoard.querySelectorAll('.board-frame').forEach(f => f.classList.toggle('is-focused', f.dataset.boardId === id));
  updateContextBar();
}

// Qué está "en foco": lienzo, un tablero, imágenes, trazos o una mezcla
function getContext() {
  if (selection.size === 0) {
    if (focusedBoardId && boards.some(b => b.id === focusedBoardId)) return { type: 'board', boardId: focusedBoardId };
    return { type: 'canvas' };
  }
  const keys = [...selection];
  const types = new Set(keys.map(k => k.split(':')[0]));
  if (keys.length === 1 && types.has('board')) return { type: 'board', boardId: keys[0].slice(6) };
  if (types.size === 1 && types.has('img')) return { type: 'image', count: keys.length };
  if (types.size === 1 && types.has('stroke')) return { type: 'stroke', count: keys.length };
  if (types.size === 1 && types.has('text')) return { type: 'text', count: keys.length };
  if (types.size === 1 && types.has('frame')) return { type: 'frame', count: keys.length };
  if (types.size === 1 && types.has('conn')) return { type: 'conn', count: keys.length };
  return { type: 'multi', count: keys.length };
}

function contextBoardId() {
  const ctx = getContext();
  return ctx.type === 'board' ? ctx.boardId : (focusedBoardId || null);
}

function defaultColumnForNewTask() {
  const boardId = contextBoardId() || (boards[0] && boards[0].id);
  const col = columns.find(c => c.boardId === boardId);
  return col ? col.id : null;
}

function selectedImages() {
  return getBgImages().filter(i => selection.has(`img:${i.id}`));
}

function selectedStrokes() {
  return getDrawings().filter(s => selection.has(`stroke:${s.id}`));
}

function updateContextBar() {
  if (!contextBar) return;
  const ctx = getContext();
  const show = (name, visible) => {
    const panel = contextBar.querySelector(`.ctx-panel[data-ctx="${name}"]`);
    if (panel) panel.hidden = !visible;
  };
  show('canvas', ctx.type === 'canvas');
  show('board', ctx.type === 'board');
  show('image', ctx.type === 'image');
  show('stroke', ctx.type === 'stroke');
  show('text', ctx.type === 'text');
  show('frame', ctx.type === 'frame');
  show('conn', ctx.type === 'conn');
  show('common', ['image', 'stroke', 'text', 'multi', 'frame', 'conn'].includes(ctx.type));
  contextBar.dataset.ctx = ctx.type;
  // Agrupar si hay varios objetos que no forman ya un único grupo; desagrupar si hay alguno agrupado
  const groupsInSel = selectionGroups();
  const allOneGroup = groupsInSel.size === 1 && [...selection].every(k => (canvasObjectsByKey().get(k) || {}).group);
  document.getElementById('ctxGroup').hidden = !(selection.size >= 2 && !allOneGroup);
  document.getElementById('ctxUngroup').hidden = groupsInSel.size === 0;

  const pasteEnabled = !!canvasClipboard;
  ['ctxPaste', 'ctxPasteCanvas'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !pasteEnabled;
  });

  // Etiqueta y estadísticas del contexto
  let statTasks = tasks;
  quickStats.hidden = !(ctx.type === 'canvas' || ctx.type === 'board');
  if (ctx.type === 'board') {
    const board = boards.find(b => b.id === ctx.boardId);
    const colIds = columns.filter(c => c.boardId === ctx.boardId).map(c => c.id);
    statTasks = tasks.filter(t => colIds.includes(t.columnId));
    ctxTitle.textContent = board ? board.title : 'Tablero';
    ctxDot.style.background = board ? (board.color || '#6366f1') : '';
    syncBoardFilterControls(board);
  } else if (ctx.type === 'canvas') {
    ctxTitle.textContent = 'Lienzo';
    ctxDot.style.background = '';
  } else if (ctx.type === 'image') {
    ctxTitle.textContent = ctx.count === 1 ? 'Imagen' : `${ctx.count} imágenes`;
    ctxDot.style.background = '#06b6d4';
    const first = selectedImages()[0];
    if (first) ctxImgOpacity.value = Math.round((typeof first.opacity === 'number' ? first.opacity : 1) * 100);
    const nameInput = document.getElementById('ctxImgName');
    if (first && document.activeElement !== nameInput) nameInput.value = first.name || '';
    if (first && first.name && ctx.count === 1) ctxTitle.textContent = first.name;
  } else if (ctx.type === 'stroke') {
    const strokesSel = selectedStrokes();
    const onlyArrows = strokesSel.every(s => s.arrow);
    const onlyShapes = strokesSel.every(s => s.shape);
    const shapeName = onlyShapes && strokesSel.every(s => s.shape === strokesSel[0].shape)
      ? (SHAPES.find(x => x.id === strokesSel[0].shape) || {}).label : null;
    ctxTitle.textContent = ctx.count === 1
      ? (onlyArrows ? 'Flecha' : shapeName || 'Trazo')
      : `${ctx.count} ${onlyArrows ? 'flechas' : onlyShapes ? 'formas' : 'trazos'}`;
    const first = selectedStrokes()[0];
    if (first) {
      ctxStrokeColor.value = first.color;
      ctxDot.style.background = first.color;
      const screenSize = first.size * zoom;
      ctxStrokeSize.value = String([2, 4, 8, 14].reduce((best, v) => Math.abs(v - screenSize) < Math.abs(best - screenSize) ? v : best, 4));
    }
  } else if (ctx.type === 'text') {
    const first = selectedTexts()[0];
    const sticky = first && first.sticky;
    ctxTitle.textContent = ctx.count === 1 ? (sticky ? 'Nota adhesiva' : 'Texto') : `${ctx.count} textos`;
    const el = first && getTextEl(first.id);
    const color = sticky ? first.sticky : first && first.color ? first.color : (el ? rgbToHex(getComputedStyle(el).color) : '#f8fafc');
    ctxTextColor.value = color;
    ctxDot.style.background = color;
  } else if ((ctx.type === 'frame' || ctx.type === 'conn') && typeof syncFrameControls === 'function') {
    syncFrameControls(ctx);
  } else {
    ctxTitle.textContent = `${ctx.count} elementos`;
    ctxDot.style.background = '#a855f7';
  }
  document.getElementById('statTotal').textContent = statTasks.length;
  document.getElementById('statCompleted').textContent = statTasks.filter(t => t.completed).length;
}

// Copia profunda de lo seleccionado (tableros con columnas y tareas, trazos, imágenes)
function collectSelection() {
  const data = { boards: [], columns: [], tasks: [], strokes: [], images: [], texts: [] };
  boards.filter(b => selection.has(`board:${b.id}`)).forEach(b => {
    data.boards.push(deepClone(b));
    const cols = columns.filter(c => c.boardId === b.id);
    cols.forEach(c => data.columns.push(deepClone(c)));
    tasks.filter(t => cols.some(c => c.id === t.columnId)).forEach(t => data.tasks.push(deepClone(t)));
  });
  data.strokes = deepClone(selectedStrokes());
  data.images = deepClone(selectedImages());
  data.texts = deepClone(selectedTexts());
  // Frames y las flechas (solo las que unen dos objetos copiados)
  if (typeof getFrames === 'function') {
    data.frames = deepClone(selectedFrames());
    data.connectors = deepClone(getConnectors().filter(c => selection.has(endpointKey(c.from)) && selection.has(endpointKey(c.to))));
  }
  return data;
}

function hasSelectionContent(data) {
  return data.boards.length + data.strokes.length + data.images.length + (data.texts || []).length + (data.frames || []).length > 0;
}

async function copyImageBlob(oldId) {
  try {
    const blob = await ImageStore.get(oldId);
    if (!blob) return null;
    const newId = generateId('img');
    await ImageStore.put(newId, blob);
    return newId;
  } catch (e) {
    return null;
  }
}

// Inserta una copia del contenido desplazada y la deja seleccionada
async function pasteData(data, offset, offsetY = offset) {
  const newKeys = [];
  // Las copias forman su propio grupo (no se unen al grupo del original)
  const groupMap = {};
  const regroup = (o) => { if (o.group) o.group = groupMap[o.group] || (groupMap[o.group] = generateId('grp')); return o; };
  // Clave original → clave de la copia (para que las flechas unan las copias)
  const keyMap = {};
  for (const b of data.boards) {
    const nb = regroup(deepClone(b));
    nb.id = generateId('board');
    keyMap[`board:${b.id}`] = `board:${nb.id}`;
    nb.x += offset;
    nb.y += offsetY;
    boards.push(nb);
    newKeys.push(`board:${nb.id}`);
    const colMap = {};
    data.columns.filter(c => c.boardId === b.id).forEach(c => {
      const nc = deepClone(c);
      const base = isDoneColumn(c.id) ? 'done' : (c.id === 'todo' || c.id.startsWith('todo-') ? 'todo' : 'col');
      nc.id = `${base}-${Math.random().toString(36).substr(2, 6)}`;
      nc.boardId = nb.id;
      colMap[c.id] = nc.id;
      columns.push(nc);
    });
    for (const t of data.tasks.filter(t => colMap[t.columnId])) {
      const nt = deepClone(t);
      nt.id = generateId('task');
      nt.columnId = colMap[t.columnId];
      nt.images = [];
      for (const img of (t.images || [])) {
        const newId = await copyImageBlob(img.id);
        if (newId) nt.images.push({ ...img, id: newId });
      }
      tasks.push(nt);
    }
  }
  data.strokes.forEach(st => {
    const ns = regroup(deepClone(st));
    ns.id = generateId('stroke');
    ns.points = ns.points.map(([x, y]) => [+(x + offset).toFixed(1), +(y + offsetY).toFixed(1)]);
    getDrawings().push(ns);
    undoStack.push({ type: 'add', stroke: ns });
    newKeys.push(`stroke:${ns.id}`);
  });
  for (const img of data.images) {
    const newId = await copyImageBlob(bgImageRef(img));
    if (!newId) continue;
    const ni = regroup({ ...deepClone(img), id: newId, x: img.x + offset, y: img.y + offsetY });
    delete ni.src; // la copia tiene su propio archivo
    getBgImages().push(ni);
    newKeys.push(`img:${newId}`);
    keyMap[`img:${img.id}`] = `img:${newId}`;
  }
  (data.texts || []).forEach(t => {
    const nt = regroup({ ...deepClone(t), id: generateId('text'), x: t.x + offset, y: t.y + offsetY });
    keyMap[`text:${t.id}`] = `text:${nt.id}`;
    getTexts().push(nt);
    newKeys.push(`text:${nt.id}`);
  });
  // Frames con ids nuevos y sus flechas apuntando a las copias
  if (typeof getFrames === 'function') {
    (data.frames || []).forEach(f => {
      const nf = regroup({ ...deepClone(f), id: generateId('frame'), x: f.x + offset, y: f.y + offsetY });
      keyMap[`frame:${f.id}`] = `frame:${nf.id}`;
      getFrames().push(nf);
      newKeys.push(`frame:${nf.id}`);
    });
    (data.connectors || []).forEach(c => {
      const from = keyMap[endpointKey(c.from)], to = keyMap[endpointKey(c.to)];
      if (!from || !to) return;
      const nc = regroup({ ...deepClone(c), id: generateId('conn'), from, to });
      getConnectors().push(nc);
      newKeys.push(`conn:${nc.id}`);
    });
  }
  selection = new Set(newKeys);
  persist();
  renderBoard();
  renderDrawings();
  renderBgImages();
  renderTexts();
  renderProjectSwitcher();
}

function copySelection(silent = false) {
  const data = collectSelection();
  if (!hasSelectionContent(data)) return false;
  canvasClipboard = data;
  pasteCount = 0;
  try { navigator.clipboard.writeText(CANVAS_CLIPBOARD_MARK).catch(() => {}); } catch (e) {}
  if (!silent) showToast(`${selection.size} elemento(s) copiado(s)`, 'info');
  updateContextBar();
  return true;
}

// Esquina superior izquierda del contenido copiado
function clipboardOrigin(data) {
  let minX = Infinity, minY = Infinity;
  data.boards.forEach(b => { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); });
  data.images.forEach(i => { minX = Math.min(minX, i.x); minY = Math.min(minY, i.y); });
  (data.texts || []).forEach(t => { minX = Math.min(minX, t.x); minY = Math.min(minY, t.y); });
  (data.frames || []).forEach(f => { minX = Math.min(minX, f.x); minY = Math.min(minY, f.y); });
  data.strokes.forEach(s => s.points.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); }));
  return minX === Infinity ? { x: 0, y: 0 } : { x: minX, y: minY };
}

// Pega desplazado respecto al original o, si se indica, en un punto del lienzo
async function pasteClipboard(atCanvasPoint = null) {
  if (!canvasClipboard) {
    showToast('No hay nada copiado todavía', 'info');
    return;
  }
  if (atCanvasPoint) {
    const o = clipboardOrigin(canvasClipboard);
    await pasteData(canvasClipboard, Math.round(atCanvasPoint.x - o.x), Math.round(atCanvasPoint.y - o.y));
  } else {
    pasteCount++;
    await pasteData(canvasClipboard, 40 * pasteCount);
  }
  showToast('Pegado', 'success');
}

async function duplicateSelection() {
  const data = collectSelection();
  if (!hasSelectionContent(data)) return;
  await pasteData(data, 40);
  showToast('Duplicado', 'success');
}

// Elimina lo seleccionado. Los tableros piden confirmación.
// skipConfirm: al cortar o mover (no pregunta y deja las imágenes); confirmed: ya se preguntó
function deleteSelection({ skipConfirm = false, confirmed = false } = {}) {
  const strokeIds = selectedStrokes().map(s => s.id);
  const imageIds = selectedImages().map(i => i.id);
  const textIds = selectedTexts().map(t => t.id);
  const boardIds = boards.filter(b => selection.has(`board:${b.id}`)).map(b => b.id);

  if (boardIds.length && !skipConfirm && !confirmed) {
    const colIds = columns.filter(c => boardIds.includes(c.boardId)).map(c => c.id);
    const n = tasks.filter(t => colIds.includes(t.columnId)).length;
    askConfirm({
      title: boardIds.length === 1 ? '¿Eliminar este tablero?' : `¿Eliminar ${boardIds.length} tableros?`,
      message: `Se borrarán ${colIds.length} columna(s) y ${n} tarea(s), junto con lo demás seleccionado.`,
      confirmText: 'Eliminar', danger: true
    }).then(ok => { if (ok) deleteSelection({ confirmed: true }); });
    return false;
  }

  if (strokeIds.length) {
    const drawings = getDrawings();
    const items = [];
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (strokeIds.includes(drawings[i].id)) {
        items.push({ stroke: drawings[i], index: i });
        drawings.splice(i, 1);
      }
    }
    undoStack.push({ type: 'erase', items });
  }
  imageIds.forEach(id => {
    const project = getActiveProject();
    const ref = bgImageRef(getBgImages().find(img => img.id === id));
    project.bgImages = getBgImages().filter(img => img.id !== id);
    if (!skipConfirm) releaseImageFile(ref); // al cortar, la imagen sigue disponible para pegar
  });
  if (textIds.length) getActiveProject().texts = getTexts().filter(t => !textIds.includes(t.id));
  // Frames y conectores: también se quitan las flechas que unían algún objeto borrado
  if (typeof getFrames === 'function') {
    const frameIds = selectedFrames().map(f => f.id);
    const connIds = selectedConnectors().map(c => c.id);
    if (frameIds.length) getActiveProject().frames = getFrames().filter(f => !frameIds.includes(f.id));
    const gone = (ref) => selection.has(endpointKey(ref));
    if (getConnectors().some(c => connIds.includes(c.id) || gone(c.from) || gone(c.to))) {
      getActiveProject().connectors = getConnectors().filter(c => !connIds.includes(c.id) && !gone(c.from) && !gone(c.to));
    }
  }
  if (boardIds.length) {
    const colIds = columns.filter(c => boardIds.includes(c.boardId)).map(c => c.id);
    if (!skipConfirm) tasks.filter(t => colIds.includes(t.columnId)).forEach(deleteTaskImages);
    tasks = tasks.filter(t => !colIds.includes(t.columnId));
    columns = columns.filter(c => !boardIds.includes(c.boardId));
    getActiveProject().boards = boards.filter(b => !boardIds.includes(b.id));
    boards = getActiveProject().boards;
    if (boardIds.includes(focusedBoardId)) focusedBoardId = null;
  }
  selection = new Set();
  persist();
  renderBoard();
  renderDrawings();
  renderBgImages();
  renderTexts();
  renderProjectSwitcher();
  return true;
}

function cutSelection() {
  if (!copySelection(true)) return;
  deleteSelection({ skipConfirm: true });
  showToast('Cortado. Usa Pegar (Ctrl+V) para colocarlo', 'info');
}

// ----- Color de fondo del lienzo (de cada proyecto) -----
const ctxCanvasColor = document.getElementById('ctxCanvasColor');
const ctxCanvasColorReset = document.getElementById('ctxCanvasColorReset');

function applyCanvasColor() {
  const project = getActiveProject();
  const color = project && project.canvasColor;
  viewportArea.style.backgroundColor = color || '';
  viewportArea.classList.toggle('has-canvas-color', !!color);
  if (color) {
    // Puntos de la cuadrícula claros u oscuros según el fondo
    const n = parseInt(color.slice(1), 16);
    const light = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150;
    viewportArea.style.setProperty('--canvas-dot', light ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.14)');
  }
  // (se buscan aquí porque renderBoard puede llamarse antes de que se definan las constantes de abajo)
  const input = document.getElementById('ctxCanvasColor');
  const reset = document.getElementById('ctxCanvasColorReset');
  if (input) input.value = color || rgbToHex(getComputedStyle(viewportArea).backgroundColor);
  if (reset) reset.hidden = !color;
}

// Abre el selector de color del fondo (desde el menú contextual; la barra puede estar fuera de la vista en el celular)
function openCanvasColorPicker() {
  applyCanvasColor();
  try {
    if (ctxCanvasColor.showPicker) { ctxCanvasColor.showPicker(); return; }
  } catch (e) {}
  ctxCanvasColor.click();
}

ctxCanvasColor.addEventListener('input', () => {
  getActiveProject().canvasColor = ctxCanvasColor.value;
  applyCanvasColor();
});
ctxCanvasColor.addEventListener('change', () => persist());
ctxCanvasColorReset.addEventListener('click', () => {
  delete getActiveProject().canvasColor;
  applyCanvasColor();
  persist();
});

// ----- Botones de la barra contextual -----
document.getElementById('ctxNewBoard').addEventListener('click', () => openBoardModal());
document.getElementById('ctxAddImage').addEventListener('click', () => bgImageInput.click());
document.getElementById('ctxFit').addEventListener('click', fitBoardToScreen);
document.getElementById('ctxPasteCanvas').addEventListener('click', pasteClipboard);
document.getElementById('ctxPaste').addEventListener('click', pasteClipboard);
document.getElementById('ctxCopy').addEventListener('click', () => copySelection());
document.getElementById('ctxCut').addEventListener('click', cutSelection);
document.getElementById('ctxDuplicate').addEventListener('click', duplicateSelection);
document.getElementById('ctxDelete').addEventListener('click', () => deleteSelection());
document.getElementById('ctxEditBoard').addEventListener('click', () => {
  const id = contextBoardId();
  if (id) openBoardModal(id);
});

document.getElementById('ctxImgBack').addEventListener('click', () => {
  selectedImages().slice().reverse().forEach(img => {
    const list = getBgImages();
    list.splice(list.indexOf(img), 1);
    list.unshift(img);
  });
  persist();
  renderBgImages();
});
document.getElementById('ctxImgFront').addEventListener('click', () => {
  selectedImages().forEach(img => {
    const list = getBgImages();
    list.splice(list.indexOf(img), 1);
    list.push(img);
  });
  persist();
  renderBgImages();
});
document.getElementById('ctxImgView').addEventListener('click', () => {
  const first = selectedImages()[0];
  if (first) openLightbox(bgImageRef(first));
});
ctxImgOpacity.addEventListener('input', () => {
  const value = Number(ctxImgOpacity.value) / 100;
  selectedImages().forEach(img => {
    img.opacity = value;
    const el = bgImageLayer.querySelector(`.bg-image[data-image-id="${img.id}"] img`);
    if (el) el.style.opacity = value;
  });
});
ctxImgOpacity.addEventListener('change', () => persist());

// Nombre de la imagen: se cambia en todos los lugares donde se usa esa misma imagen (para la Biblioteca)
const ctxImgName = document.getElementById('ctxImgName');
ctxImgName.addEventListener('input', () => {
  const refs = new Set(selectedImages().map(bgImageRef));
  const name = ctxImgName.value.trim();
  projects.forEach(p => (p.bgImages || []).forEach(i => { if (refs.has(bgImageRef(i))) i.name = name; }));
  if (selectedImages().length === 1 && name) ctxTitle.textContent = name;
});
ctxImgName.addEventListener('change', () => {
  const name = ctxImgName.value.trim();
  const refs = new Set(selectedImages().map(bgImageRef));
  // El nombre queda guardado por archivo (sigue en la Biblioteca aunque la imagen salga del lienzo).
  // Sin nombre se olvida y vuelve a recibir un número.
  refs.forEach(ref => setSavedImageName(ref, name));
  if (!name) {
    projects.forEach(p => (p.bgImages || []).forEach(i => { if (refs.has(bgImageRef(i))) delete i.name; }));
    ensureImageNames();
    updateContextBar();
  }
  persist();
});
ctxImgName.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctxImgName.blur(); });

ctxStrokeColor.addEventListener('input', () => {
  selectedStrokes().forEach(st => {
    st.color = ctxStrokeColor.value;
    const el = drawLayer.querySelector(`[data-stroke-id="${st.id}"]`);
    if (el) el.setAttribute('stroke', st.color);
  });
  ctxDot.style.background = ctxStrokeColor.value;
});
ctxStrokeColor.addEventListener('change', () => persist());
ctxStrokeSize.addEventListener('change', () => {
  const size = +(Number(ctxStrokeSize.value) / zoom).toFixed(2);
  selectedStrokes().forEach(st => {
    st.size = size;
    const el = drawLayer.querySelector(`[data-stroke-id="${st.id}"]`);
    // La punta de la flecha y los segmentos de la línea segmentada crecen con el grosor
    if (el) applyStrokeAttrs(el, st);
  });
  persist();
});

// ----- Atajos de teclado del lienzo -----
function canvasShortcutsAllowed() {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return false;
  return !Array.from(document.querySelectorAll('.modal-backdrop')).some(m => m.style.display === 'flex');
}

document.addEventListener('copy', (e) => {
  if (!selection.size || !canvasShortcutsAllowed()) return;
  if (copySelection()) {
    e.preventDefault();
    e.clipboardData.setData('text/plain', CANVAS_CLIPBOARD_MARK);
  }
});

document.addEventListener('cut', (e) => {
  if (!selection.size || !canvasShortcutsAllowed()) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', CANVAS_CLIPBOARD_MARK);
  cutSelection();
});

window.addEventListener('keydown', (e) => {
  if (!canvasShortcutsAllowed()) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    if (!selection.size) return;
    e.preventDefault();
    duplicateSelection();
    return;
  }
  if (!selection.size) {
    if (e.key === 'Escape' && focusedBoardId) focusBoard(null);
    return;
  }
  if (e.key === 'Escape') {
    setSelection([]);
    return;
  }
  if (e.key === 'Enter' && selection.size === 1 && [...selection][0].startsWith('text:')) {
    e.preventDefault();
    editText([...selection][0].slice(5));
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelection();
  }
});

// =============================================================================
// 7g. Menú contextual (clic derecho sin arrastrar)
// =============================================================================

const canvasMenu = document.getElementById('canvasContextMenu');
let rightDown = null; // { x, y, time, target }
let menuCanvasPoint = null;
let menuTaskId = null;   // tarea bajo el menú (para archivarla)
let menuColumnId = null; // columna bajo el menú

viewportArea.addEventListener('mousedown', (e) => {
  if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY, time: Date.now(), target: e.target };
}, true);

// Cualquier clic (izquierdo, derecho, táctil) fuera del menú lo cierra.
// Se escucha en fase de captura sobre window para que ningún otro manejador lo bloquee.
window.addEventListener('pointerdown', (e) => {
  if (!canvasMenu.hidden && !canvasMenu.contains(e.target)) closeCanvasMenu();
}, true);

window.addEventListener('mouseup', (e) => {
  if (e.button !== 2 || !rightDown) return;
  const moved = Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y);
  const held = Date.now() - rightDown.time;
  const target = rightDown.target;
  rightDown = null;
  // Si se arrastró o se mantuvo presionado, fue para mover el lienzo
  if (moved > 5 || held > 600) return;
  if (target.closest('.toolbox, .zoom-hud, .mobile-fab, input, textarea, select')) return;
  openCanvasMenu(e.clientX, e.clientY, target);
});

function openCanvasMenu(clientX, clientY, target) {
  // Si se hizo clic derecho sobre algo no seleccionado, se selecciona (como en otros programas)
  if (currentTool === 'select') {
    let key = null;
    const strokeId = hitStroke(clientX, clientY);
    if (strokeId) key = `stroke:${strokeId}`;
    else if (target.closest('.canvas-text')) key = `text:${target.closest('.canvas-text').dataset.textId}`;
    else if (target.closest('.bg-image')) key = `img:${target.closest('.bg-image').dataset.imageId}`;
    else if (target.closest('.board-frame')) key = `board:${target.closest('.board-frame').dataset.boardId}`;
    else if (target.closest('[data-conn-id]')) key = `conn:${target.closest('[data-conn-id]').dataset.connId}`;
    else if (target.closest('.canvas-frame')) key = `frame:${target.closest('.canvas-frame').dataset.frameId}`;
    if (key && !selection.has(key)) setSelection([key]);
    if (!key && !target.closest('.board-frame') && selection.size) setSelection([]);
  }
  menuCanvasPoint = screenToCanvas(clientX, clientY);

  const hasSel = selection.size > 0;
  canvasMenu.querySelector('[data-cmd="copy"]').disabled = !hasSel;
  canvasMenu.querySelector('[data-cmd="cut"]').disabled = !hasSel;
  // Pegar lee también el portapapeles del sistema (texto o imagen copiados en otra app)
  canvasMenu.querySelector('[data-cmd="paste"]').disabled = !canvasClipboard && !(navigator.clipboard && navigator.clipboard.readText);
  canvasMenu.querySelector('[data-cmd="undo"]').disabled = historyStack.length === 0;
  // Sobre una tarea o una columna: opciones para archivar
  const cardEl = target.closest && target.closest('.kanban-card');
  const colEl = target.closest && target.closest('.kanban-column');
  menuTaskId = cardEl ? cardEl.dataset.taskId : null;
  menuColumnId = colEl ? colEl.dataset.columnId : null;
  canvasMenu.querySelector('[data-cmd="archiveTask"]').hidden = !menuTaskId;
  canvasMenu.querySelector('[data-cmd="archiveDone"]').hidden = !menuColumnId;
  canvasMenu.querySelector('[data-cmd="archiveAll"]').hidden = !menuColumnId;
  // Duplicar y Agrupar siempre a la vista (desactivados si no aplican); Desagrupar solo con un grupo
  canvasMenu.querySelector('[data-cmd="duplicate"]').disabled = !hasSel;
  canvasMenu.querySelector('[data-cmd="group"]').disabled = selection.size < 2;
  canvasMenu.querySelector('[data-cmd="group"]').title = selection.size < 2 ? 'Selecciona dos o más objetos para agruparlos' : '';
  canvasMenu.querySelector('[data-cmd="ungroup"]').hidden = selectionGroups().size === 0;
  syncCanvasSubmenus();

  canvasMenu.hidden = false;
  const w = canvasMenu.offsetWidth;
  const h = canvasMenu.offsetHeight;
  canvasMenu.style.left = `${Math.min(clientX, window.innerWidth - w - 8)}px`;
  canvasMenu.style.top = `${Math.min(clientY, window.innerHeight - h - 8)}px`;
}

function closeCanvasMenu() {
  canvasMenu.hidden = true;
  closeCanvasSubmenus();
}

// ----- Submenús (Estilo, Agregar aquí, Google Docs, Archivar): con mouse se abren al pasar por encima,
//       al costado; al tocarlos se abren y cierran. Si no hay lugar al costado, se abren debajo. -----
function closeCanvasSubmenus(except = null) {
  canvasMenu.querySelectorAll('.canvas-menu-sub.is-open').forEach(sub => {
    if (sub === except) return;
    sub.classList.remove('is-open');
    sub.querySelector('.canvas-menu-sub-trigger').setAttribute('aria-expanded', 'false');
  });
}

function openCanvasSubmenu(sub) {
  closeCanvasSubmenus(sub);
  const panel = sub.querySelector('.canvas-menu-sub-panel');
  sub.classList.remove('to-left', 'is-inline');
  panel.style.top = '';
  sub.classList.add('is-open');
  sub.querySelector('.canvas-menu-sub-trigger').setAttribute('aria-expanded', 'true');
  const menuRect = canvasMenu.getBoundingClientRect();
  const w = panel.offsetWidth;
  if (menuRect.right + w + 8 > window.innerWidth) {
    if (menuRect.left - w - 8 >= 0) sub.classList.add('to-left');
    else sub.classList.add('is-inline');
  }
  if (!sub.classList.contains('is-inline')) {
    // Que no se salga por abajo
    const r = panel.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) panel.style.top = `${-6 - (r.bottom - window.innerHeight + 8)}px`;
  }
}

// Oculta un submenú si no tiene opciones visibles y lo desactiva si todas están desactivadas
function syncCanvasSubmenus() {
  canvasMenu.querySelectorAll('.canvas-menu-sub').forEach(sub => {
    const items = [...sub.querySelectorAll('.canvas-menu-sub-panel [data-cmd]')].filter(b => !b.hidden);
    sub.hidden = !items.length;
    sub.querySelector('.canvas-menu-sub-trigger').disabled = items.every(b => b.disabled);
  });
  closeCanvasSubmenus();
}

canvasMenu.querySelectorAll('.canvas-menu-sub').forEach(sub => {
  const trigger = sub.querySelector('.canvas-menu-sub-trigger');
  let closeTimer = null;
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (trigger.disabled) return;
    if (sub.classList.contains('is-open')) closeCanvasSubmenus(); else openCanvasSubmenu(sub);
  });
  sub.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || trigger.disabled) return;
    clearTimeout(closeTimer);
    openCanvasSubmenu(sub);
  });
  sub.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || sub.classList.contains('is-inline')) return;
    closeTimer = setTimeout(() => { if (!sub.matches(':hover')) { sub.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); } }, 250);
  });
});
// Al pasar por una opción del menú principal se cierra el submenú abierto
canvasMenu.addEventListener('pointerover', (e) => {
  const btn = e.target.closest('button');
  if (e.pointerType === 'mouse' && btn && !btn.closest('.canvas-menu-sub')) closeCanvasSubmenus();
});

// En el celular, doble toque sobre una imagen, un texto o un tablero acerca la vista a ese objeto;
// en un espacio vacío abre el menú contextual (equivale al clic derecho)
let tapStart = null;
let lastTap = null;
let lastPointerType = 'mouse';
viewportArea.addEventListener('pointerdown', (e) => {
  lastPointerType = e.pointerType;
  if (e.pointerType !== 'touch') return;
  tapStart = e.isPrimary ? { x: e.clientX, y: e.clientY, time: Date.now(), target: e.target } : null;
  if (!e.isPrimary) lastTap = null; // dos dedos no cuentan como toque
}, true);
viewportArea.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch' || !tapStart || !e.isPrimary) return;
  const start = tapStart;
  tapStart = null;
  const isTap = Math.hypot(e.clientX - start.x, e.clientY - start.y) < 12 && Date.now() - start.time < 350;
  if (!isTap || !['select', 'hand'].includes(currentTool)) { lastTap = null; return; }
  if (start.target.closest('.toolbox, .zoom-hud, .mobile-fab, .kanban-card, button, input, select, textarea, a, label')) { lastTap = null; return; }
  const now = Date.now();
  if (lastTap && now - lastTap.time < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
    lastTap = null;
    const rect = objectRectAt(start.target);
    if (rect) fitRectToScreen(rect.x, rect.y, rect.w, rect.h);
    else openCanvasMenu(e.clientX, e.clientY, start.target);
    return;
  }
  lastTap = { x: e.clientX, y: e.clientY, time: now };
}, true);

canvasMenu.addEventListener('contextmenu', (e) => e.preventDefault());
canvasMenu.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cmd]');
  if (!btn || btn.disabled) return;
  const cmd = btn.dataset.cmd;
  closeCanvasMenu();
  if (cmd === 'copy') copySelection();
  if (cmd === 'cut') cutSelection();
  if (cmd === 'paste') await pasteHere(menuCanvasPoint);
  if (cmd === 'addText') addText('', menuCanvasPoint);
  if (cmd === 'photo') takePhoto(menuCanvasPoint);
  if (cmd === 'canvasColor') openCanvasColorPicker();
  if (cmd === 'archiveTask' && menuTaskId) archiveTask(menuTaskId);
  if (cmd === 'archiveDone' && menuColumnId) archiveColumnTasks(menuColumnId, true);
  if (cmd === 'archiveAll' && menuColumnId) archiveColumnTasks(menuColumnId, false);
  if (cmd === 'duplicate') duplicateSelection();
  if (cmd === 'frame' && typeof addFrame === 'function') addFrame(menuCanvasPoint);
  if (cmd === 'addPdf') pickPdf(menuCanvasPoint);
  if (cmd === 'translate' && typeof openTranslator === 'function') {
    const t = selectedTexts()[0];
    openTranslator(t ? t.text : '', menuCanvasPoint);
  }
  if (cmd === 'newGoogleDoc') createGoogleDoc('doc', menuCanvasPoint);
  if (cmd === 'newGoogleSheet') createGoogleDoc('sheet', menuCanvasPoint);
  if (cmd === 'newGoogleSlides') createGoogleDoc('slides', menuCanvasPoint);
  if (cmd === 'group') groupSelection();
  if (cmd === 'ungroup') ungroupSelection();
  if (cmd === 'sticky') addStickyNote(menuCanvasPoint);
  if (cmd === 'ytProgress') addYtProgressWidget(menuCanvasPoint);
  if (cmd === 'findImage') openImageLibrary(menuCanvasPoint);
  if (cmd === 'internalLink') {
    const point = menuCanvasPoint;
    openInternalLinkPicker(url => addText(url, point));
  }
  if (cmd === 'copyInternalLink') {
    // Link al objeto seleccionado (tablero, texto o imagen) o, si no hay, al proyecto
    const key = selection.size === 1 ? [...selection][0] : '';
    const [type, id] = key.split(':');
    const kind = { board: 'b', text: 't', img: 'i' }[type] || null;
    copyWithToast(internalLinkUrl(activeProjectId, kind, kind ? id : null), 'Link interno copiado: pégalo en un texto o una tarea de otro proyecto');
  }
  if (cmd === 'undo') undoLastChange();
});

// Pegar desde el menú: texto o imagen copiados en otra app, o lo copiado en el lienzo
async function pasteHere(point) {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) {}
  if (text && text !== CANVAS_CLIPBOARD_MARK && text.trim()) {
    addText(text, point);
    return;
  }
  if (canvasClipboard) {
    await pasteClipboard(point);
    return;
  }
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        await addBgImageFromFile(new File([blob], 'pegada', { type }));
        return;
      }
    }
  } catch (e) {}
  showToast('No hay nada para pegar', 'info');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !canvasMenu.hidden) closeCanvasMenu();
});
viewportArea.addEventListener('wheel', () => closeCanvasMenu(), { passive: true });
window.addEventListener('blur', closeCanvasMenu);

// =============================================================================
// 7h. Cuenta de Google + sincronización con Google Drive
//     Los datos se guardan en la carpeta oculta de la app en tu Drive (appDataFolder):
//     - zenban-data.json  -> proyectos, tableros, tareas, dibujos, etiquetas
//     - img-...           -> cada imagen (fondos y tareas)
// =============================================================================

var SYNC = {
  token: null,
  tokenExp: 0,
  tokenClient: null,
  fileId: null,
  remoteVersion: null, // versión del archivo de Drive con la que se sincronizó por última vez
  imageFiles: null,
  busy: false,
  again: false,
  applying: false,
  gen: 0,
  timer: null,
  status: 'off'
};

const SYNC_KEYS = {
  ENABLED: 'zenban_sync_enabled',
  USER: 'zenban_sync_user',
  DIRTY: 'zenban_sync_dirty',
  LAST: 'zenban_sync_last',
  DELETED: 'zenban_deleted_projects',
  SWITCH: 'zenban_space_switch',
  CLIENT_ID: 'zenban_google_client_id',
  STATE: 'zenban_oauth_state',
  TOKEN: 'zenban_sync_token' // sesión de Google vigente: al abrir la app se sincroniza sin volver a entrar
};

function saveSyncToken() {
  try { localStorage.setItem(SYNC_KEYS.TOKEN, JSON.stringify({ token: SYNC.token, exp: SYNC.tokenExp })); } catch (e) {}
}

function forgetSyncToken() {
  SYNC.token = null;
  localStorage.removeItem(SYNC_KEYS.TOKEN);
}

// Al abrir la app (o en otra ventana): si la sesión guardada sigue vigente, se usa
function restoreSyncToken() {
  if (SYNC.token && Date.now() < SYNC.tokenExp) return true;
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_KEYS.TOKEN) || 'null');
    if (saved && saved.token && Date.now() < saved.exp) {
      SYNC.token = saved.token;
      SYNC.tokenExp = saved.exp;
      return true;
    }
  } catch (e) {}
  return false;
}
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata openid email profile';
const DATA_FILE_NAME = 'zenban-data.json';

function googleClientId() {
  return ((window.ZENBAN_CONFIG && window.ZENBAN_CONFIG.googleClientId) || localStorage.getItem(SYNC_KEYS.CLIENT_ID) || '').trim();
}

function syncEnabled() {
  return localStorage.getItem(SYNC_KEYS.ENABLED) === '1';
}

function savedUser() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEYS.USER) || 'null'); } catch (e) { return null; }
}

function isDirty() {
  return localStorage.getItem(SYNC_KEYS.DIRTY) === '1';
}

function setDirty(value) {
  localStorage.setItem(SYNC_KEYS.DIRTY, value ? '1' : '0');
}

function lastSyncedAt() {
  return Number(localStorage.getItem(SYNC_KEYS.LAST) || 0);
}

function recordDeletedProject(id) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(SYNC_KEYS.DELETED) || '[]'); } catch (e) {}
  list.push({ id, at: Date.now() });
  localStorage.setItem(SYNC_KEYS.DELETED, JSON.stringify(list.slice(-200)));
}

function deletedProjects() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEYS.DELETED) || '[]'); } catch (e) { return []; }
}

// Se llama cada vez que se guardan proyectos o etiquetas
function onLocalDataChanged() {
  if (typeof SYNC === 'undefined' || !SYNC || SYNC.applying) return;
  SYNC.gen++;
  setDirty(true);
  if (!syncEnabled()) return;
  if (SYNC.token || restoreSyncToken()) scheduleSync(2500);
  else setSyncStatus('pending');
}

// ¿El usuario está a mitad de un cambio que aún no se guarda? (un dedo o botón apretado sobre la app:
// arrastrar, cambiar tamaño, dibujar; o escribiendo un texto del lienzo)
const pointersDown = new Set();
document.addEventListener('pointerdown', (e) => pointersDown.add(e.pointerId), true);
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, (e) => {
  pointersDown.delete(e.pointerId);
  // Al soltar, si había una sincronización esperando, se hace enseguida
  if (!pointersDown.size && SYNC.again && SYNC.token && !SYNC.busy) scheduleSync(600);
}, true));
window.addEventListener('blur', () => pointersDown.clear());

function userIsInteracting() {
  return pointersDown.size > 0 || !!editingTextId || !!(typeof dragState !== 'undefined' && dragState.active);
}

function scheduleSync(delay = 2500) {
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(syncNow, delay);
}

// ----- Interfaz de la cuenta -----
const googleSignInBtn = document.getElementById('googleSignInBtn');
const accountChip = document.getElementById('accountChip');
const accountAvatar = document.getElementById('accountAvatar');
const accountMenu = document.getElementById('accountMenu');
const syncDot = document.getElementById('syncDot');
const syncStatusText = document.getElementById('syncStatusText');

const SYNC_STATUS_TEXT = {
  off: 'Sin sincronizar',
  syncing: 'Sincronizando…',
  ok: 'Todo sincronizado con Drive',
  pending: 'Hay cambios sin subir. Toca «Reconectar con Google».',
  expired: 'La sesión de Google venció. Toca «Reconectar con Google».',
  offline: 'Sin conexión. Se sincronizará al volver.',
  error: 'No se pudo sincronizar. Se reintentará.'
};

function setSyncStatus(status) {
  SYNC.status = status;
  syncDot.dataset.status = status;
  syncStatusText.textContent = SYNC_STATUS_TEXT[status] || '';
  if (status === 'ok' && lastSyncedAt()) {
    const t = new Date(lastSyncedAt());
    syncStatusText.textContent += ` · ${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  // Con qué datos se sincroniza: se muestra en grande y con color (spaces.js)
  if (typeof renderSpaceIndicator === 'function') renderSpaceIndicator();
  accountChip.title = SYNC_STATUS_TEXT[status] || 'Cuenta';
  renderSyncAge();
  if (typeof renderReconnectState === 'function' && document.getElementById('syncNowBtn')) renderReconnectState();
  if (typeof renderSyncBanner === 'function') renderSyncBanner();
}

// Cuánto hace de la última sincronización: bajo el nombre ZenBan (en vez de "Todo Kanban Pro")
// y abreviado junto a la foto de la cuenta. Se actualiza cada 30 s.
function syncAgeText(short = false) {
  const last = lastSyncedAt();
  if (!last) return '';
  const min = Math.floor((Date.now() - last) / 60000);
  if (min < 1) return short ? 'ahora' : 'recién';
  if (min < 60) return short ? `${min} min` : `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return short ? `${h} h` : `hace ${h} h`;
  const d = Math.floor(h / 24);
  return short ? `${d} d` : `hace ${d} día${d === 1 ? '' : 's'}`;
}

function renderSyncAge() {
  const tag = document.getElementById('brandTag');
  const age = document.getElementById('syncAge');
  const on = syncEnabled() && savedUser();
  if (age) age.textContent = on ? syncAgeText(true) : '';
  if (!tag) return;
  if (!on) { tag.textContent = 'Todo Kanban Pro'; tag.title = ''; return; }
  const status = SYNC.status;
  const text = status === 'syncing' ? 'Sincronizando…'
    : status === 'offline' ? `Sin conexión · ${syncAgeText() || 'sin sincronizar'}`
    : status === 'error' ? 'Error al sincronizar'
    : status === 'expired' || status === 'pending' ? `Sesión vencida · ${syncAgeText() || 'sin sincronizar'}`
    : lastSyncedAt() ? `Sincronizado ${syncAgeText()}` : 'Sin sincronizar';
  tag.textContent = text;
  tag.dataset.status = status || '';
  tag.title = lastSyncedAt() ? `Última sincronización: ${new Date(lastSyncedAt()).toLocaleString()}` : '';
}
setInterval(renderSyncAge, 30000);

// ----- Aviso visible cuando no se está sincronizando (sesión vencida, error o sin conexión) -----
// Antes solo cambiaba un puntito junto a la foto y era fácil seguir trabajando sin notar que nada se subía.
const SYNC_BANNER_SNOOZE_KEY = 'zenban_sync_banner_snooze';
function renderSyncBanner() {
  let bar = document.getElementById('syncBanner');
  const on = syncEnabled() && savedUser();
  const expired = sessionExpired();
  const offline = !navigator.onLine || SYNC.status === 'offline';
  const failing = expired || offline || SYNC.status === 'error';
  const ageMin = lastSyncedAt() ? (Date.now() - lastSyncedAt()) / 60000 : Infinity;
  const snoozed = Number(sessionStorage.getItem(SYNC_BANNER_SNOOZE_KEY) || 0) > Date.now();
  const show = on && failing && (isDirty() || ageMin > 5) && !snoozed;
  if (!show) { if (bar) bar.hidden = true; return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'syncBanner';
    bar.className = 'sync-banner';
    bar.setAttribute('role', 'alert');
    bar.innerHTML = '<span class="sync-banner-icon" aria-hidden="true">⚠</span><span class="sync-banner-text"></span>' +
      '<button type="button" class="sync-banner-btn"></button>' +
      '<button type="button" class="sync-banner-close" title="Ocultar unos minutos" aria-label="Ocultar">×</button>';
    bar.querySelector('.sync-banner-btn').addEventListener('click', () => {
      if (sessionExpired()) signInWithGoogle(); else syncNow();
    });
    bar.querySelector('.sync-banner-close').addEventListener('click', () => {
      sessionStorage.setItem(SYNC_BANNER_SNOOZE_KEY, String(Date.now() + 10 * 60 * 1000));
      bar.hidden = true;
    });
    document.body.appendChild(bar);
  }
  const age = syncAgeText() || 'nunca';
  bar.querySelector('.sync-banner-text').textContent = isDirty()
    ? `Tienes cambios sin subir a Drive · última sincronización: ${age}`
    : `Sin sincronizar (${age}): puede que no estés viendo lo último de tus otros dispositivos`;
  const btn = bar.querySelector('.sync-banner-btn');
  btn.hidden = offline;
  btn.textContent = expired ? 'Reconectar y sincronizar' : 'Sincronizar ahora';
  bar.classList.toggle('is-dirty', isDirty());
  bar.hidden = false;
}
setInterval(renderSyncBanner, 30000);
window.addEventListener('online', renderSyncBanner);
window.addEventListener('offline', renderSyncBanner);

function renderAccount() {
  const user = savedUser();
  const enabled = syncEnabled() && user;
  googleSignInBtn.hidden = !!enabled;
  accountChip.hidden = !enabled;
  if (!enabled) {
    accountMenu.hidden = true;
    return;
  }
  document.getElementById('accountName').textContent = user.name || 'Cuenta de Google';
  document.getElementById('accountEmail').textContent = user.email || '';
  accountAvatar.innerHTML = user.picture
    ? `<img src="${escapeHtml(user.picture)}" alt="" referrerpolicy="no-referrer">`
    : escapeHtml((user.name || user.email || '?').charAt(0).toUpperCase());
  if (!SYNC.token) setSyncStatus(isDirty() ? 'pending' : 'expired');
}

// ----- Inicio de sesión (Google Identity Services) -----
function initTokenClient() {
  if (SYNC.tokenClient) return true;
  if (!(window.google && google.accounts && google.accounts.oauth2)) return false;
  SYNC.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: googleClientId(),
    scope: DRIVE_SCOPES,
    callback: onTokenResponse,
    error_callback: (err) => {
      console.warn('Google sign-in', err);
      if (err && err.type === 'popup_closed') return;
      showToast('No se pudo abrir el inicio de sesión de Google. Revisa que no estén bloqueadas las ventanas emergentes.', 'warning');
    }
  });
  return true;
}

// En la app instalada en el celular la ventana emergente de Google no siempre
// devuelve la sesión, así que ahí se usa el inicio de sesión por redirección.
// En el PC (instalada o no) la ventana emergente funciona bien.
function isInstalledApp() {
  if (window.navigator.standalone === true) return true; // iPhone / iPad
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return mobile && !!window.matchMedia && matchMedia('(display-mode: standalone)').matches;
}

function signInWithRedirect() {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem(SYNC_KEYS.STATE, state);
  const user = savedUser();
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: location.origin + location.pathname.replace(/index\.html$/, ''),
    response_type: 'token',
    scope: DRIVE_SCOPES,
    include_granted_scopes: 'true',
    state
  });
  if (user && user.email) params.set('login_hint', user.email);
  else params.set('prompt', 'select_account');
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// Al volver de Google por redirección, el token llega en la dirección (#access_token=...)
function consumeRedirectToken() {
  if (!location.hash || location.hash.indexOf('access_token=') === -1 && location.hash.indexOf('error=') === -1) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = localStorage.getItem(SYNC_KEYS.STATE);
  localStorage.removeItem(SYNC_KEYS.STATE);
  if (!expected || h.get('state') !== expected) return null;
  if (h.get('error')) return { error: h.get('error') };
  return { access_token: h.get('access_token'), expires_in: h.get('expires_in') };
}

function signInWithGoogle() {
  if (!googleClientId()) {
    openGoogleSetup();
    return;
  }
  if (isInstalledApp()) {
    signInWithRedirect();
    return;
  }
  if (!initTokenClient()) {
    showToast('Cargando Google… inténtalo de nuevo en un momento', 'info');
    return;
  }
  const user = savedUser();
  SYNC.tokenClient.requestAccessToken({ prompt: user ? '' : 'select_account', login_hint: user ? user.email : undefined });
}

async function onTokenResponse(resp) {
  if (!resp || resp.error) {
    showToast('No se completó el inicio de sesión con Google', 'warning');
    return;
  }
  SYNC.token = resp.access_token;
  SYNC.tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
  saveSyncToken();
  try {
    const info = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${SYNC.token}` }
    })).json();
    const previous = savedUser();
    // Otra cuenta en este dispositivo: se trata como primera sincronización
    if (previous && previous.email !== info.email) localStorage.setItem(SYNC_KEYS.LAST, '0');
    localStorage.setItem(SYNC_KEYS.USER, JSON.stringify({ email: info.email, name: info.name, picture: info.picture }));
  } catch (e) {
    console.warn('userinfo', e);
  }
  localStorage.setItem(SYNC_KEYS.ENABLED, '1');
  renderAccount();
  showToast('Sesión iniciada. Sincronizando con Google Drive…', 'success');
  await syncNow();
  if (typeof checkSharedInvites === 'function') checkSharedInvites();
}

function signOutGoogle() {
  if (SYNC.token && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(SYNC.token, () => {}); } catch (e) {}
  }
  forgetSyncToken();
  SYNC.fileId = null;
  SYNC.remoteVersion = null;
  SYNC.imageFiles = null;
  localStorage.setItem(SYNC_KEYS.ENABLED, '0');
  localStorage.removeItem(SYNC_KEYS.USER);
  localStorage.setItem(SYNC_KEYS.LAST, '0');
  setSyncStatus('off');
  renderAccount();
  showToast('Sesión cerrada. Tus datos siguen en este dispositivo.', 'info');
}

// ----- Espacio de datos: personal (carpeta oculta de tu Drive) o compartido (carpeta de Drive compartida) -----
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

function currentSpace() {
  try { return JSON.parse(localStorage.getItem('zenban_space') || 'null') || { mode: 'personal' }; } catch (e) { return { mode: 'personal' }; }
}

function inShared() {
  const s = currentSpace();
  return s.mode === 'shared' && !!s.folderId;
}

function spaceKey(s) {
  return s && s.mode === 'shared' && s.folderId ? `shared:${s.folderId}` : 'personal';
}

// Otra pestaña de este navegador se cambió a otro espacio (los datos guardados ya son de ese espacio)
function spaceChangedElsewhere() {
  return spaceKey(currentSpace()) !== tabSpaceKey;
}

let reloadingForSpace = false;
function reloadForSpaceChange() {
  if (reloadingForSpace) return;
  reloadingForSpace = true;
  showToast('Se cambió de espacio en otra pestaña. Recargando…', 'info');
  setTimeout(() => location.reload(), 800);
}

window.addEventListener('storage', (e) => {
  if (e.key === 'zenban_space' && spaceChangedElsewhere()) reloadForSpaceChange();
});

// Al pasar a otro espacio, la primera sincronización usa los datos de ese espacio tal cual:
// nunca se combinan con los del espacio anterior (si no, un proyecto quedaría en los dos)
function markSpaceSwitch() {
  localStorage.setItem(SYNC_KEYS.LAST, '0');
  localStorage.setItem(SYNC_KEYS.SWITCH, '1');
}

function setSpace(space) {
  tabSpaceKey = spaceKey(space);
  localStorage.setItem('zenban_space', JSON.stringify(space));
  SYNC.fileId = null;
  SYNC.remoteVersion = null;
  SYNC.imageFiles = null;
  // Los "otros espacios" leídos antes ya no sirven (incluían este y les faltaba el anterior):
  // la lista de proyectos los vuelve a leer y mientras tanto usa la copia guardada
  if (typeof OtherSpaces !== 'undefined') {
    OtherSpaces.entries = [];
    OtherSpaces.loadedAt = 0;
  }
}

function spaceQuery(cond) {
  if (inShared()) {
    const q = `'${currentSpace().folderId}' in parents and trashed=false and ${cond}`;
    return `q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  }
  return `spaces=appDataFolder&q=${encodeURIComponent(cond)}`;
}

function spaceParent() {
  return inShared() ? currentSpace().folderId : 'appDataFolder';
}

// ----- Google Drive -----
async function driveFetch(url, opts = {}) {
  if (!SYNC.token || Date.now() > SYNC.tokenExp) {
    SYNC.token = null;
    throw new Error('auth');
  }
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${SYNC.token}` } });
  if (r.status === 401) {
    forgetSyncToken();
    throw new Error('auth');
  }
  if (r.status === 403) {
    // Puede ser un permiso que falta en la sesión (hay que reconectar) o un archivo sin acceso
    let reason = '';
    try { const j = await r.clone().json(); reason = ((j.error && j.error.errors && j.error.errors[0]) || {}).reason || ''; } catch (e) {}
    if (/scope|auth/i.test(reason)) { SYNC.token = null; throw new Error('auth'); }
    const err = new Error('forbidden'); err.status = 403; throw err;
  }
  if (!r.ok) { const err = new Error(`drive ${r.status}`); err.status = r.status; throw err; }
  return r;
}

async function findDataFile() {
  const r = await driveFetch(`${DRIVE_API}/files?${spaceQuery(`name='${DATA_FILE_NAME}'`)}&orderBy=createdTime&fields=files(id,modifiedTime,version)`);
  const j = await r.json();
  return (j.files && j.files[0]) || null;
}

async function driveUpload(name, blob, existingId = null) {
  if (existingId) {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', body: blob });
    return existingId;
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [spaceParent()] })], { type: 'application/json' }));
  form.append('file', blob);
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', body: form });
  return (await r.json()).id;
}

async function listDriveImages() {
  const map = new Map();
  let pageToken = '';
  do {
    const r = await driveFetch(`${DRIVE_API}/files?${spaceQuery("name contains 'img-'")}&pageSize=1000&fields=nextPageToken,files(id,name)${pageToken ? `&pageToken=${pageToken}` : ''}`);
    const j = await r.json();
    (j.files || []).forEach(f => map.set(f.name, f.id));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return map;
}

// ----- Copia de la última sincronización: permite combinar los cambios de varias personas -----
const SyncBase = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('zenban_sync', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  key() { return 'base:' + (inShared() ? currentSpace().folderId : 'personal'); },
  async get() {
    try {
      const db = await this.open();
      return await new Promise((resolve) => {
        const q = db.transaction('kv').objectStore('kv').get(this.key());
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  },
  async set(value) {
    try {
      const db = await this.open();
      await new Promise((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(JSON.parse(JSON.stringify(value)), this.key());
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    } catch (e) {}
  }
};

// ----- Datos: empaquetar, combinar y aplicar -----
function localPayload() {
  return { version: 1, projects, tags: tagLibrary, deletedProjects: deletedProjects() };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Combina listas de objetos con id (tareas, columnas, tableros, dibujos, imágenes):
// lo que cambió solo aquí se queda, lo que cambió solo en Drive se trae, y si cambió en ambos gana lo de aquí
function mergeArrays(L, R, B) {
  L = L || [];
  R = R || [];
  const hasIds = arr => arr.every(x => x && typeof x === 'object' && x.id != null);
  if (!hasIds(L) || !hasIds(R) || (B && !hasIds(B))) return B && sameJson(L, B) ? R : L;
  const lm = new Map(L.map(x => [x.id, x]));
  const rm = new Map(R.map(x => [x.id, x]));
  const bm = new Map((B || []).map(x => [x.id, x]));
  const out = new Map();
  for (const id of new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])) {
    const l = lm.get(id), r = rm.get(id), b = bm.get(id);
    let v;
    if (!B || b === undefined) v = l !== undefined ? l : r;
    else if (sameJson(l, b)) v = r;
    else if (sameJson(r, b)) v = l;
    else v = l !== undefined ? l : r; // cambió en ambos lados; si uno lo borró y el otro lo editó, se conserva la edición
    if (v !== undefined) out.set(id, v);
  }
  // Si aquí no se cambió el orden, se respeta el orden que viene de Drive
  const common = id => lm.has(id) && rm.has(id) && bm.has(id);
  const localOrderKept = B && sameJson(L.map(x => x.id).filter(common), B.map(x => x.id).filter(common));
  const order = localOrderKept ? [...R, ...L] : [...L, ...R];
  const result = [];
  const seen = new Set();
  order.forEach(x => {
    if (out.has(x.id) && !seen.has(x.id)) {
      seen.add(x.id);
      result.push(out.get(x.id));
    }
  });
  return result;
}

function mergeProject(l, r, b) {
  const out = {};
  const newer = (l.updatedAt || 0) >= (r.updatedAt || 0) ? l : r;
  const older = newer === l ? r : l;
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (k === 'updatedAt') continue;
    if (Array.isArray(l[k]) || Array.isArray(r[k])) out[k] = mergeArrays(l[k], r[k], b ? b[k] : null);
    else if (b) out[k] = sameJson(l[k], b[k]) ? r[k] : l[k];
    else out[k] = k in newer ? newer[k] : older[k];
  }
  out.updatedAt = Math.max(l.updatedAt || 0, r.updatedAt || 0);
  return out;
}

// Etiquetas: combinación en tres vías por id (como las tareas), para que una etiqueta borrada o
// renombrada en otro dispositivo (o desde el conector de Claude) no reaparezca. Sin ids, unión por nombre.
function mergeTags(L, R, B) {
  L = L || [];
  R = R || [];
  const withIds = arr => arr.every(t => t && t.id != null);
  const merged = withIds(L) && withIds(R) && (!B || withIds(B))
    ? mergeArrays(L, R, B)
    : [...R, ...L];
  const seen = new Map();
  merged.forEach(t => {
    const key = String(t.name || '').toLowerCase();
    if (!seen.has(key) || L.includes(t)) seen.set(key, t);
  });
  return [...seen.values()];
}

function mergePayloads(local, remote, base = null) {
  // Un borrado solo cuenta del lado que ya no tiene el proyecto: si un lado tiene el proyecto y
  // también su borrado, ese borrado quedó viejo (el proyecto siguió vivo) y se ignora
  const tombs = new Map();
  [remote, local].forEach(side => {
    const alive = new Set((side.projects || []).map(p => p.id));
    (side.deletedProjects || []).forEach(t => {
      if (alive.has(t.id)) return;
      if (!tombs.has(t.id) || tombs.get(t.id) < t.at) tombs.set(t.id, t.at);
    });
  });
  const lm = new Map((local.projects || []).map(p => [p.id, p]));
  const bm = new Map(((base && base.projects) || []).map(p => [p.id, p]));
  const merged = [];
  const seen = new Set();
  [...(remote.projects || []), ...(local.projects || [])].forEach(p => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    const l = lm.get(p.id);
    const r = (remote.projects || []).find(x => x.id === p.id);
    merged.push(l && r ? mergeProject(l, r, bm.get(p.id) || null) : (l || r));
  });

  // Un proyecto borrado no vuelve aunque otro dispositivo atrasado lo haya editado después (su copia
  // queda en las copias de seguridad de ese dispositivo). Solo vuelve si se recuperó a propósito
  // desde una copia de seguridad (restoredAt) después de borrarlo.
  const alive = merged.filter(p => !tombs.has(p.id) || (p.restoredAt || 0) > tombs.get(p.id));
  const kept = new Set(alive.map(p => p.id));
  return {
    version: 1,
    projects: alive,
    tags: mergeTags(local.tags, remote.tags, base ? base.tags : null),
    deletedProjects: [...tombs.entries()].filter(([id]) => !kept.has(id)).map(([id, at]) => ({ id, at }))
  };
}

function applyPayload(data) {
  if (!data || !Array.isArray(data.projects) || data.projects.length === 0) return;
  SYNC.applying = true;
  try {
    projects = data.projects;
    tagLibrary = Array.isArray(data.tags) ? data.tags : tagLibrary;
    localStorage.setItem(SYNC_KEYS.DELETED, JSON.stringify(data.deletedProjects || []));
    saveData(STORAGE_KEYS.PROJECTS, projects);
    saveData(STORAGE_KEYS.TAGS, tagLibrary);
    if (!projects.some(p => p.id === activeProjectId)) activeProjectId = projects[0].id;
    const project = getActiveProject();
    project.columns = project.columns || [];
    project.tasks = project.tasks || [];
    columns = project.columns;
    tasks = project.tasks;
    selection = new Set();
    focusedBoardId = null;
    renderProjectSwitcher();
    renderBoard();
    renderBgImages();
    renderTexts();
    renderDrawings();
    resetHistory();
  } finally {
    SYNC.applying = false;
  }
}

function dataPart(p) {
  return { projects: p.projects || [], tags: p.tags || [], deletedProjects: p.deletedProjects || [] };
}

// ----- Ciclo de sincronización -----
async function syncNow() {
  if (!syncEnabled()) return;
  if (!SYNC.token || Date.now() > SYNC.tokenExp) {
    SYNC.token = null;
    setSyncStatus(isDirty() ? 'pending' : 'expired');
    return;
  }
  if (!navigator.onLine) {
    setSyncStatus('offline');
    return;
  }
  if (SYNC.busy) {
    SYNC.again = true;
    return;
  }
  if (spaceChangedElsewhere()) {
    reloadForSpaceChange();
    return;
  }
  SYNC.busy = true;
  setSyncStatus('syncing');
  try {
    // Lo que guardó otra ventana de ZenBan se suma antes de comparar con Drive
    if (otherWindowSaved()) adoptOtherWindowData();
    const gen = SYNC.gen;
    if (inShared() && typeof checkSharedFolder === 'function' && !(await checkSharedFolder())) return;
    const file = await findDataFile();
    SYNC.fileId = file ? file.id : null;
    // Ni Drive ni este dispositivo cambiaron desde la última sincronización: no hay nada que descargar
    // ni comparar. (Descargar y comparar todo cada 45 s congelaba un momento los toques en el celular.)
    if (file && SYNC.remoteVersion && String(file.version) === SYNC.remoteVersion && !isDirty() && SYNC.gen === gen && lastSyncedAt()) {
      setSyncStatus('ok');
      return;
    }
    const remote = file ? await (await driveFetch(`${DRIVE_API}/files/${file.id}?alt=media&supportsAllDrives=true`)).json() : null;
    const local = localPayload();

    let result = local;
    let mergeBase = null; // copia de la última sincronización (para saber qué nunca llegó a Drive)
    const switching = localStorage.getItem(SYNC_KEYS.SWITCH) === '1';
    if (switching && !(remote && Array.isArray(remote.projects) && remote.projects.length)) {
      // Se entró a un espacio vacío: empieza con un proyecto nuevo, sin copiar los del espacio anterior
      result = { projects: [blankProject()], tags: local.tags, deletedProjects: [] };
    } else if (remote && Array.isArray(remote.projects) && remote.projects.length) {
      if (switching) {
        result = dataPart(remote);
      } else if (lastSyncedAt() === 0) {
        // Primera vez con estos datos en este dispositivo: nunca se pisa nada sin preguntar
        const where = inShared() ? `la carpeta compartida "${currentSpace().folderName || 'ZenBan'}"` : 'tu Google Drive';
        const useDrive = await askConfirm({
          title: 'Ya hay datos de ZenBan',
          message: `Hay datos guardados en ${where}.\nUsar los de Drive reemplaza lo que hay en este dispositivo. Combinar junta ambos (no se pierde nada).`,
          confirmText: 'Usar los de Drive', cancelText: 'Combinar con los de aquí', icon: '☁️'
        });
        result = useDrive ? dataPart(remote) : mergePayloads(local, remote, null);
      } else {
        const base = await SyncBase.get();
        mergeBase = base;
        // Sin copia de la última sincronización y sin cambios aquí: Drive manda (evita revivir lo borrado en otro lado)
        result = !base && !isDirty() ? dataPart(remote) : mergePayloads(local, remote, base);
      }
    }

    // Si hubo cambios aquí mientras se descargaba, se vuelve a empezar para no perderlos
    // (o si otra pestaña cambió de espacio mientras tanto)
    if (spaceChangedElsewhere()) return;
    if ((SYNC.gen !== gen || otherWindowSaved()) && !switching) {
      SYNC.again = true;
      return;
    }
    // Si se está arrastrando, cambiando de tamaño, escribiendo un texto o dibujando, ese cambio todavía
    // no está guardado: aplicar ahora lo que llegó de Drive lo dejaría sobre una copia vieja y se perdería.
    // Se espera a que termine (se reintenta en unos segundos).
    if (!switching && !sameJson(dataPart(result), dataPart(local)) && userIsInteracting()) {
      SYNC.again = true;
      return;
    }

    if (!sameJson(dataPart(result), dataPart(local))) {
      // Si algo de este dispositivo va a dejar de estar, antes se guarda una copia para poder recuperarlo
      if (typeof backupBeforeReplace === 'function') {
        // (al cambiar de espacio es normal que se vaya todo lo del espacio anterior: se guarda, sin aviso)
        await backupBeforeReplace(local, result, switching ? local : mergeBase, switching ? 'Antes de cambiar de espacio' : 'Antes de traer cambios de Drive');
        if (SYNC.gen !== gen || otherWindowSaved() || userIsInteracting()) { SYNC.again = true; return; }
      }
      applyPayload(result);
    } else localStorage.setItem(SYNC_KEYS.DELETED, JSON.stringify(result.deletedProjects || []));

    // Versión de Drive con la que queda sincronizado (si se sube, la siguiente consulta la obtiene)
    SYNC.remoteVersion = file ? String(file.version) : null;
    if (!remote || !sameJson(dataPart(result), dataPart(remote))) {
      // Si otra persona guardó mientras tanto, se vuelve a combinar antes de subir para no pisar su cambio
      if (file) {
        const now = await (await driveFetch(`${DRIVE_API}/files/${file.id}?fields=version&supportsAllDrives=true`)).json();
        if (String(now.version) !== String(file.version)) {
          SYNC.remoteVersion = null;
          SYNC.again = true;
          return;
        }
      }
      const data = { ...dataPart(result), version: 1, savedAt: Date.now() };
      SYNC.remoteVersion = null;
      SYNC.fileId = await driveUpload(DATA_FILE_NAME, new Blob([JSON.stringify(data)], { type: 'application/json' }), SYNC.fileId);
    }
    await SyncBase.set(dataPart(result));
    localStorage.setItem(SYNC_KEYS.LAST, String(Date.now()));
    localStorage.removeItem(SYNC_KEYS.SWITCH);
    if (SYNC.gen === gen || switching) setDirty(false);

    await syncImages();
    setSyncStatus(isDirty() ? 'syncing' : 'ok');
  } catch (err) {
    console.warn('Sincronización', err);
    if (err.message === 'auth') setSyncStatus(isDirty() ? 'pending' : 'expired');
    else setSyncStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    SYNC.busy = false;
    if (SYNC.again || (isDirty() && SYNC.token)) {
      SYNC.again = false;
      scheduleSync(2000);
    }
  }
}

function referencedImageIds(list = projects) {
  const ids = new Set();
  list.forEach(p => {
    (p.bgImages || []).forEach(i => ids.add(bgImageRef(i)));
    (p.tasks || []).forEach(t => (t.images || []).forEach(i => ids.add(i.id)));
    // Pestañas de ventanas web y plugins
    (p.texts || []).forEach(t => { if (t.web && t.web.image && !isRemoteImage(t.web.image)) ids.add(t.web.image); });
    // Imágenes renombradas de la Biblioteca (se conservan aunque ya no se usen en ningún lugar)
    (Array.isArray(p.imageNames) ? p.imageNames : []).forEach(e => { if (e && e.id && e.name && !isRemoteImage(e.id)) ids.add(e.id); });
    // Imágenes de las pestañas de los tableros y de los links que se muestran como imagen
    (p.boards || []).forEach(b => { if (b.image && !isRemoteImage(b.image)) ids.add(b.image); });
    (p.frames || []).forEach(f => { if (f.image && !isRemoteImage(f.image)) ids.add(f.image); });
    [...(p.tasks || []), ...(p.texts || [])].forEach(o => Object.values(o.linkNames || {}).forEach(v => {
      if (v && typeof v === 'object' && v.image && !isRemoteImage(v.image)) ids.add(v.image);
    }));
    // PDFs guardados en ZenBan (links zenfile:// en textos del lienzo, descripciones y subtareas)
    (p.texts || []).forEach(t => fileIdsInText(t.text).forEach(id => ids.add(id)));
    (p.tasks || []).forEach(t => {
      fileIdsInText(t.description).forEach(id => ids.add(id));
      (t.subtasks || []).forEach(s => fileIdsInText(s.text).forEach(id => ids.add(id)));
    });
  });
  return ids;
}

// Sube las imágenes nuevas y descarga las que falten en este dispositivo.
// Primero las del proyecto abierto, varias a la vez, y cada una se muestra apenas llega
// (antes se bajaban de a una, de todos los proyectos, y se veían todas juntas al final).
const IMAGE_DOWNLOADS_AT_ONCE = 4;
async function syncImages() {
  const ids = referencedImageIds();
  if (ids.size === 0) return;
  if (!SYNC.imageFiles) SYNC.imageFiles = await listDriveImages();
  const localKeys = new Set(await ImageStore.keys().catch(() => []));
  const activeIds = referencedImageIds([getActiveProject()]);
  const ordered = [...ids].sort((a, b) => Number(activeIds.has(b)) - Number(activeIds.has(a)));
  const toDownload = ordered.filter(id => !localKeys.has(id) && SYNC.imageFiles.has(id));
  let downloaded = 0;
  const worker = async () => {
    while (toDownload.length) {
      const id = toDownload.shift();
      try {
        const r = await driveFetch(`${DRIVE_API}/files/${SYNC.imageFiles.get(id)}?alt=media&supportsAllDrives=true`);
        await ImageStore.put(id, await r.blob());
        downloaded++;
        imageArrived(id);
      } catch (e) {
        console.warn('Imagen no descargada', id, e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_DOWNLOADS_AT_ONCE, toDownload.length) }, worker));
  for (const id of ordered) {
    if (!localKeys.has(id) || SYNC.imageFiles.has(id)) continue;
    const local = await ImageStore.get(id).catch(() => null);
    if (local) SYNC.imageFiles.set(id, await driveUpload(id, local));
  }
  // Las que no están ni aquí ni en Drive (aún no las sube el otro dispositivo) dejan de mostrar la carga
  bgImageLayer.querySelectorAll('.bg-image.is-loading').forEach(el => {
    const id = el.dataset.imageRef || el.dataset.imageId;
    if (!localKeys.has(id) && !SYNC.imageFiles.has(id)) { el.classList.remove('is-loading'); el.classList.add('is-missing'); }
  });
  // Las de las tareas (tarjetas) se redibujan una vez al final
  if (downloaded) renderBoard();
}

// Una imagen recién descargada: se pone donde ya se estaba esperando, sin redibujar todo
function imageArrived(id) {
  bgImageLayer.querySelectorAll(`.bg-image[data-image-ref="${id}"]`).forEach(el => loadBgImageInto(el, id));
  document.querySelectorAll(`img[data-board-img="${id}"], img[data-link-img="${id}"]`).forEach(img => img.removeAttribute('src'));
  hydrateBoardImages();
  hydrateLinkImages();
}

// ----- Eventos -----
googleSignInBtn.addEventListener('click', signInWithGoogle);
// La ventana de Google se abre solo cuando se toca "Reconectar con Google" (nunca sola):
// al tocar la foto con la sesión vencida se abre el menú de la cuenta con ese botón destacado
function sessionExpired() {
  return !SYNC.token || Date.now() > SYNC.tokenExp;
}

function renderReconnectState() {
  const expired = syncEnabled() && sessionExpired();
  const btn = document.getElementById('syncNowBtn');
  btn.textContent = expired ? '🔄 Reconectar con Google' : 'Sincronizar ahora';
  btn.classList.toggle('is-reconnect', expired);
  const note = document.getElementById('reconnectNote');
  if (note) note.hidden = !expired;
}

// Para las acciones que necesitan Google (cambiar de espacio, enviar, compartir…): en vez de abrir la
// ventana de Google por su cuenta, se avisa y se ofrece el botón Reconectar en el menú de la cuenta
function requestReconnect(reason) {
  renderReconnectState();
  const note = document.getElementById('reconnectNote');
  if (note && reason) note.textContent = reason;
  // Se abre después de que termine el toque que llevó hasta aquí (si no, ese mismo toque cuenta
  // como "clic fuera del menú" y lo cierra al instante)
  setTimeout(() => { accountMenu.hidden = false; }, 0);
  showToast(reason || 'La sesión de Google venció. Toca «Reconectar con Google» para seguir sincronizando.', 'info');
}

accountChip.addEventListener('click', (e) => {
  e.stopPropagation();
  renderReconnectState();
  accountMenu.hidden = !accountMenu.hidden;
});
document.addEventListener('click', (e) => {
  if (!accountMenu.hidden && !e.target.closest('#accountArea')) accountMenu.hidden = true;
});
document.getElementById('syncNowBtn').addEventListener('click', () => {
  accountMenu.hidden = true;
  if (sessionExpired()) { signInWithGoogle(); return; }
  syncNow();
});
document.getElementById('signOutBtn').addEventListener('click', () => {
  accountMenu.hidden = true;
  signOutGoogle();
});

// Traer cambios de otros dispositivos al volver a la app y cada cierto tiempo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Otra ventana pudo reconectar con Google mientras tanto
  if (syncEnabled() && restoreSyncToken()) syncNow();
  else renderSyncBanner();
});
window.addEventListener('online', () => { if (SYNC.token) syncNow(); });
// Con datos compartidos se revisan los cambios de los demás cada 15 segundos; si no, cada 45
let lastPoll = 0;
setInterval(() => {
  if (document.visibilityState !== 'visible' || !syncEnabled() || !restoreSyncToken()) return;
  if (Date.now() - lastPoll < (inShared() ? 15000 : 45000)) return;
  lastPoll = Date.now();
  syncNow();
}, 5000);

// ----- Versión de la app (abajo a la derecha) -----
// Al publicar cambios, subir APP_VERSION junto con CACHE_NAME de sw.js y los ?v= de index.html
const APP_VERSION = '109';
const APP_REPO = 'mindsparkapps/zenban';

// Se muestra abajo a la derecha (PC) y en el globo que aparece al tocar el logo (también en el celular)
async function renderAppVersion() {
  const boxes = ['appVersion', 'brandVersionText'].map(id => document.getElementById(id)).filter(Boolean);
  boxes.forEach(box => { box.textContent = `ZenBan v${APP_VERSION}`; });
  // El commit se pregunta a GitHub (último publicado en main) y se guarda unos minutos
  let commit = null;
  try { commit = JSON.parse(sessionStorage.getItem('zenban_commit') || 'null'); } catch (e) {}
  if (!commit || Date.now() - commit.at > 10 * 60 * 1000) {
    try {
      const r = await fetch(`https://api.github.com/repos/${APP_REPO}/commits/main`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const j = await r.json();
      commit = { sha: j.sha, url: j.html_url, at: Date.now() };
      try { sessionStorage.setItem('zenban_commit', JSON.stringify(commit)); } catch (e) {}
    } catch (e) { return; }
  }
  boxes.forEach(box => {
    const a = document.createElement('a');
    a.href = commit.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'Último cambio publicado en GitHub';
    a.textContent = commit.sha.slice(0, 7);
    box.append(' · ', a);
  });
}

const brandVersion = document.getElementById('brandVersion');
document.querySelector('.brand').addEventListener('click', (e) => {
  if (e.target.closest('#brandVersion')) return;
  brandVersion.hidden = !brandVersion.hidden;
  if (!brandVersion.hidden) renderDriveInfo();
});

// ----- Espacio de Google Drive (en el globo del logo, bajo "Recargar la app") -----
const driveInfoCache = { at: 0, data: null };

function formatBytes(n) {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1).replace('.', ',')} ${units[i]}`;
}

async function loadDriveInfo() {
  const about = await (await driveFetch(`${DRIVE_API}/about?fields=storageQuota`)).json();
  // Lo que ocupa ZenBan en este espacio (datos, imágenes y PDFs)
  let zenbanBytes = 0;
  let zenbanFiles = 0;
  let pageToken = '';
  do {
    const r = await driveFetch(`${DRIVE_API}/files?${spaceQuery('trashed=false')}&pageSize=1000&fields=nextPageToken,files(size)${pageToken ? `&pageToken=${pageToken}` : ''}`);
    const j = await r.json();
    (j.files || []).forEach(f => { zenbanBytes += Number(f.size || 0); zenbanFiles++; });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return { quota: about.storageQuota || {}, zenbanBytes, zenbanFiles };
}

async function renderDriveInfo() {
  const box = document.getElementById('driveInfo');
  if (!box) return;
  if (!syncEnabled()) { box.hidden = true; return; }
  box.hidden = false;
  if (sessionExpired()) {
    box.innerHTML = '<span class="drive-info-title">☁️ Google Drive</span><small>Reconecta con Google para ver el espacio.</small>';
    return;
  }
  if (!driveInfoCache.data || Date.now() - driveInfoCache.at > 2 * 60 * 1000) {
    box.innerHTML = '<span class="drive-info-title">☁️ Google Drive</span><small>Calculando…</small>';
    try {
      driveInfoCache.data = await loadDriveInfo();
      driveInfoCache.at = Date.now();
    } catch (e) {
      box.innerHTML = '<span class="drive-info-title">☁️ Google Drive</span><small>No se pudo leer el espacio.</small>';
      return;
    }
  }
  const { quota, zenbanBytes, zenbanFiles } = driveInfoCache.data;
  const used = Number(quota.usage || 0);
  const limit = Number(quota.limit || 0);
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const where = inShared() ? 'datos compartidos' : 'datos personales';
  box.innerHTML = `
    <span class="drive-info-title">☁️ Google Drive</span>
    ${limit ? `<span class="drive-info-bar"><span style="width:${pct}%" class="${pct >= 90 ? 'is-full' : pct >= 75 ? 'is-high' : ''}"></span></span>
      <small>${formatBytes(used)} de ${formatBytes(limit)} usados (${pct} %) · quedan ${formatBytes(Math.max(0, limit - used))}</small>`
      : `<small>${formatBytes(used)} usados (sin límite)</small>`}
    <small>ZenBan (${where}): ${formatBytes(zenbanBytes)} en ${zenbanFiles} archivo(s)</small>`;
}
document.addEventListener('click', (e) => {
  if (!brandVersion.hidden && !e.target.closest('.brand')) brandVersion.hidden = true;
});

// ----- Ventana de configuración -----
const settingsModal = document.getElementById('settingsModal');
const settingZoomMin = document.getElementById('settingZoomMin');

function openSettings() {
  brandVersion.hidden = true;
  const value = String(appSettings.zoomMin);
  // Si el valor guardado no está en la lista, se agrega para no perderlo
  if (![...settingZoomMin.options].some(o => o.value === value)) {
    settingZoomMin.add(new Option(`${Math.round(appSettings.zoomMin * 100)}%`, value));
  }
  settingZoomMin.value = value;
  document.getElementById('settingStarredPosition').value = starredPosition();
  if (typeof renderArchiveSetting === 'function') renderArchiveSetting();
  document.getElementById('settingImageSources').value = appSettings.imageSources ?? DEFAULT_IMAGE_SOURCES;
  document.getElementById('settingYtCheckSize').value = String(ytCheckScale());
  document.getElementById('settingYtCheckSizeValue').textContent = `${Math.round(ytCheckScale() * 100)}% de la miniatura`;
  document.getElementById('settingYtCheckColor').value = appSettings.ytCheckColor || YT_CHECK_DEFAULT.color;
  const backdropInput = document.getElementById('settingModalBackdrop');
  backdropInput.value = String(appSettings.modalBackdrop ?? 15);
  document.getElementById('settingModalBackdropValue').textContent = `${backdropInput.value}%`;
  settingToolsAutoHide.checked = !!appSettings.toolsAutoHide;
  settingToolsOpacity.value = String(appSettings.toolsHiddenOpacity);
  syncToolsOpacityField();
  settingsModal.style.display = 'flex';
}

function closeSettings() {
  settingsModal.style.display = 'none';
  applyToolsAutoHide(); // deshace la vista previa si se canceló
  applyModalBackdrop();
}

// ----- Diagnóstico del proyecto (Configuración): qué tiene y cuánto pesa, para revisar el rendimiento -----
async function projectDiagnostics() {
  const p = getActiveProject();
  const kb = (o) => Math.round(JSON.stringify(o || []).length / 1024);
  const strokes = p.drawings || [];
  const points = strokes.reduce((n, s) => n + (s.points || []).length, 0);
  const bg = p.bgImages || [];
  const taskImgs = (p.tasks || []).flatMap(t => t.images || []);
  let decoded = 0;
  let stored = 0;
  let missing = 0;
  const big = [];
  for (const img of [...bg, ...taskImgs]) {
    const blob = await ImageStore.get(img.src || img.id).catch(() => null);
    if (!blob) { missing++; continue; }
    stored += blob.size;
    try {
      const b = await createImageBitmap(blob);
      decoded += b.width * b.height * 4;
      if (Math.max(b.width, b.height) >= 1500) big.push(`${b.width}x${b.height}`);
      b.close();
    } catch (e) {}
  }
  const mb = (n) => (n / 1048576).toFixed(1);
  const lines = [
    `ZenBan v${APP_VERSION} · ${IS_TOUCH_SCREEN ? 'pantalla táctil' : 'mouse'} · pantalla ${screen.width}x${screen.height} @${window.devicePixelRatio}x` +
      (navigator.deviceMemory ? ` · memoria ~${navigator.deviceMemory} GB` : ''),
    `Proyecto: ${p.name}`,
    `Tableros ${(p.boards || []).length} · columnas ${(p.columns || []).length} · tareas ${(p.tasks || []).length}`,
    `Imágenes: ${bg.length} en el lienzo, ${taskImgs.length} en tareas${missing ? ` (${missing} sin descargar)` : ''}`,
    `  guardadas ${mb(stored)} MB · descomprimidas ${mb(decoded)} MB${big.length ? ` · grandes: ${big.length}` : ''}`,
    `Dibujos: ${strokes.length} trazos (${strokes.filter(s => s.arrow).length} flechas, ${strokes.filter(s => s.shape).length} formas), ${points} puntos · textos ${(p.texts || []).length} (${(p.texts || []).filter(t => t.sticky).length} notas) · PDFs ${(p.texts || []).reduce((n, t) => n + fileIdsInText(t.text).length, 0)}`,
    `Datos del proyecto: ${kb(p)} KB (dibujos ${kb(strokes)} KB, tareas ${kb(p.tasks)} KB)`,
    `Todos los proyectos: ${kb(projects)} KB · elementos en pantalla: ${document.querySelectorAll('#zoomCanvas *').length}`
  ];
  return lines.join('\n');
}

document.getElementById('settingsDiag').addEventListener('toggle', async (e) => {
  if (!e.target.open) return;
  const out = document.getElementById('diagOutput');
  out.textContent = 'Calculando…';
  try { out.textContent = await projectDiagnostics(); } catch (err) { out.textContent = 'No se pudo calcular: ' + err.message; }
});
document.getElementById('diagCopyBtn').addEventListener('click', async () => {
  const text = document.getElementById('diagOutput').textContent;
  try { await navigator.clipboard.writeText(text); showToast('Diagnóstico copiado', 'success'); }
  catch (e) { showToast('No se pudo copiar; selecciona el texto y cópialo', 'info'); }
});

// ----- Esconder las herramientas (barra lateral y barra de zoom) cuando no se usan -----
const settingToolsAutoHide = document.getElementById('settingToolsAutoHide');
const settingToolsOpacity = document.getElementById('settingToolsOpacity');
const settingToolsOpacityValue = document.getElementById('settingToolsOpacityValue');
// En el celular la barra de zoom (con "ajustar a pantalla") queda siempre visible: tenue sobre el lienzo
// parecía que no estaba, y tocarla para que apareciera también apretaba el botón de abajo
const autoHideBars = matchMedia('(pointer: coarse)').matches ? [toolbox] : [toolbox, document.getElementById('zoomHud')];
const AUTOHIDE_DELAY_MS = 700;      // al sacar el mouse
const AUTOHIDE_TOUCH_MS = 3500;     // después de tocarlas en el celular
let autoHidePreview = null;         // { on, opacity } mientras se mueve el control en Configuración

function autoHideState() {
  return autoHidePreview || { on: !!appSettings.toolsAutoHide, opacity: Number(appSettings.toolsHiddenOpacity) };
}

function applyToolsAutoHide() {
  autoHidePreview = null;
  refreshAutoHide();
}

function refreshAutoHide() {
  const { on, opacity } = autoHideState();
  document.documentElement.style.setProperty('--tools-hidden-opacity', String(Math.max(0, Math.min(100, opacity)) / 100));
  autoHideBars.forEach(bar => {
    if (!bar) return;
    bar.classList.toggle('autohide-on', on);
    if (!on) bar.classList.remove('is-autohidden');
    else if (!bar.matches(':hover') && !bar.contains(document.activeElement)) bar.classList.add('is-autohidden');
  });
}

function syncToolsOpacityField() {
  settingToolsOpacityValue.textContent = `${settingToolsOpacity.value}%`;
  settingToolsOpacity.disabled = !settingToolsAutoHide.checked;
}

autoHideBars.forEach(bar => {
  if (!bar) return;
  let timer = null;
  const show = () => { clearTimeout(timer); bar.classList.remove('is-autohidden'); };
  const hideLater = (ms) => {
    clearTimeout(timer);
    if (!autoHideState().on) return;
    timer = setTimeout(() => {
      if (bar.matches(':hover') || bar.contains(document.activeElement)) return;
      bar.classList.add('is-autohidden');
    }, ms);
  };
  bar.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') show(); });
  bar.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hideLater(AUTOHIDE_DELAY_MS); });
  // Con el dedo no hay "pasar por encima": al tocarla se muestra y se vuelve a esconder sola
  bar.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    show();
    hideLater(AUTOHIDE_TOUCH_MS);
  });
  bar.addEventListener('focusin', show);
  bar.addEventListener('focusout', () => hideLater(AUTOHIDE_DELAY_MS));
});

// Vista previa mientras se ajusta en Configuración
settingToolsAutoHide.addEventListener('change', () => {
  syncToolsOpacityField();
  autoHidePreview = { on: settingToolsAutoHide.checked, opacity: Number(settingToolsOpacity.value) };
  refreshAutoHide();
});
settingToolsOpacity.addEventListener('input', () => {
  syncToolsOpacityField();
  autoHidePreview = { on: settingToolsAutoHide.checked, opacity: Number(settingToolsOpacity.value) };
  refreshAutoHide();
});
// El desenfoque se ve al mover el control (se guarda con Guardar; Cancelar lo devuelve)
document.getElementById('settingModalBackdrop').addEventListener('input', (e) => {
  document.getElementById('settingModalBackdropValue').textContent = `${e.target.value}%`;
  const saved = appSettings.modalBackdrop;
  appSettings.modalBackdrop = Number(e.target.value);
  applyModalBackdrop();
  appSettings.modalBackdrop = saved;
});

refreshAutoHide();

document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
// Vista previa de las casillas mientras se ajustan (Cancelar las devuelve como estaban)
['settingYtCheckSize', 'settingYtCheckColor'].forEach(id => document.getElementById(id).addEventListener('input', () => {
  const scale = Number(document.getElementById('settingYtCheckSize').value);
  document.getElementById('settingYtCheckSizeValue').textContent = `${Math.round(scale * 100)}% de la miniatura`;
  applyYtCheckStyle(scale, document.getElementById('settingYtCheckColor').value);
}));
['closeSettingsBtn', 'cancelSettingsBtn'].forEach(id => document.getElementById(id).addEventListener('click', () => applyYtCheckStyle()));
document.getElementById('resetImageSourcesBtn').addEventListener('click', () => {
  document.getElementById('settingImageSources').value = DEFAULT_IMAGE_SOURCES;
});
// Recargar: útil en la app instalada del celular, que no tiene botón de recargar del navegador.
// Los datos ya están guardados en el dispositivo, así que no se pierde nada.
document.getElementById('reloadAppBtn').addEventListener('click', async () => {
  brandVersion.hidden = true;
  if (editingTextId) finishTextEdit();
  // Antes de recargar se termina de guardar: lo pendiente de los plugins y la subida a Drive
  await saveEverythingNow('Guardando antes de recargar…');
  location.reload();
});

// Guarda todo lo pendiente y espera a que termine: estado de los plugins (en el dispositivo) y, si hay
// sesión de Google, la subida a Drive (hasta 15 s; si no hay conexión, lo de este dispositivo ya quedó guardado)
async function saveEverythingNow(label) {
  if (typeof flushPluginSave === 'function') flushPluginSave();
  // Da un momento a que lleguen los últimos cambios de los plugins abiertos
  await new Promise(r => setTimeout(r, 120));
  if (typeof flushPluginSave === 'function') flushPluginSave();
  if (!syncEnabled() || !(SYNC.token || restoreSyncToken()) || !navigator.onLine) return;
  if (!isDirty() && !SYNC.busy) return;
  showBusy(label || 'Guardando…');
  try {
    if (SYNC.busy) await waitSyncIdle(15000);
    if (isDirty()) { await syncNow(); await waitSyncIdle(15000); }
  } catch (e) {
    console.warn('Guardar antes de salir', e);
  } finally {
    hideBusy();
  }
}

// Cerrar o recargar con cambios que todavía no llegan a Drive: el navegador pregunta antes de salir,
// y mientras tanto se sube lo pendiente (al elegir "quedarse", termina de guardarse)
window.addEventListener('beforeunload', (e) => {
  if (typeof flushPluginSave === 'function') flushPluginSave();
  const pendingUpload = syncEnabled() && SYNC.token && Date.now() < SYNC.tokenExp && navigator.onLine && (isDirty() || SYNC.busy);
  if (!pendingUpload) return;
  if (!SYNC.busy) syncNow();
  e.preventDefault();
  e.returnValue = 'Se están guardando tus cambios en Drive. Espera unos segundos antes de salir.';
  return e.returnValue;
});
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettings);
document.getElementById('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  appSettings.zoomMin = Number(settingZoomMin.value) || DEFAULT_SETTINGS.zoomMin;
  appSettings.toolsAutoHide = settingToolsAutoHide.checked;
  appSettings.toolsHiddenOpacity = Number(settingToolsOpacity.value);
  saveData(SETTINGS_KEY, appSettings);
  localStorage.setItem(STARRED_POSITION_KEY, document.getElementById('settingStarredPosition').value);
  appSettings.modalBackdrop = Number(document.getElementById('settingModalBackdrop').value);
  appSettings.imageSources = document.getElementById('settingImageSources').value.trim();
  appSettings.ytCheckScale = Number(document.getElementById('settingYtCheckSize').value);
  appSettings.ytCheckColor = document.getElementById('settingYtCheckColor').value;
  applyYtCheckStyle();
  saveData(SETTINGS_KEY, appSettings);
  applyModalBackdrop();
  renderProjectSwitcher();
  ZOOM_CONFIG.MIN = appSettings.zoomMin;
  // Si ahora la vista está más alejada que el nuevo mínimo, se acerca hasta el mínimo
  if (zoom < ZOOM_CONFIG.MIN) zoomAtCenter(ZOOM_CONFIG.MIN / zoom);
  closeSettings();
  showToast('Configuración guardada', 'success');
});

// ----- Ventana de configuración (ID de cliente) -----
const googleSetupModal = document.getElementById('googleSetupModal');

function openGoogleSetup() {
  document.getElementById('googleClientIdInput').value = googleClientId();
  document.getElementById('setupOrigin').textContent = location.origin;
  googleSetupModal.style.display = 'flex';
}

function closeGoogleSetup() {
  googleSetupModal.style.display = 'none';
}

document.getElementById('closeGoogleSetupBtn').addEventListener('click', closeGoogleSetup);
document.getElementById('cancelGoogleSetupBtn').addEventListener('click', closeGoogleSetup);
document.getElementById('googleSetupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('googleClientIdInput').value.trim();
  if (!id) return;
  localStorage.setItem(SYNC_KEYS.CLIENT_ID, id);
  SYNC.tokenClient = null;
  closeGoogleSetup();
  signInWithGoogle();
});

// Si la sesión de Google guardada sigue vigente, se sincroniza apenas se abre la app
const hadSavedToken = syncEnabled() && restoreSyncToken();
renderAccount();
renderAppVersion();
const redirectedToken = consumeRedirectToken();
if (redirectedToken) onTokenResponse(redirectedToken);
else if (hadSavedToken) setTimeout(syncNow, 300);

// =============================================================================
// 8. Search, Filtering & Theme Switcher
// =============================================================================

const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const priorityFilterSelect = document.getElementById('priorityFilter');
const themeToggleBtn = document.getElementById('themeToggleBtn');

function contextBoard() {
  const id = contextBoardId();
  return boards.find(b => b.id === id) || null;
}

// Refleja en los controles los filtros del tablero en foco
let lastSyncedBoardId = null;
function syncBoardFilterControls(board) {
  if (!board) return;
  const f = getBoardFilters(board);
  // Al cambiar de tablero siempre se cargan sus filtros; si es el mismo, no se pisa lo que se está escribiendo
  if (board.id !== lastSyncedBoardId || document.activeElement !== searchInput) searchInput.value = f.q || '';
  lastSyncedBoardId = board.id;
  clearSearchBtn.style.display = f.q ? 'block' : 'none';
  priorityFilterSelect.value = f.priority;
  priorityFilterSelect.classList.toggle('is-active', f.priority !== 'all');
  refreshTagFilterOptions();
}

searchInput.addEventListener('input', (e) => {
  const board = contextBoard();
  if (!board) return;
  getBoardFilters(board).q = e.target.value.toLowerCase().trim();
  clearSearchBtn.style.display = e.target.value ? 'block' : 'none';
  persist();
  renderBoard();
});

clearSearchBtn.addEventListener('click', () => {
  const board = contextBoard();
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  if (!board) return;
  getBoardFilters(board).q = '';
  persist();
  renderBoard();
});

const tagFilterSelect = document.getElementById('tagFilter');

// Rellena el filtro con las etiquetas existentes (mantiene la selección del tablero)
function refreshTagFilterOptions() {
  if (!tagFilterSelect) return;
  const board = contextBoard();
  const f = board ? getBoardFilters(board) : { tag: 'all' };
  if (f.tag !== 'all' && !findTag(f.tag)) f.tag = 'all';
  const sorted = [...tagLibrary].sort((a, b) => a.name.localeCompare(b.name));
  tagFilterSelect.innerHTML = '<option value="all">Todas las etiquetas</option>' +
    sorted.map(t => `<option value="${escapeHtml(t.name)}">🏷️ ${escapeHtml(t.name)}</option>`).join('');
  tagFilterSelect.value = f.tag;
  tagFilterSelect.classList.toggle('is-active', f.tag !== 'all');
}

tagFilterSelect.addEventListener('change', (e) => {
  const board = contextBoard();
  if (!board) return;
  getBoardFilters(board).tag = e.target.value;
  persist();
  renderBoard();
});

priorityFilterSelect.addEventListener('change', (e) => {
  const board = contextBoard();
  if (!board) return;
  getBoardFilters(board).priority = e.target.value;
  persist();
  renderBoard();
});

// Theme Toggle
let currentTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
document.body.className = currentTheme === 'light' ? 'theme-light' : 'theme-dark';

themeToggleBtn.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.className = currentTheme === 'light' ? 'theme-light' : 'theme-dark';
  localStorage.setItem(STORAGE_KEYS.THEME, currentTheme);
  showToast(`Tema ${currentTheme === 'light' ? 'Claro' : 'Oscuro'} activado`, 'info');
});

// =============================================================================
// 9. Toast Notification System & Utilities
// =============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: '✅',
    info: '💡',
    warning: '⚠️'
  };

  toast.innerHTML = `<span>${icons[type] || '✨'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 2600);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapa el texto y convierte las direcciones web (https://… o www.…) en links que abren en otra pestaña.
// names: { dirección: texto a mostrar } (se configura en "Links" de cada texto o tarea).
const LINK_RE = /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.|zenban:\/\/|zenfile:\/\/)[^\s)<]+)\)|\b((?:https?:\/\/|www\.|zenban:\/\/|zenfile:\/\/)[^\s<]+)/gi;
const LINK_TRAIL_RE = /(?:[.,;:!?)\]]|&#39;|&quot;)+$/;
function linkHref(url) {
  if (isInternalLink(url) || isFileLink(url)) return '#';
  return /^www\./i.test(url) ? `https://${url}` : url;
}

// ----- Widget de Windows 11: resumen de pendientes para el panel de Widgets -----
// Se guarda en la caché "zbwidget" (la lee el service worker) y se le avisa que actualice el widget.
const WIDGET_PRIORITY_ICON = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢', reminder: '🔔', note: '📝' };
let widgetTimer = null;

function widgetSummary() {
  const today = getRelativeDate(0);
  const tomorrow = getRelativeDate(1);
  const items = [];
  projects.forEach(p => {
    const list = p.id === activeProjectId ? tasks : (p.tasks || []);
    list.filter(t => !t.completed).forEach(t => items.push({ t, p }));
  });
  const rank = (t) => (PRIORITY_RANK[effectivePriority(t)] ?? 2);
  items.sort((a, b) => {
    const ao = a.t.dueDate && a.t.dueDate < today ? 0 : 1;
    const bo = b.t.dueDate && b.t.dueDate < today ? 0 : 1;
    return ao - bo || rank(a.t) - rank(b.t) || String(a.t.dueDate || '9999').localeCompare(String(b.t.dueDate || '9999'));
  });
  const dueText = (d) => !d ? '' : d < today ? 'vencida' : d === today ? 'vence hoy' : d === tomorrow ? 'vence mañana' : `vence el ${d.split('-').reverse().join('-')}`;
  const overdue = items.filter(x => x.t.dueDate && x.t.dueDate < today).length;
  const dueToday = items.filter(x => x.t.dueDate === today).length;
  return {
    summary: `${items.length} pendiente(s)${overdue ? ` · ${overdue} vencida(s)` : ''}${dueToday ? ` · ${dueToday} para hoy` : ''}`,
    tasks: items.slice(0, 6).map(({ t, p }) => ({
      icon: WIDGET_PRIORITY_ICON[effectivePriority(t)] || '•',
      title: t.title,
      meta: [p.name, dueText(t.dueDate), t.repeat ? `🔁 ${REPEAT_LABELS[t.repeat]}` : ''].filter(Boolean).join(' · ')
    })),
    empty: 'Sin pendientes. ¡Todo listo! 🎉',
    updatedAt: Date.now()
  };
}

function scheduleWidgetUpdate() {
  if (!('caches' in window) || !navigator.serviceWorker) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(async () => {
    try {
      const cache = await caches.open('zbwidget');
      const key = new URL('widgets/live-data.json', location.href.replace(/[^/]*$/, '')).href;
      await cache.put(key, new Response(JSON.stringify(widgetSummary()), { headers: { 'Content-Type': 'application/json' } }));
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) reg.active.postMessage({ type: 'widget-refresh' });
    } catch (e) {}
  }, 3000);
}

// ----- Google Docs, Hojas de cálculo y Presentaciones -----
// Se crean en tu Drive (en la carpeta compartida si estás en datos compartidos, para que los demás
// también los abran) y quedan en el lienzo como un link con su ícono; doble clic los abre.
const GOOGLE_DOC_KINDS = {
  doc: { label: 'Google Doc', icon: '📝', mime: 'application/vnd.google-apps.document', path: 'document' },
  sheet: { label: 'Hoja de cálculo', icon: '📊', mime: 'application/vnd.google-apps.spreadsheet', path: 'spreadsheets' },
  slides: { label: 'Presentación', icon: '📽️', mime: 'application/vnd.google-apps.presentation', path: 'presentation' }
};

function googleDocKind(url) {
  const m = String(url || '').match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\//i);
  if (!m) return null;
  return Object.keys(GOOGLE_DOC_KINDS).find(k => GOOGLE_DOC_KINDS[k].path === m[1].toLowerCase()) || null;
}

async function createGoogleDoc(kind, point = null) {
  const k = GOOGLE_DOC_KINDS[kind];
  if (!k) return;
  if (!syncEnabled() || sessionExpired()) {
    requestReconnect(`Para crear un ${k.label}, conecta tu cuenta de Google.`);
    return;
  }
  const project = getActiveProject();
  const name = `${k.label} · ${project.name}`;
  showBusy(`Creando ${k.label}…`);
  try {
    const body = { name, mimeType: k.mime };
    if (inShared()) body.parents = [currentSpace().folderId];
    const r = await driveFetch(`${DRIVE_API}/files?fields=id,webViewLink&supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const f = await r.json();
    const url = f.webViewLink || `https://docs.google.com/${k.path}/d/${f.id}/edit`;
    addText(url, point);
    showToast(`${k.label} creado: «${name}». Doble clic para abrirlo; cámbiale el ícono en Links.`, 'success');
  } catch (e) {
    if (e.message === 'auth') requestReconnect(`La sesión de Google venció. Reconecta para crear el ${k.label}.`);
    else showToast(`No se pudo crear el ${k.label}. Revisa tu conexión e inténtalo de nuevo.`, 'warning');
  } finally {
    hideBusy();
  }
}

// ----- Archivos (PDF) guardados en ZenBan: zenfile://<id>/<nombre> -----
// Se guardan como las imágenes (en el dispositivo y en Drive) y se muestran como un link con su
// ícono; su texto o imagen se cambia en "Links", igual que cualquier link. Doble clic lo abre.
function isFileLink(url) {
  return /^zenfile:\/\//i.test(String(url || ''));
}

function parseFileLink(url) {
  const m = String(url).match(/^zenfile:\/\/([\w-]+)(?:\/(.*))?$/i);
  if (!m) return null;
  let name = 'archivo.pdf';
  try { if (m[2]) name = decodeURIComponent(m[2]); } catch (e) {}
  return { id: m[1], name };
}

function fileIdsInText(str) {
  const ids = [];
  for (const m of String(str || '').matchAll(/zenfile:\/\/([\w-]+)/gi)) ids.push(m[1]);
  return ids;
}

async function addPdfFile(file, point = null) {
  if (!file || !(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    showToast('Por ahora solo se pueden agregar archivos PDF', 'info');
    return;
  }
  const id = generateId('img'); // mismo prefijo que las imágenes: así se sincroniza con Drive
  await ImageStore.put(id, file);
  const t = addText(`zenfile://${id}/${encodeURIComponent(file.name)}`, point);
  showToast(`PDF «${file.name}» agregado. Doble clic para abrirlo; cambia su ícono en Links.`, 'success');
  return t;
}

async function openFileLink(url) {
  const ref = parseFileLink(url);
  if (!ref) return;
  let blob = await ImageStore.get(ref.id).catch(() => null);
  if (!blob && SYNC.token) {
    showToast('Descargando el archivo…', 'info');
    try { SYNC.imageFiles = null; await syncImages(); } catch (e) {}
    blob = await ImageStore.get(ref.id).catch(() => null);
  }
  if (!blob) {
    showToast('Ese archivo todavía no está en este dispositivo. Reconecta con Google para descargarlo.', 'warning');
    return;
  }
  const typed = blob.type ? blob : new Blob([blob], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(typed);
  const win = window.open(objectUrl, '_blank', 'noopener');
  if (!win) {
    // Si el navegador no deja abrir otra pestaña, se descarga
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = ref.name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

const pdfInput = document.createElement('input');
pdfInput.type = 'file';
pdfInput.accept = 'application/pdf,.pdf';
pdfInput.multiple = true;
pdfInput.hidden = true;
document.body.appendChild(pdfInput);
let pdfInputPoint = null;
pdfInput.addEventListener('change', async () => {
  let point = pdfInputPoint;
  for (const f of Array.from(pdfInput.files || [])) {
    await addPdfFile(f, point);
    if (point) point = { x: point.x + 30, y: point.y + 60 };
  }
  pdfInput.value = '';
});

function pickPdf(point = null) {
  pdfInputPoint = point;
  pdfInput.click();
}

// ----- Links internos: saltan a otro proyecto (y a un tablero, texto, imagen o tarea de él) -----
// Forma: zenban://p/<proyecto>[/b/<tablero> | /t/<texto> | /i/<imagen> | /k/<tarea>]
function isInternalLink(url) {
  return /^zenban:\/\//i.test(String(url || ''));
}

function parseInternalLink(url) {
  const m = String(url).match(/^zenban:\/\/p\/([\w-]+)(?:\/([btik])\/([\w-]+))?/i);
  return m ? { projectId: m[1], kind: m[2] ? m[2].toLowerCase() : null, id: m[3] || null } : null;
}

function internalLinkUrl(projectId, kind = null, id = null) {
  return `zenban://p/${projectId}${kind && id ? `/${kind}/${id}` : ''}`;
}

// Proyecto (de este espacio o de otro conocido) por su id
function findAnyProject(projectId) {
  const local = projects.find(p => p.id === projectId);
  if (local) return { project: local, space: null };
  if (typeof knownOtherSpaces === 'function') {
    for (const entry of knownOtherSpaces()) {
      const p = (entry.projects || []).find(x => x.id === projectId);
      if (p) return { project: p, space: entry.space };
    }
  }
  return null;
}

// Texto que muestra un link interno sin nombre propio: "↪ Proyecto › Tablero"
function internalLinkLabel(url) {
  const ref = parseInternalLink(url);
  const found = ref && findAnyProject(ref.projectId);
  if (!found) return '↪ Proyecto';
  let label = `↪ ${found.project.name}`;
  if (ref.kind === 'b') {
    const b = (found.project.boards || []).find(x => x.id === ref.id);
    if (b) label += ` › ${b.title}`;
  } else if (ref.kind === 'k') {
    const t = (found.project.tasks || []).find(x => x.id === ref.id);
    if (t) label += ` › ${t.title}`;
  }
  return label;
}

async function openInternalLink(url) {
  const ref = parseInternalLink(url);
  const found = ref && findAnyProject(ref.projectId);
  if (!found) {
    showToast('No encontré ese proyecto (puede que se haya borrado o esté en otro espacio)', 'warning');
    return;
  }
  if (found.space) {
    // Está en otro espacio (personal o compartido): se cambia de espacio y se abre
    if (typeof switchToSpace !== 'function' || !(await switchToSpace(found.space, ref.projectId))) return;
  } else if (ref.projectId !== activeProjectId) {
    switchProject(ref.projectId);
  }
  setTimeout(() => focusInternalTarget(ref), 60);
}

function focusInternalTarget(ref) {
  if (ref.kind === 'b') {
    const b = boards.find(x => x.id === ref.id);
    const el = b && getBoardEl(b.id);
    if (b && el) { fitRectToScreen(b.x, b.y, el.offsetWidth * boardScale(b), el.offsetHeight * boardScale(b)); setSelection([`board:${b.id}`]); return; }
  } else if (ref.kind === 't') {
    const t = getTexts().find(x => x.id === ref.id);
    const el = t && getTextEl(t.id);
    if (t && el) { fitRectToScreen(t.x, t.y, el.offsetWidth, el.offsetHeight); setSelection([`text:${t.id}`]); return; }
  } else if (ref.kind === 'i') {
    const i = getBgImages().find(x => x.id === ref.id);
    if (i) { fitRectToScreen(i.x, i.y, i.w, i.h); setSelection([`img:${i.id}`]); return; }
  } else if (ref.kind === 'k') {
    const task = tasks.find(x => x.id === ref.id);
    const col = task && columns.find(c => c.id === task.columnId);
    const b = col && boards.find(x => x.id === col.boardId);
    const el = b && getBoardEl(b.id);
    if (b && el) fitRectToScreen(b.x, b.y, el.offsetWidth * boardScale(b), el.offsetHeight * boardScale(b));
    const card = task && kanbanBoard.querySelector(`.kanban-card[data-task-id="${task.id}"]`);
    if (card) {
      card.scrollIntoView({ block: 'nearest' });
      if (typeof highlightDroppedCard === 'function') highlightDroppedCard(task.id);
    }
    if (task) return;
  }
  fitBoardToScreen();
}

// ----- Biblioteca de imágenes: todas las imágenes de tus espacios (personal y compartidos);
//       elegir una inserta una copia donde se abrió el menú (o al centro de la vista) -----
function imagesOfProjects(list, spaceLabel, space) {
  const out = [];
  const add = (ref, p, where, name = '', saved = false) => out.push({ ref, project: p, where, spaceLabel, space, name, saved });
  list.forEach(p => {
    (p.bgImages || []).forEach(i => add(bgImageRef(i), p, 'Lienzo', i.name || ''));
    // Imágenes renombradas: siguen en la Biblioteca con su nombre aunque ya no se usen en ningún lugar
    (Array.isArray(p.imageNames) ? p.imageNames : []).forEach(e => { if (e && e.id && e.name) add(e.id, p, 'Biblioteca', e.name, true); });
    (p.texts || []).forEach(t => { if (t.web && t.web.image) add(t.web.image, p, `Ventana: ${t.web.title || t.text || ''}`); });
    (p.tasks || []).forEach(t => (t.images || []).forEach(i => add(i.id, p, `Tarea: ${t.title}`)));
    (p.boards || []).forEach(b => { if (b.image) add(b.image, p, `Tablero: ${b.title}`); });
    (p.frames || []).forEach(f => { if (f.image) add(f.image, p, `Frame${f.title ? `: ${f.title}` : ''}`); });
    [...(p.texts || []), ...(p.tasks || [])].forEach(o => Object.values(o.linkNames || {}).forEach(v => {
      if (v && typeof v === 'object' && v.image) add(v.image, p, o.title ? `Link en: ${o.title}` : 'Link en un texto');
    }));
  });
  return out;
}

function libraryItems() {
  const here = typeof xferHere === 'function' ? xferHere() : { mode: 'personal' };
  const hereLabel = typeof spaceTitle === 'function' ? spaceTitle(here) : 'Este espacio';
  let items = imagesOfProjects(projects, hereLabel, null);
  // Otros espacios: solo si ya se leyeron de Drive (traen sus imágenes)
  if (typeof OtherSpaces !== 'undefined') {
    OtherSpaces.entries.forEach(e => {
      if (!e.error) items = items.concat(imagesOfProjects(e.projects || [], spaceTitle(e.space), e.space));
    });
  }
  // La misma imagen usada en varios lugares se muestra una vez. Manda el nombre puesto a mano; si no, el
  // que tenga en algún lugar del lienzo
  const byRef = new Map();
  items.forEach(it => {
    const prev = byRef.get(it.ref);
    if (!prev) byRef.set(it.ref, it);
    else if (it.saved || (!prev.name && it.name)) prev.name = it.name;
  });
  return [...byRef.values()];
}

// ----- Nombres de las imágenes ("Imagen 1", "Imagen 2"…; se cambian en la barra de Imagen) -----
// Un nombre puesto a mano se guarda aparte, por archivo, en project.imageNames = [{ id: archivo, name }]:
// queda aunque la imagen ya no esté en el lienzo (pasó a una tarea, se borró…) y la imagen sigue en la
// Biblioteca. Es una lista con ids, así que se combina bien entre dispositivos.
function imageNameEntries(list = projects) {
  return list.flatMap(p => Array.isArray(p.imageNames) ? p.imageNames : []).filter(e => e && e.id && e.name);
}

function setSavedImageName(ref, name) {
  if (!ref) return;
  // Se quita de todos los proyectos y, si tiene nombre, queda en el abierto
  projects.forEach(p => { if (Array.isArray(p.imageNames)) p.imageNames = p.imageNames.filter(x => x && x.id !== ref); });
  if (!name) return;
  const p = getActiveProject();
  if (!Array.isArray(p.imageNames)) p.imageNames = [];
  p.imageNames.push({ id: ref, name });
}

function imageNumberFrom(name) {
  const m = String(name || '').match(/^Imagen (\d+)$/);
  return m ? Number(m[1]) : 0;
}

function nextImageName(list = projects) {
  let max = 0;
  list.forEach(p => (p.bgImages || []).forEach(i => { max = Math.max(max, imageNumberFrom(i.name)); }));
  imageNameEntries(list).forEach(e => { max = Math.max(max, imageNumberFrom(e.name)); });
  return `Imagen ${max + 1}`;
}

// Las imágenes del lienzo que todavía no tienen nombre reciben "Imagen N" (la misma imagen usada en varios
// lugares comparte el número); las que tienen un nombre guardado a mano usan ese
function ensureImageNames() {
  let max = 0;
  const byRef = new Map();
  imageNameEntries().forEach(e => {
    max = Math.max(max, imageNumberFrom(e.name));
    if (!byRef.has(e.id)) byRef.set(e.id, e.name);
  });
  projects.forEach(p => (p.bgImages || []).forEach(i => {
    max = Math.max(max, imageNumberFrom(i.name));
    if (i.name && !byRef.has(bgImageRef(i))) byRef.set(bgImageRef(i), i.name);
  }));
  let changed = false;
  projects.forEach(p => (p.bgImages || []).forEach(i => {
    const ref = bgImageRef(i);
    if (i.name && byRef.get(ref) === i.name) return;
    if (!byRef.has(ref)) byRef.set(ref, i.name || `Imagen ${++max}`);
    i.name = byRef.get(ref);
    changed = true;
  }));
  if (changed) persist();
}

// Imagen guardada: de este dispositivo o, si no está, de la carpeta de Drive de su espacio
async function libraryBlob(item) {
  if (isRemoteImage(item.ref)) {
    const r = await fetch(item.ref);
    if (!r.ok) throw new Error('imagen');
    return r.blob();
  }
  const local = await ImageStore.get(item.ref).catch(() => null);
  if (local) return local;
  if (!item.space) return xferImageBlob(item.ref);
  const r = await driveFetch(`${DRIVE_API}/files?${xferQuery(item.space, `name='${item.ref}'`)}&fields=files(id)`);
  const f = ((await r.json()).files || [])[0];
  if (!f) return null;
  const blob = await (await driveFetch(`${DRIVE_API}/files/${f.id}?alt=media&supportsAllDrives=true`)).blob();
  ImageStore.put(item.ref, blob).catch(() => {}); // queda guardada para la próxima vez
  return blob;
}

const libraryThumbUrls = new Map();
async function libraryThumb(img, item) {
  if (isRemoteImage(item.ref)) { img.src = item.ref; return; }
  const cached = cachedImageVariant(item.ref, 240);
  if (cached) { img.src = cached; return; }
  const local = await ImageStore.get(item.ref).catch(() => null);
  if (local) { const url = await getImageVariantUrl(item.ref, 240); if (url) img.src = url; return; }
  if (libraryThumbUrls.has(item.ref)) { img.src = libraryThumbUrls.get(item.ref); return; }
  try {
    const blob = await libraryBlob(item);
    if (!blob) { img.closest('.image-finder-item').classList.add('is-missing'); return; }
    const url = URL.createObjectURL(blob);
    libraryThumbUrls.set(item.ref, url);
    img.src = url;
  } catch (e) {
    img.closest('.image-finder-item').classList.add('is-missing');
  }
}

// Fuentes externas de imágenes: una por línea, "Nombre | URL". {q} se reemplaza por lo que se busca.
const DEFAULT_IMAGE_SOURCES = [
  'SVG Repo | https://www.svgrepo.com/vectors/{q}/',
  'Flaticon | https://www.flaticon.es/buscar?word={q}',
  'Unsplash | https://unsplash.com/s/photos/{q}',
  'Pexels | https://www.pexels.com/es-es/buscar/{q}/',
  'Google Imágenes | https://www.google.com/search?tbm=isch&q={q}'
].join('\n');

function imageSources(text = appSettings.imageSources ?? DEFAULT_IMAGE_SOURCES) {
  return String(text).split('\n').map(line => {
    const i = line.indexOf('|');
    const name = (i >= 0 ? line.slice(0, i) : '').trim();
    const url = (i >= 0 ? line.slice(i + 1) : line).trim();
    if (!/^https?:\/\//i.test(url)) return null;
    return { name: name || url.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0], url };
  }).filter(Boolean);
}

// Sin texto que buscar se abre la página principal del sitio
function openImageSource(src, q) {
  if (!src) return;
  let url = src.url;
  if (url.includes('{q}')) url = q ? url.split('{q}').join(encodeURIComponent(q)) : new URL(url.split('{q}').join('x')).origin;
  window.open(url, '_blank', 'noopener');
}

// Huella del contenido de cada imagen guardada en este dispositivo (tipo, tamaño y SHA-256): dos archivos
// con la misma huella son la misma imagen
const imageFingerprints = new Map(); // ref -> huella (o null si no se pudo leer)
async function imageFingerprint(item) {
  const ref = item.ref;
  if (imageFingerprints.has(ref)) return imageFingerprints.get(ref);
  let fp = null;
  if (!isRemoteImage(ref)) {
    // De este dispositivo o, si es de otro espacio, de su carpeta de Drive (queda guardada aquí)
    const blob = await ImageStore.get(ref).catch(() => null) || await libraryBlob(item).catch(() => null);
    if (blob) {
      try {
        const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        fp = `${blob.type}:${blob.size}:${Array.from(new Uint8Array(hash).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('')}`;
      } catch (e) {}
    }
  }
  imageFingerprints.set(ref, fp);
  return fp;
}

async function dedupeLibraryByContent(items) {
  const out = [];
  const byFp = new Map();
  for (const it of items) {
    const fp = await imageFingerprint(it);
    if (fp && byFp.has(fp)) {
      const kept = byFp.get(fp);
      if (!kept.name && it.name) kept.name = it.name;
      continue;
    }
    if (fp) byFp.set(fp, it);
    out.push(it);
  }
  return out;
}

// Pone en el lienzo una imagen que usa un archivo ya guardado (src): no se duplica el archivo
async function addBgImageShared(ref, blob, point) {
  let w = 0, h = 0;
  try { const bmp = await createImageBitmap(blob); w = bmp.width; h = bmp.height; bmp.close(); } catch (e) {}
  if (!w || !h) {
    const same = projects.flatMap(p => p.bgImages || []).find(i => bgImageRef(i) === ref);
    w = same ? same.w : 600; h = same ? same.h : 400;
  }
  const width = Math.min(600, w);
  const height = Math.round(width * (h / w));
  // La misma imagen conserva su nombre en todos los lugares donde se usa
  const saved = imageNameEntries().find(e => e.id === ref);
  const named = saved || projects.flatMap(p => p.bgImages || []).find(i => bgImageRef(i) === ref && i.name);
  const img = { id: generateId('img'), src: ref, name: named ? named.name : nextImageName(), x: Math.round(point.x - width / 2), y: Math.round(point.y - height / 2), w: width, h: height, ...(typeof defaultStyleFor === 'function' ? defaultStyleFor('img') : {}) };
  getBgImages().push(img);
  persist();
  selection = new Set([`img:${img.id}`]);
  renderBgImages();
  showToast('Imagen insertada desde la biblioteca (es la misma imagen, no una copia)', 'success');
}

// Cambia el nombre de una imagen de la Biblioteca: queda guardado por archivo y se usa en todos los lugares
// donde está esa misma imagen. Se sincroniza con Drive junto con el resto de los datos.
function renameLibraryImage(item, name) {
  setSavedImageName(item.ref, name);
  projects.forEach(p => (p.bgImages || []).forEach(i => {
    if (bgImageRef(i) !== item.ref) return;
    if (name) i.name = name; else delete i.name;
  }));
  if (!name) ensureImageNames();
  persist();
  updateContextBar();
  item.name = name || (projects.flatMap(p => p.bgImages || []).find(i => bgImageRef(i) === item.ref) || {}).name || '';
  item.saved = !!name;
}

// Menú contextual de la Biblioteca (clic derecho o mantener apretada una imagen)
function openLibraryMenu(clientX, clientY, actions) {
  let menu = document.getElementById('libraryMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'libraryMenu';
    menu.className = 'canvas-menu library-menu';
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    menu.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); menu.hidden = true; } }, true);
  }
  menu.innerHTML = actions.map((a, i) => `<button type="button" role="menuitem" data-act="${i}"${a.disabled ? ' disabled' : ''}${a.title ? ` title="${escapeHtml(a.title)}"` : ''}><span class="menu-emoji" aria-hidden="true">${a.icon}</span><span>${escapeHtml(a.label)}</span></button>`).join('');
  menu.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    menu.hidden = true;
    actions[Number(b.dataset.act)].run();
  };
  menu.hidden = false;
  menu.style.left = `${Math.min(clientX, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(clientY, window.innerHeight - menu.offsetHeight - 8)}px`;
}

function openImageLibrary(point = null) {
  if (!point) {
    const rect = viewportArea.getBoundingClientRect();
    point = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  let m = document.getElementById('imageFinderModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'imageFinderModal';
    m.innerHTML = `
      <div class="modal-card image-finder-card">
        <div class="modal-header">
          <h2>🖼 Biblioteca de imágenes</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div class="image-finder-body">
          <input type="search" class="image-finder-search" placeholder="Filtrar por nombre, espacio, proyecto, tablero o tarea…" autocomplete="off">
          <div class="image-finder-sources"></div>
          <p class="image-finder-note"></p>
          <div class="image-finder-grid"></div>
        </div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.style.display = 'none'; });
    document.body.appendChild(m);
  }
  const grid = m.querySelector('.image-finder-grid');
  const search = m.querySelector('.image-finder-search');
  const note = m.querySelector('.image-finder-note');
  ensureImageNames();
  let items = libraryItems();
  // Las que no tienen nombre guardado (tareas, pestañas, otros espacios) se muestran como "Imagen N",
  // siguiendo la numeración de las del lienzo
  const label = (it) => it.name || it.autoName;
  const numberItems = () => {
    let max = 0;
    items.forEach(it => { max = Math.max(max, imageNumberFrom(it.name)); });
    items.forEach(it => { if (!it.name) it.autoName = `Imagen ${++max}`; });
  };
  numberItems();
  // Copias de la misma imagen guardadas por separado (antes cada inserción desde la Biblioteca creaba
  // una): se comparan por contenido y se muestra una sola
  const dedupe = async () => {
    const unique = await dedupeLibraryByContent(items);
    if (unique.length !== items.length) { items = unique; numberItems(); paint(); }
  };
  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const list = items.filter(it => !q || `${label(it)} ${it.spaceLabel} ${it.project.name} ${it.where}`.toLowerCase().includes(q));
    grid.innerHTML = list.length ? list.map(it => `
      <button type="button" class="image-finder-item" data-i="${items.indexOf(it)}" title="Insertar «${escapeHtml(label(it))}» · ${escapeHtml(it.spaceLabel)} › ${escapeHtml(it.project.name)} · ${escapeHtml(it.where)}">
        <img alt="" loading="lazy">
        <span><b>${escapeHtml(label(it))}</b><small>${escapeHtml(it.project.name)} · ${escapeHtml(it.where)} · ${escapeHtml(it.spaceLabel)}</small></span>
      </button>`).join('')
      : `<p class="image-finder-empty">${items.length ? 'Ninguna imagen coincide.' : 'Todavía no hay imágenes.'}</p>`;
    grid.querySelectorAll('[data-i]').forEach(b => libraryThumb(b.querySelector('img'), items[Number(b.dataset.i)]));
  };
  search.value = '';
  search.oninput = paint;
  // Fuentes externas (se configuran en ⚙️ Configuración): se abren en el navegador con el texto del filtro
  const sources = imageSources();
  const sourcesEl = m.querySelector('.image-finder-sources');
  sourcesEl.innerHTML = sources.length ? `<span>Buscar en:</span>${sources.map((s, i) =>
    `<button type="button" class="btn btn-ghost btn-sm" data-src="${i}" title="Abrir ${escapeHtml(s.name)} en el navegador (usa el texto del filtro)">${escapeHtml(s.name)} ↗</button>`).join('')}` : '';
  sourcesEl.onclick = (e) => {
    const b = e.target.closest('[data-src]');
    if (b) openImageSource(sources[Number(b.dataset.src)], search.value.trim());
  };
  grid.onclick = async (e) => {
    const b = e.target.closest('[data-i]');
    if (!b || b.classList.contains('is-missing')) return;
    const it = items[Number(b.dataset.i)];
    b.classList.add('is-loading');
    try {
      const blob = await libraryBlob(it);
      if (!blob) throw new Error('sin imagen');
      m.style.display = 'none';
      // De este espacio: se usa la misma imagen (sin copia). De otro espacio se trae una copia, porque
      // sus archivos están en la carpeta de Drive de ese espacio.
      if (!it.space && !isRemoteImage(it.ref)) await addBgImageShared(it.ref, blob, point);
      else await addBgImageFromFile(new File([blob], 'imagen', { type: blob.type || 'image/png' }), null, null, { at: point, message: 'Imagen insertada desde la biblioteca' });
    } catch (err) {
      b.classList.remove('is-loading');
      showToast('No se pudo traer esa imagen. Revisa tu conexión e inténtalo de nuevo.', 'warning');
    }
  };
  // Renombrar en el mismo cuadro: Enter guarda, Esc cancela
  const startRename = (b, it) => {
    const nameEl = b.querySelector('b');
    if (!nameEl || b.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'image-finder-rename';
    input.value = label(it);
    input.maxLength = 80;
    nameEl.replaceWith(input);
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (save && name !== label(it)) {
        renameLibraryImage(it, name);
        numberItems();
        showToast(name ? `Imagen renombrada: «${name}»` : 'Se quitó el nombre de la imagen', 'success');
      }
      paint();
    };
    // Lo que se toca dentro del campo no inserta la imagen
    ['click', 'pointerdown'].forEach(ev => input.addEventListener(ev, (e) => e.stopPropagation()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.focus();
    input.select();
  };
  grid.oncontextmenu = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    e.preventDefault();
    const it = items[Number(b.dataset.i)];
    // Las de otro espacio se nombran en los datos de ese espacio: se renombran abriéndolo
    const other = !!it.space;
    openLibraryMenu(e.clientX, e.clientY, [
      { icon: '✏️', label: 'Renombrar', disabled: other, title: other ? `Es de «${it.spaceLabel}»: ábrelo para renombrarla` : '', run: () => startRename(b, it) },
      { icon: '➕', label: 'Insertar en el lienzo', disabled: b.classList.contains('is-missing'), run: () => b.click() }
    ]);
  };
  // Los otros espacios se leen de Drive (si hay sesión) y se suman al llegar
  const signed = syncEnabled() && SYNC.token && Date.now() < SYNC.tokenExp;
  note.textContent = signed ? 'Buscando también en tus otros espacios…' : 'Inicia sesión con Google para ver también las imágenes de tus otros espacios.';
  if (signed && typeof loadOtherSpaces === 'function') {
    loadOtherSpaces().then(() => { items = libraryItems(); numberItems(); note.textContent = ''; paint(); dedupe(); }).catch(() => { note.textContent = 'No se pudieron leer tus otros espacios.'; });
  }
  paint();
  dedupe();
  m.style.display = 'flex';
  if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => search.focus(), 50);
}

// Ventana para elegir a qué proyecto (o tablero) apunta un link interno nuevo
function openInternalLinkPicker(onPick) {
  let m = document.getElementById('internalLinkModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'internalLinkModal';
    m.innerHTML = `
      <div class="modal-card modal-sm">
        <div class="modal-header">
          <h2>↪ Link a otro proyecto</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div class="internal-link-body">
          <p class="link-names-help">Elige a dónde salta el link. Después puedes cambiar su texto o ponerle una imagen en "Links".</p>
          <div class="internal-link-list"></div>
        </div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.style.display = 'none'; });
    document.body.appendChild(m);
  }
  const item = (url, label, sub, indent) =>
    `<button type="button" class="internal-link-item ${indent ? 'is-board' : ''}" data-url="${escapeHtml(url)}"><span>${escapeHtml(label)}</span>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</button>`;
  let html = projects.map(p =>
    item(internalLinkUrl(p.id), `📂 ${p.name}`, p.id === activeProjectId ? 'abierto' : '', false) +
    (p.boards || []).map(b => item(internalLinkUrl(p.id, 'b', b.id), `▦ ${b.title}`, '', true)).join('')
  ).join('');
  if (typeof knownOtherSpaces === 'function') {
    knownOtherSpaces().forEach(entry => {
      if (!(entry.projects || []).length) return;
      html += `<div class="internal-link-section">${typeof spaceTitle === 'function' ? escapeHtml(spaceTitle(entry.space)) : 'Otro espacio'}</div>`;
      html += entry.projects.map(p => item(internalLinkUrl(p.id), `📂 ${p.name}`, '', false)).join('');
    });
  }
  const list = m.querySelector('.internal-link-list');
  list.innerHTML = html;
  list.onclick = (e) => {
    const b = e.target.closest('[data-url]');
    if (!b) return;
    m.style.display = 'none';
    onPick(b.dataset.url);
  };
  m.style.display = 'flex';
}
function linkify(str, names = null) {
  return escapeHtml(str).replace(LINK_RE, (match, label, labelUrl, url) => {
    if (label) {
      return `<a class="auto-link" href="${linkHref(labelUrl)}" target="_blank" rel="noopener noreferrer" title="${labelUrl}">${label}</a>`;
    }
    // La puntuación al final ("…/docs." o "(…/docs)") no es parte del link
    const trail = (url.match(LINK_TRAIL_RE) || [''])[0];
    if (trail) url = url.slice(0, -trail.length);
    const opt = linkOption(names, unescapeHtml(url));
    // Oculto: no se muestra (útil si ya se ve la miniatura del video)
    if (opt.hide) return trail;
    const internal = isInternalLink(url);
    const fileLink = isFileLink(url);
    const gdoc = !internal && !fileLink && googleDocKind(unescapeHtml(url));
    // Un link interno sin nombre propio muestra el proyecto al que salta; un PDF, su nombre;
    // un documento de Google, su tipo
    if (internal && !opt.text && !opt.image) opt.text = internalLinkLabel(unescapeHtml(url));
    if (fileLink && !opt.text && !opt.image) opt.text = `📄 ${(parseFileLink(unescapeHtml(url)) || {}).name || 'PDF'}`;
    if (gdoc && !opt.text && !opt.image) opt.text = `${GOOGLE_DOC_KINDS[gdoc].icon} ${GOOGLE_DOC_KINDS[gdoc].label}`;
    const kindClass = internal ? ' internal-link' : fileLink ? ' file-link' : gdoc ? ` gdoc-link gdoc-${gdoc}` : '';
    const attrs = `class="auto-link${opt.image ? ' link-image' : ''}${kindClass}" href="${linkHref(url)}" data-url="${url}"${internal || fileLink ? '' : ' target="_blank" rel="noopener noreferrer"'}`;
    if (opt.image) {
      // Con imagen y texto, el texto se ve encima de la imagen
      const caption = opt.text ? `<span class="link-image-caption">${escapeHtml(opt.text)}</span>` : '';
      return `<a ${attrs} title="${escapeHtml(opt.text || unescapeHtml(url))}"><img data-link-img="${escapeHtml(opt.image)}" alt="${escapeHtml(opt.text || 'Link')}" draggable="false">${caption}</a>${trail}`;
    }
    return `<a ${attrs}${opt.text ? ` title="${url}"` : ''}>${opt.text ? escapeHtml(opt.text) : url}</a>${trail}`;
  });
}

// Cómo se muestra un link: { text, hide, image }. Se guarda como texto (lo más común) o como objeto.
function linkOption(names, url) {
  const v = names && names[url];
  if (!v) return {};
  if (typeof v === 'string') return { text: v.trim() };
  return { text: (v.text || '').trim(), hide: !!v.hide, image: v.image || null };
}

// Una imagen puede ser una guardada en ZenBan (id) o una dirección web (traída de un navegador sin permiso para copiarla)
function isRemoteImage(ref) {
  return /^(https?:|data:)/i.test(String(ref || ''));
}

// Los links mostrados como imagen cargan su imagen guardada al aparecer en pantalla
function hydrateLinkImages(root = document) {
  root.querySelectorAll('img[data-link-img]:not([src])').forEach(img => {
    const id = img.dataset.linkImg;
    if (isRemoteImage(id)) { img.src = id; return; }
    const cached = cachedImageVariant(id, 480);
    if (cached) { img.src = cached; return; }
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    getImageVariantUrl(id, 480).then(url => { if (url) img.src = url; });
  });
}

function unescapeHtml(str) {
  return String(str).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Direcciones web de unos textos (sin repetir), tal como las muestra linkify
function extractUrls(...texts) {
  const urls = [];
  texts.forEach(str => {
    for (const m of escapeHtml(str || '').matchAll(LINK_RE)) {
      if (!m[3]) continue;
      const trail = (m[3].match(LINK_TRAIL_RE) || [''])[0];
      const url = unescapeHtml(trail ? m[3].slice(0, -trail.length) : m[3]);
      if (!urls.includes(url)) urls.push(url);
    }
  });
  return urls;
}

// Ventana para ponerle a cada link el texto que muestra en vez de su dirección
function openLinkNamesDialog(urls, names, onSave) {
  if (!urls.length) {
    showToast('No hay links. Pega una dirección web (https://…) en el texto y vuelve a intentarlo.', 'info');
    return;
  }
  let m = document.getElementById('linkNamesModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'linkNamesModal';
    m.innerHTML = `
      <div class="modal-card modal-sm">
        <div class="modal-header">
          <h2>🔗 Links</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <form class="link-names-form">
          <p class="link-names-help">Elige cómo se ve cada link: con un texto (vacío muestra la dirección), con una imagen (si además escribes un texto, se ve encima de ella), o sin mostrarse (por ejemplo, si ya se ve la miniatura del video).</p>
          <div class="link-names-list"></div>
          <div class="modal-actions">
            <div class="spacer"></div>
            <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>`;
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-close]')) m.style.display = 'none';
    });
    document.body.appendChild(m);
  }
  const list = m.querySelector('.link-names-list');
  const state = urls.map(url => ({ ...linkOption(names, url) }));
  list.innerHTML = urls.map((url, i) => `
    <div class="form-group link-name-row" data-row="${i}">
      <label for="linkName${i}" class="link-name-url" title="${escapeHtml(url)}">${escapeHtml(url)}</label>
      <input type="text" id="linkName${i}" data-url-index="${i}" placeholder="Texto a mostrar" value="${escapeHtml(state[i].text || '')}">
      <div class="link-name-options">
        <label class="link-name-hide"><input type="checkbox" data-hide="${i}" ${state[i].hide ? 'checked' : ''}> No mostrar el link</label>
        <button type="button" class="btn btn-ghost btn-sm" data-pick-image="${i}">🖼 Imagen</button>
        <span class="link-name-thumb" data-thumb="${i}"></span>
      </div>
    </div>`).join('');
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  let pickingRow = -1;
  const paintRow = (i) => {
    const row = list.querySelector(`[data-row="${i}"]`);
    const thumb = row.querySelector('[data-thumb]');
    thumb.innerHTML = state[i].image
      ? `<img data-link-img="${escapeHtml(state[i].image)}" alt=""><button type="button" class="link-name-thumb-x" data-remove-image="${i}" title="Quitar la imagen">&times;</button>`
      : '';
    hydrateLinkImages(thumb);
    const hide = row.querySelector('[data-hide]').checked;
    row.querySelector('input[type="text"]').disabled = hide;
    row.classList.toggle('is-hidden-link', hide);
  };
  urls.forEach((_, i) => paintRow(i));
  list.onchange = (e) => {
    if (e.target.matches('[data-hide]')) paintRow(Number(e.target.dataset.hide));
  };
  list.onclick = (e) => {
    const pick = e.target.closest('[data-pick-image]');
    if (pick) { pickingRow = Number(pick.dataset.pickImage); picker.click(); return; }
    const remove = e.target.closest('[data-remove-image]');
    if (remove) { const i = Number(remove.dataset.removeImage); state[i].image = null; paintRow(i); }
  };
  picker.onchange = async () => {
    const file = picker.files && picker.files[0];
    picker.value = '';
    if (!file || pickingRow < 0) return;
    try {
      const { id } = await storeImageFile(file);
      state[pickingRow].image = id;
      paintRow(pickingRow);
    } catch (err) {
      showToast('No se pudo usar esa imagen', 'warning');
    }
  };
  const form = m.querySelector('form');
  form.onsubmit = (e) => {
    e.preventDefault();
    const result = {};
    urls.forEach((url, i) => {
      const row = list.querySelector(`[data-row="${i}"]`);
      const text = row.querySelector('input[type="text"]').value.trim();
      const hide = row.querySelector('[data-hide]').checked;
      const image = state[i].image;
      if (hide || image) result[url] = { text, hide, image: image || null };
      else if (text) result[url] = text;
    });
    m.style.display = 'none';
    onSave(result);
  };
  m.style.display = 'flex';
  if (!window.matchMedia('(pointer: coarse)').matches) list.querySelector('input').focus();
}

// Videos y listas de reproducción de YouTube mencionados en un texto.
// Un link con list= (aunque traiga también un video) se muestra como lista.
const YOUTUBE_URL_RE = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"')\]]+/gi;
const YOUTUBE_VIDEO_RE = /(?:youtube\.com\/(?:watch\?(?:[^\s)]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i;
function youtubeRefs(str) {
  const videos = [];
  const lists = [];
  for (const [url] of String(str || '').matchAll(YOUTUBE_URL_RE)) {
    const list = (url.match(/[?&]list=([\w-]{10,64})/) || [])[1];
    if (list) { if (!lists.includes(list)) lists.push(list); continue; }
    const video = (url.match(YOUTUBE_VIDEO_RE) || [])[1];
    if (video && !videos.includes(video)) videos.push(video);
  }
  return { videos, lists };
}

// Vista previa de los videos (miniatura) y listas de YouTube de un texto; tocarlas abre YouTube.
// mode 'full': la lista completa con sus videos (vista rápida, textos del lienzo); 'compact': solo su portada (tarjetas)
function youtubePreviews(str, max = 3, mode = 'full') {
  const { videos, lists } = youtubeRefs(str);
  const ids = videos.slice(0, max);
  if (!ids.length && !lists.length) return '';
  // Sin espacios entre etiquetas: los textos del lienzo respetan los saltos de línea
  return `<div class="yt-previews">${lists.slice(0, max).map(list => playlistHtml(list, mode)).join('')}${ids.map(id =>
    `<a class="yt-preview" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" title="Ver en YouTube">` +
    `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Video de YouTube" loading="lazy" decoding="async" draggable="false">` +
    `<span class="yt-play" aria-hidden="true"></span></a>`).join('')}</div>`;
}

// ----- Listas de reproducción: el servidor de ZenBan (Worker del MCP) lee sus videos -----
const PLAYLIST_API = 'https://zenban-mcp.zenban-mcp.workers.dev/youtube/playlist?list=';
const PLAYLIST_TTL = 12 * 3600 * 1000;
const playlistCache = new Map();   // id → datos
const playlistLoading = new Map(); // id → promesa

function cachedPlaylist(id) {
  if (playlistCache.has(id)) return playlistCache.get(id);
  try {
    const saved = JSON.parse(localStorage.getItem(`zenban_yt_pl_${id}`) || 'null');
    if (saved && Date.now() - saved.at < PLAYLIST_TTL) {
      playlistCache.set(id, saved.data);
      return saved.data;
    }
  } catch (e) {}
  return null;
}

function loadPlaylist(id) {
  if (playlistLoading.has(id)) return playlistLoading.get(id);
  const p = fetch(PLAYLIST_API + encodeURIComponent(id))
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`playlist ${r.status}`)))
    .then(data => {
      playlistCache.set(id, data);
      try { localStorage.setItem(`zenban_yt_pl_${id}`, JSON.stringify({ at: Date.now(), data })); } catch (e) {}
      return data;
    })
    .finally(() => playlistLoading.delete(id));
  playlistLoading.set(id, p);
  return p;
}

// ----- Videos vistos de cada lista (casillas) y su progreso. Se guardan en el proyecto:
//       project.ytProgress = [{ id: idDeLaLista, done: [idsDeVideos] }] (se sincroniza como lo demás) -----
function ytProgressEntries() {
  const p = getActiveProject();
  if (!Array.isArray(p.ytProgress)) p.ytProgress = [];
  return p.ytProgress;
}

function ytDoneSet(listId) {
  const e = ytProgressEntries().find(x => x.id === listId);
  return new Set(e ? e.done : []);
}

function setYtVideoDone(listId, videoId, done) {
  const list = ytProgressEntries();
  let e = list.find(x => x.id === listId);
  if (!e) { e = { id: listId, done: [] }; list.push(e); }
  e.done = e.done.filter(v => v !== videoId);
  if (done) e.done.push(videoId);
  persist();
  refreshYtProgress();
}

// Vistos y total de una lista (total: los videos que tiene en YouTube, aunque se muestren menos)
function ytListProgress(listId) {
  const data = cachedPlaylist(listId);
  const done = ytDoneSet(listId);
  if (!data) return { done: done.size, total: 0, title: null };
  const total = Math.max(data.count || 0, data.videos.length);
  // Solo cuentan los videos que siguen en la lista (si se sacó uno ya marcado, no suma)
  const shown = new Set(data.videos.map(v => v.id));
  const doneNow = [...done].filter(v => shown.has(v) || data.videos.length < total).length;
  return { done: Math.min(doneNow, total), total, title: data.title };
}

function ytProgressBarHtml(done, total, cls = '') {
  const pct = total ? Math.round(done / total * 100) : 0;
  return `<span class="yt-progress ${cls}" title="${done} de ${total} vistos (${pct}%)"><i style="width:${pct}%"></i></span>`;
}

function ytListProgressHtml(listId) {
  const { done, total } = ytListProgress(listId);
  return `<span class="yt-pl-progress" data-progress-list="${listId}">${ytProgressBarHtml(done, total)}<small>${done}/${total} vistos</small></span>`;
}

// ----- Widget "Progreso de listas": suma los vistos de varias listas. Se configura arrastrando encima
//       un texto (o nota) que tenga listas de YouTube; cada lista se puede quitar con su ×. -----
const ytFailedLists = new Set(); // listas que no se pudieron leer (privadas o borradas) en esta sesión
function ytProgressWidgetHtml(t) {
  const lists = t.ytLists || [];
  let done = 0, total = 0;
  const rows = lists.map(id => {
    const p = ytListProgress(id);
    if (!p.title && !playlistLoading.has(id) && !ytFailedLists.has(id)) {
      loadPlaylist(id).then(refreshYtProgressWidgets).catch(() => { ytFailedLists.add(id); refreshYtProgressWidgets(); });
    }
    done += p.done;
    total += p.total;
    const name = p.title || (ytFailedLists.has(id) ? 'No se pudo leer (¿privada?)' : 'Cargando lista…');
    return `<div class="ytp-row"><span class="ytp-name" title="${escapeHtml(p.title || id)}">${escapeHtml(name)}</span>` +
      `<span class="ytp-count">${p.done}/${p.total}</span>` +
      `<button type="button" class="ytp-remove" data-ytp-remove="${id}" title="Quitar esta lista del progreso">×</button>` +
      `${ytProgressBarHtml(p.done, p.total)}</div>`;
  }).join('');
  const pct = total ? Math.round(done / total * 100) : 0;
  return `<div class="ytp-widget"><div class="ytp-head"><b>${escapeHtml(t.text || 'Progreso de listas')}</b>` +
    `<span class="ytp-total">${pct}% · ${done}/${total}</span></div>${ytProgressBarHtml(done, total)}` +
    (lists.length ? `<div class="ytp-lists">${rows}</div>`
      : '<p class="ytp-empty">Selecciona este cuadro y arrastra su círculo verde ＋ hasta una lista de YouTube para sumar su progreso.</p>') + '</div>';
}

function refreshYtProgressWidgets() {
  getTexts().forEach(t => {
    if (!Array.isArray(t.ytLists) || t.id === editingTextId) return;
    const el = getTextEl(t.id);
    const w = el && el.querySelector('.ytp-widget');
    if (w) w.outerHTML = ytProgressWidgetHtml(t);
  });
  if (typeof renderConnectors === 'function') renderConnectors();
}

function addYtProgressWidget(at) {
  const t = addText('Progreso de listas', at, { ytLists: [], fixedWidth: true, w: Math.round(380 / zoom), size: Math.max(4, Math.round(16 / zoom)) });
  showToast('Arrastra el círculo verde ＋ hasta una lista de YouTube para sumarla al progreso', 'info');
  return t;
}

// Suma listas al widget (se arrastra su círculo verde + hasta una lista)
function addListIdsToYtWidget(widget, ids) {
  const lists = ids.filter(id => !widget.ytLists.includes(id));
  if (!lists.length) { showToast(ids.length === 1 ? 'Esa lista ya está en el progreso' : 'Esas listas ya están en el progreso', 'info'); return; }
  widget.ytLists = [...widget.ytLists, ...lists];
  persist();
  renderTexts();
  showToast(lists.length === 1 ? 'Lista agregada al progreso' : `${lists.length} listas agregadas al progreso`, 'success');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-ytp-remove]');
  if (!btn) return;
  e.stopPropagation();
  const el = btn.closest('.canvas-text');
  const t = el && getTexts().find(x => x.id === el.dataset.textId);
  if (!t) return;
  t.ytLists = t.ytLists.filter(id => id !== btn.dataset.ytpRemove);
  persist();
  refreshYtProgressWidgets();
});

// Actualiza las barras y los widgets de progreso sin redibujar todo
function refreshYtProgress() {
  document.querySelectorAll('[data-progress-list]').forEach(el => { el.outerHTML = ytListProgressHtml(el.dataset.progressList); });
  if (typeof refreshYtProgressWidgets === 'function') refreshYtProgressWidgets();
}

// Tamaño y color de las casillas (⚙️ Configuración). El tamaño es una parte del ancho de la miniatura
// del video (al menos 1/4); por defecto 30 % y con la marca verde.
const YT_CHECK_DEFAULT = { scale: 0.3, color: '#22c55e' };
function ytCheckScale() {
  return Math.max(0.25, Math.min(0.6, Number(appSettings.ytCheckScale) || YT_CHECK_DEFAULT.scale));
}
function applyYtCheckStyle(scale = ytCheckScale(), color = appSettings.ytCheckColor || YT_CHECK_DEFAULT.color) {
  document.documentElement.style.setProperty('--yt-check-scale', String(scale));
  document.documentElement.style.setProperty('--yt-check-color', color);
}
applyYtCheckStyle();

document.addEventListener('change', (e) => {
  const box = e.target.closest && e.target.closest('[data-yt-check]');
  if (!box) return;
  setYtVideoDone(box.dataset.list, box.dataset.video, box.checked);
  const row = box.closest('.yt-pl-row');
  if (row) row.classList.toggle('is-done', box.checked);
});

function playlistHtml(id, mode) {
  const data = cachedPlaylist(id);
  const listUrl = `https://www.youtube.com/playlist?list=${id}`;
  if (!data) {
    // Se completa al llegar los datos (hydratePlaylists)
    return `<div class="yt-playlist is-loading" data-list="${id}" data-mode="${mode}"><a class="yt-playlist-head" href="${listUrl}" target="_blank" rel="noopener noreferrer"><span class="yt-playlist-cover yt-skeleton"></span><span class="yt-playlist-info"><b>Lista de reproducción</b><small>Cargando videos…</small></span></a></div>`;
  }
  const first = data.videos[0];
  const more = data.count > data.videos.length ? data.count : data.videos.length;
  const head = `<a class="yt-playlist-head" href="${listUrl}" target="_blank" rel="noopener noreferrer" title="Ver la lista en YouTube">` +
    `<span class="yt-playlist-cover">${first ? `<img src="https://i.ytimg.com/vi/${first.id}/mqdefault.jpg" alt="" loading="lazy" decoding="async" draggable="false">` : ''}<span class="yt-playlist-count">▶ ${more} videos</span></span>` +
    `<span class="yt-playlist-info"><b>${escapeHtml(data.title)}</b><small>${escapeHtml(data.author || 'YouTube')} · ${more} videos</small>${ytListProgressHtml(id)}</span></a>`;
  if (mode === 'compact') return `<div class="yt-playlist is-compact" data-list="${id}" data-ready="1">${head}</div>`;
  const done = ytDoneSet(id);
  // Cada video con su casilla de "visto" (la casilla queda fuera del link para no abrir YouTube al marcarla)
  const items = data.videos.map((v, i) =>
    `<div class="yt-pl-row${done.has(v.id) ? ' is-done' : ''}">` +
    `<label class="yt-pl-check" title="Marcar como visto"><input type="checkbox" data-yt-check data-list="${id}" data-video="${v.id}"${done.has(v.id) ? ' checked' : ''}></label>` +
    `<a class="yt-pl-item" href="https://www.youtube.com/watch?v=${v.id}&amp;list=${id}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(v.title)}">` +
    `<span class="yt-pl-index">${i + 1}</span>` +
    `<span class="yt-pl-thumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" decoding="async" draggable="false">${v.duration ? `<span class="yt-pl-duration">${escapeHtml(v.duration)}</span>` : ''}</span>` +
    `<span class="yt-pl-text"><b>${escapeHtml(v.title)}</b><small>${escapeHtml(v.channel || '')}</small></span></a></div>`).join('');
  const rest = data.count > data.videos.length
    ? `<a class="yt-pl-more" href="${listUrl}" target="_blank" rel="noopener noreferrer">Ver los ${data.count} videos en YouTube</a>` : '';
  return `<div class="yt-playlist" data-list="${id}" data-ready="1">${head}<div class="yt-pl-items">${items}</div>${rest}</div>`;
}

// Completa las listas que quedaron "Cargando…" (se llama sola cuando aparecen en pantalla)
function hydratePlaylists(root = document) {
  root.querySelectorAll('.yt-playlist.is-loading:not([data-fetching])').forEach(el => {
    el.dataset.fetching = '1';
    const id = el.dataset.list;
    loadPlaylist(id).then(() => {
      document.querySelectorAll(`.yt-playlist.is-loading[data-list="${id}"]`).forEach(x => {
        x.outerHTML = playlistHtml(id, x.dataset.mode || 'full');
      });
    }).catch(() => {
      document.querySelectorAll(`.yt-playlist.is-loading[data-list="${id}"]`).forEach(x => {
        x.classList.remove('is-loading');
        x.dataset.ready = '1';
        const small = x.querySelector('small');
        if (small) small.textContent = 'No se pudo cargar (puede ser privada). Toca para verla en YouTube.';
        const cover = x.querySelector('.yt-skeleton');
        if (cover) cover.classList.remove('yt-skeleton');
      });
    });
  });
}

// ----- Links en el lienzo, tarjetas y vista rápida: se abren con doble clic (doble toque en el celular).
//       Un clic simple no los abre: selecciona, y mantener apretado o arrastrar mueve el texto o la tarjeta -----
const LINK_SCOPE = '.canvas-text a, .kanban-card a, .card-peek a';
const LINK_DOUBLE_MS = 450;
let linkPress = null;
let lastLinkClick = null;

// El link bajo el puntero. Al tomar un texto del lienzo, el lienzo "captura" el puntero y el clic
// le llega a él (no al link), así que también se busca por la posición.
function linkAtEvent(e) {
  const direct = e.target instanceof Element ? e.target.closest(LINK_SCOPE) : null;
  if (direct) return direct;
  if (typeof e.clientX !== 'number') return null;
  for (const n of document.elementsFromPoint(e.clientX, e.clientY)) {
    const a = n.closest && n.closest(LINK_SCOPE);
    if (a) return a;
    if (n.closest && n.closest('.modal-backdrop .modal-card, .canvas-menu')) return null;
  }
  return null;
}

document.addEventListener('pointerdown', (e) => {
  const a = linkAtEvent(e);
  linkPress = a ? { x: e.clientX, y: e.clientY, moved: false } : null;
}, true);
document.addEventListener('pointermove', (e) => {
  if (linkPress && !linkPress.moved && Math.hypot(e.clientX - linkPress.x, e.clientY - linkPress.y) > 6) linkPress.moved = true;
}, true);
document.addEventListener('click', (e) => {
  const a = linkAtEvent(e);
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  const moved = linkPress && linkPress.moved;
  linkPress = null;
  if (moved) { lastLinkClick = null; return; }
  const href = a.getAttribute('href');
  const now = Date.now();
  // Segundo clic sobre el mismo link (aunque se haya vuelto a dibujar): se abre
  if (lastLinkClick && lastLinkClick.href === href && now - lastLinkClick.time < LINK_DOUBLE_MS &&
      Math.hypot(e.clientX - lastLinkClick.x, e.clientY - lastLinkClick.y) < 30) {
    lastLinkClick = null;
    openLink(a);
    return;
  }
  lastLinkClick = { href, time: now, x: e.clientX, y: e.clientY };
}, true);
// El doble clic sobre un link no edita el texto ni acerca la vista: solo abre el link
document.addEventListener('dblclick', (e) => {
  if (!linkAtEvent(e)) return;
  e.preventDefault();
  e.stopPropagation();
}, true);
// En el celular, mantener apretado un link no abre el menú del navegador (vista previa del link)
document.addEventListener('contextmenu', (e) => {
  if (linkAtEvent(e)) e.preventDefault();
}, true);

function openLink(a) {
  const url = a.dataset.url ? unescapeHtml(a.dataset.url) : a.getAttribute('href');
  if (isInternalLink(url)) { openInternalLink(url); return; }
  if (isFileLink(url)) { openFileLink(url); return; }
  window.open(a.href, '_blank', 'noopener');
}

// ----- Ventanas: se mueven arrastrando su título, y el fondo se puede seguir usando -----
// (por ejemplo, para copiar el texto de otra tarea mientras se edita una)
document.addEventListener('pointerdown', (e) => {
  const header = e.target.closest('.modal-backdrop .modal-header');
  if (!header || e.button !== 0 || e.target.closest('button, input, select, textarea, a, label')) return;
  const card = header.closest('.modal-card');
  if (!card) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const baseX = Number(card.dataset.dx || 0);
  const baseY = Number(card.dataset.dy || 0);
  const rect = card.getBoundingClientRect();
  card.classList.add('is-moving');
  const onMove = (ev) => {
    // Siempre queda al menos el título a la vista
    let dx = baseX + ev.clientX - startX;
    let dy = baseY + ev.clientY - startY;
    const minDx = baseX - rect.left - rect.width + 80;
    const maxDx = baseX + (window.innerWidth - rect.left) - 80;
    const minDy = baseY - rect.top;
    const maxDy = baseY + (window.innerHeight - rect.top) - 50;
    dx = Math.min(Math.max(dx, minDx), maxDx);
    dy = Math.min(Math.max(dy, minDy), maxDy);
    card.dataset.dx = dx;
    card.dataset.dy = dy;
    card.style.translate = `${dx}px ${dy}px`;
  };
  const onUp = () => {
    card.classList.remove('is-moving');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
});

// Al abrirse una ventana se le agrega el interruptor de desenfoque; al cerrarse vuelve a su lugar
new MutationObserver((records) => {
  records.forEach(r => {
    const m = r.target;
    if (!(m instanceof Element) || !m.classList.contains('modal-backdrop')) return;
    if (m.style.display === 'none') {
      m.querySelectorAll('.modal-card[data-dx]').forEach(card => {
        delete card.dataset.dx;
        delete card.dataset.dy;
        card.style.translate = '';
      });
    } else {
      addBlurToggle(m);
    }
  });
}).observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });

// Desenfoque y oscurecido del fondo detrás de las ventanas: nivel en Configuración y
// un interruptor arriba en cada ventana para quitarlo al momento
function applyModalBackdrop() {
  const level = appSettings.modalBlurOff ? 0 : Math.min(100, Math.max(0, Number(appSettings.modalBackdrop ?? 15)));
  document.documentElement.style.setProperty('--modal-blur', `${(level / 100) * 8}px`);
  document.documentElement.style.setProperty('--modal-dim', String(0.05 + (level / 100) * 0.65));
  document.querySelectorAll('.modal-blur-toggle input').forEach(i => { i.checked = !appSettings.modalBlurOff; });
}

function addBlurToggle(modal) {
  const header = modal.querySelector('.modal-header');
  if (!header || header.querySelector('.modal-blur-toggle')) return;
  const label = document.createElement('label');
  label.className = 'modal-blur-toggle';
  label.title = 'Desenfocar el lienzo detrás de la ventana';
  label.innerHTML = '<input type="checkbox"><span class="modal-blur-switch" aria-hidden="true"></span><span class="modal-blur-text">Desenfoque</span>';
  const input = label.querySelector('input');
  input.checked = !appSettings.modalBlurOff;
  input.addEventListener('change', () => {
    appSettings.modalBlurOff = !input.checked;
    saveData(SETTINGS_KEY, appSettings);
    applyModalBackdrop();
  });
  const close = header.querySelector('.modal-close-btn');
  if (close) close.before(label); else header.appendChild(label);
}

applyModalBackdrop();

// Completa lo que se dibuja sin datos todavía (listas de YouTube, imágenes de links y de tableros).
// Con un temporizador corto (no requestAnimationFrame, que no corre con la app en segundo plano).
let mediaHydrateQueued = false;
new MutationObserver(() => {
  if (mediaHydrateQueued) return;
  mediaHydrateQueued = true;
  setTimeout(() => {
    mediaHydrateQueued = false;
    if (document.querySelector('.yt-playlist.is-loading:not([data-fetching])')) hydratePlaylists();
    if (document.querySelector('img[data-link-img]:not([src]), img[data-board-img]:not([src])')) { hydrateLinkImages(); hydrateBoardImages(); }
  }, 30);
}).observe(document.body, { childList: true, subtree: true });

// Subtareas numeradas: "1. texto", una por línea
function subtasksAsText(subtasks) {
  return (subtasks || []).map((s, i) => `${i + 1}. ${s.text}`).join('\n');
}

function copyWithToast(text, okMessage) {
  return copyTextToClipboard(text).then(ok => showToast(ok ? okMessage : 'No se pudo copiar', ok ? 'success' : 'error'));
}

// Copia un texto al portapapeles; si el navegador no lo permite, usa la copia clásica
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) {}
    ta.remove();
    return ok;
  }
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
  renderProjectSwitcher();
  renderBoard();
  renderBgImages();
  renderTexts();
  renderDrawings();
  applyTransform();
  resetHistory();
  ImageStore.gc();
  // Todas las imágenes del lienzo tienen nombre ("Imagen N"), para buscarlas en la Biblioteca
  ensureImageNames();
  // Al abrir la app, el proyecto se muestra ajustado a la pantalla
  fitBoardToScreen();
});

// =============================================================================
// 10. PWA Install & Service Worker Support
// =============================================================================

let deferredInstallPrompt = null;
const installAppBtn = document.getElementById('installAppBtn');
const installModal = document.getElementById('installModal');
const closeInstallModalBtn = document.getElementById('closeInstallModalBtn');
const closeInstallModalActionBtn = document.getElementById('closeInstallModalActionBtn');
const nativeInstallPromptSection = document.getElementById('nativeInstallPromptSection');
const btnTriggerNativeInstall = document.getElementById('btnTriggerNativeInstall');

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

function isRunningStandalone() {
  return (window.matchMedia('(display-mode: standalone)').matches) || 
         (window.navigator.standalone === true);
}

// Select matching install guide tab
function switchInstallTab(targetTab) {
  const tabs = document.querySelectorAll('.install-tab-btn');
  const panes = {
    android: document.getElementById('tabPaneAndroid'),
    ios: document.getElementById('tabPaneIos'),
    desktop: document.getElementById('tabPaneDesktop')
  };

  tabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === targetTab);
  });

  Object.keys(panes).forEach(key => {
    if (panes[key]) {
      panes[key].style.display = key === targetTab ? 'flex' : 'none';
    }
  });
}

// Attach tab click events
document.querySelectorAll('.install-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchInstallTab(btn.dataset.tab);
  });
});

// Capture beforeinstallprompt event (Chromium, Android, Edge)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installAppBtn) {
    installAppBtn.classList.add('is-ready');
    installAppBtn.title = '¡Instala ZenBan en tu celular o PC!';
  }
  if (nativeInstallPromptSection) {
    nativeInstallPromptSection.style.display = 'block';
  }
});

function openInstallModal() {
  if (isRunningStandalone()) {
    showToast('La app ya está instalada y ejecutándose en pantalla completa', 'info');
    return;
  }

  // Preselect suitable tab based on current device
  if (isIosDevice()) {
    switchInstallTab('ios');
  } else if (isAndroidDevice()) {
    switchInstallTab('android');
  } else {
    switchInstallTab('desktop');
  }

  if (nativeInstallPromptSection) {
    nativeInstallPromptSection.style.display = deferredInstallPrompt ? 'block' : 'none';
  }

  if (installModal) installModal.style.display = 'flex';
}

function closeInstallModal() {
  if (installModal) installModal.style.display = 'none';
}

if (closeInstallModalBtn) closeInstallModalBtn.addEventListener('click', closeInstallModal);
if (closeInstallModalActionBtn) closeInstallModalActionBtn.addEventListener('click', closeInstallModal);

async function triggerInstallFlow() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      showToast('¡ZenBan instalada con éxito! 🎉', 'success');
      if (installAppBtn) installAppBtn.style.display = 'none';
      closeInstallModal();
    } else {
      showToast('Instalación cancelada', 'info');
    }
    deferredInstallPrompt = null;
  } else {
    openInstallModal();
  }
}

// Install Button click handlers
if (installAppBtn) {
  if (isRunningStandalone()) {
    installAppBtn.style.display = 'none';
  }
  installAppBtn.addEventListener('click', triggerInstallFlow);
}

if (btnTriggerNativeInstall) {
  btnTriggerNativeInstall.addEventListener('click', triggerInstallFlow);
}

// App installed event
window.addEventListener('appinstalled', () => {
  showToast('¡ZenBan se ha instalado correctamente! 🚀', 'success');
  if (installAppBtn) installAppBtn.style.display = 'none';
  closeInstallModal();
  deferredInstallPrompt = null;
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('ZenBan Service Worker activo en:', reg.scope);
      })
      .catch((err) => {
        console.warn('Registro de Service Worker:', err);
      });
  });
}

