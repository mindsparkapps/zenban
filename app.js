/**
 * ZenBan • Kanban & Todo Engine
 * Multi-device Kanban with Zoom (Pinch, Wheel, UI Buttons), Pan, and Unified Touch/Mouse Drag & Drop
 */

// =============================================================================
// 1. Initial State & Data Persistence
// =============================================================================

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

// Carga los proyectos; si no existen, migra el tablero anterior como primer proyecto
function loadProjects() {
  const saved = loadData(STORAGE_KEYS.PROJECTS, null);
  if (Array.isArray(saved) && saved.length > 0) return saved;

  const legacyColumns = loadData(STORAGE_KEYS.COLUMNS, null);
  const legacyTasks = loadData(STORAGE_KEYS.TASKS, null);
  const hasLegacy = Array.isArray(legacyColumns) || Array.isArray(legacyTasks);

  const firstProject = {
    id: generateId('proj'),
    name: hasLegacy ? 'Mi tablero' : 'Mi primer proyecto',
    color: '#6366f1',
    columns: Array.isArray(legacyColumns) ? legacyColumns : deepClone(DEFAULT_COLUMNS),
    tasks: Array.isArray(legacyTasks) ? legacyTasks : deepClone(DEFAULT_TASKS),
    createdAt: Date.now()
  };

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
  const matchesPriority = f.priority === 'all' || task.priority === f.priority;
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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Error saving data to localStorage', e);
  }
  // Avisar a la sincronización con Drive que hubo cambios locales
  if (key === STORAGE_KEYS.PROJECTS || key === STORAGE_KEYS.TAGS) onLocalDataChanged();
}

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
  zoomCanvas.style.setProperty('--inv-zoom', 1 / zoom);
  zoomPercentLabel.textContent = `${Math.round(zoom * 100)}%`;
}

// Zoom towards a specific screen coordinate (cursor or pinch midpoint)
function zoomAtPoint(clientX, clientY, newZoom) {
  const clampedZoom = Math.min(Math.max(newZoom, ZOOM_CONFIG.MIN), ZOOM_CONFIG.MAX);
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

function fitBoardToScreen() {
  const vpRect = viewportArea.getBoundingClientRect();
  const bounds = getContentBounds();
  const boardWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boardHeight = Math.max(1, bounds.maxY - bounds.minY);

  const padding = 40;
  const scaleX = (vpRect.width - padding * 2) / boardWidth;
  const scaleY = (vpRect.height - padding * 2) / boardHeight;
  let targetZoom = Math.min(scaleX, scaleY, 1.2);
  targetZoom = Math.max(targetZoom, ZOOM_CONFIG.MIN);

  zoom = targetZoom;
  panX = Math.max(20, (vpRect.width - boardWidth * zoom) / 2) - bounds.minX * zoom;
  panY = Math.max(20, (vpRect.height - boardHeight * zoom) / 4) - bounds.minY * zoom;

  applyTransform(true);
  showToast(`Tablero ajustado (${Math.round(zoom * 100)}%)`, 'info');
}

// Acerca la vista hasta que un objeto (imagen, texto o tablero) llene la pantalla, centrado
function fitRectToScreen(x, y, w, h) {
  const vpRect = viewportArea.getBoundingClientRect();
  const padding = 24;
  const scaleX = (vpRect.width - padding * 2) / Math.max(1, w);
  const scaleY = (vpRect.height - padding * 2) / Math.max(1, h);
  zoom = Math.min(Math.max(Math.min(scaleX, scaleY), ZOOM_CONFIG.MIN), ZOOM_CONFIG.MAX);
  // Si ni con el zoom mínimo cabe (p. ej. un tablero ancho en el celular), se muestra desde su esquina
  panX = w * zoom > vpRect.width - padding * 2 ? padding - x * zoom : (vpRect.width - w * zoom) / 2 - x * zoom;
  panY = h * zoom > vpRect.height - padding * 2 ? padding - y * zoom : (vpRect.height - h * zoom) / 2 - y * zoom;
  applyTransform(true);
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
    if (b) return { x: b.x, y: b.y, w: frame.offsetWidth, h: frame.offsetHeight };
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

// Cerca de los bordes de la pantalla el lienzo se desplaza solo, para llevar la tarea a tableros alejados
const CARD_PAN_EDGE = 60;   // px de pantalla desde el borde del lienzo
const CARD_PAN_MAX = 16;    // px de pantalla por cuadro, con el puntero en el borde mismo

function cardEdgePanStep() {
  const vp = viewportArea.getBoundingClientRect();
  const x = dragState.lastX;
  const y = dragState.lastY;
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
const PEEK_PRIORITY = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja', note: 'Nota' };
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
      <span class="priority-badge priority-${task.priority || 'medium'}">${PEEK_PRIORITY[task.priority || 'medium']}</span>
      ${task.completed ? '<span class="card-peek-done">✓ Completada</span>' : ''}
      ${task.dueDate ? `<span class="card-due-date ${dueClass}">📅 ${escapeHtml(task.dueDate)}</span>` : ''}
    </div>
    <h4 class="card-peek-title">${escapeHtml(task.title)}</h4>
    <div class="card-peek-where">${escapeHtml([board && board.title, col && col.title].filter(Boolean).join(' › '))}</div>
    ${(task.tags || []).length ? `<div class="card-tags">${task.tags.map(t => tagPillHtml(t)).join('')}</div>` : ''}
    ${task.description ? `<p class="card-peek-desc">${escapeHtml(task.description)}</p>` : ''}
    ${subs.length ? `
      <div class="card-peek-subs">
        <div class="card-peek-label">Subtareas ${done}/${subs.length}</div>
        <ul>${subs.map(s => `<li class="${s.completed ? 'is-done' : ''}">${s.completed ? '☑' : '☐'} ${escapeHtml(s.text)}</li>`).join('')}</ul>
      </div>` : ''}
    ${imgs.length ? `<div class="card-peek-imgs">${imgs.slice(0, 6).map(i => `<img alt="" data-img-id="${escapeHtml(i.id)}">`).join('')}${imgs.length > 6 ? `<span>+${imgs.length - 6}</span>` : ''}</div>` : ''}
    ${!task.description && !subs.length && !imgs.length ? '<p class="card-peek-empty">Sin descripción ni subtareas.</p>' : ''}`;
  el.querySelectorAll('img[data-img-id]').forEach(img => getImageUrl(img.dataset.imgId).then(url => { if (url) img.src = url; }));

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
  const isInteractive = e.target.closest('button, input, select, textarea, .card-check-btn, .card-menu-btn');

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
  const isInteractive = e.target.closest('button, input, select, textarea, .card-check-btn, .card-menu-btn');

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

function renderBoardContent() {
  kanbanBoard.innerHTML = '';
  refreshTagFilterOptions();
  ensureBoards();

  // Proyecto sin tableros: estado vacío con acceso directo
  if (boards.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'board-empty';
    emptyEl.innerHTML = `
      <div class="board-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="4" width="18" height="16" rx="2"></rect>
          <line x1="9" y1="8" x2="9" y2="20"></line>
          <line x1="15" y1="8" x2="15" y2="20"></line>
          <line x1="3" y1="8" x2="21" y2="8"></line>
        </svg>
      </div>
      <h3>Este proyecto aún no tiene tableros</h3>
      <p>Crea un tablero para empezar a organizar las tareas de <strong>${escapeHtml(getActiveProject().name)}</strong>.</p>
      <button class="btn btn-primary" onclick="openBoardModal()">Crear tablero</button>
    `;
    emptyEl.style.left = `${COLUMN_LAYOUT.ORIGIN_X}px`;
    emptyEl.style.top = `${COLUMN_LAYOUT.ORIGIN_Y + 40}px`;
    kanbanBoard.appendChild(emptyEl);
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
    frame.style.setProperty('--board-color', board.color || '#6366f1');

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
      const colTasks = tasks.filter(t => t.columnId === col.id && taskMatchesFilters(t, filters));
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

function createCardElement(task) {
  const card = document.createElement('article');
  card.className = `kanban-card ${task.completed ? 'is-completed' : ''}`;
  card.dataset.taskId = task.id;

  const priorityLabels = {
    urgent: 'Urgente',
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
    note: 'Nota'
  };

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
        <span class="priority-badge priority-${task.priority || 'medium'}">
          ${priorityLabels[task.priority || 'medium']}
        </span>
      </div>
      <button class="card-menu-btn" title="Editar tarea" onclick="openTaskModal('${task.id}', null, event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
      </button>
    </div>

    <h4 class="card-title">${escapeHtml(task.title)}</h4>

    ${task.description ? `<p class="card-desc">${escapeHtml(task.description)}</p>` : ''}

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
          <span>${completedSubtasks}/${totalSubtasks} (${subtaskPercent}%)</span>
        </div>
        <div class="subtasks-progress-track">
          <div class="subtasks-progress-fill" style="width: ${subtaskPercent}%"></div>
        </div>
      </div>
    ` : ''}

    <div class="card-bottom">
      ${tagsHtml}
      ${dueDateHtml}
    </div>
  `;

  if (taskImages.length > 0) {
    const coverImg = card.querySelector('.card-cover img');
    getImageUrl(taskImages[0].id).then(url => { if (url) coverImg.src = url; });
  }

  // Clicking on card opens modal (unless check button or menu clicked)
  card.addEventListener('click', (e) => {
    if (!e.target.closest('button, input, select')) {
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

function deleteTag(tag) {
  const usage = projects.reduce((n, p) => n + (p.tasks || []).filter(t => (t.tags || []).some(x => x.toLowerCase() === tag.name.toLowerCase())).length, 0);
  const msg = usage > 0
    ? `¿Eliminar la etiqueta "${tag.name}"? Se quitará de ${usage} tarea(s).`
    : `¿Eliminar la etiqueta "${tag.name}"?`;
  if (!confirm(msg)) return;

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

window.openTaskModal = function(taskId = null, defaultColId = null, event = null) {
  if (event) event.stopPropagation();

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
    currentModalTags = [...(task.tags || [])];
    currentModalSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
    currentModalImages = JSON.parse(JSON.stringify(task.images || []));
    deleteTaskBtn.style.display = 'block';
    document.getElementById('sendTaskBtn').style.display = 'block';
  } else {
    modalTitle.textContent = 'Nueva Tarea';
    taskIdInput.value = '';
    taskTitleInput.value = '';
    taskDescInput.value = '';
    taskColumnSelect.value = defaultColId || defaultColumnForNewTask() || (columns[0] ? columns[0].id : '');
    taskPrioritySelect.value = 'medium';
    taskDueDate.value = '';
    setDueDateEnabled(false);
    currentModalTags = [];
    currentModalSubtasks = [];
    currentModalImages = [];
    deleteTaskBtn.style.display = 'none';
    document.getElementById('sendTaskBtn').style.display = 'none';
  }

  renderModalSubtasks();
  modalAddedImageIds = [];
  renderModalImages();
  tagSearchInput.value = '';
  setTagPanelOpen(false);
  renderTagPicker();
  taskModal.style.display = 'flex';
  // En el celular, al abrir una tarea existente no se enfoca el título: abriría el teclado y taparía la tarea.
  // Solo al crear una tarea nueva se enfoca para escribir de inmediato.
  const isTouchScreen = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (!(taskIdInput.value && isTouchScreen)) setTimeout(() => taskTitleInput.focus(), 60);
};

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
      if (isDoneColumn(colId)) task.completed = true;
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
      createdAt: Date.now()
    };
    tasks.unshift(newTask);
    showToast('Nueva tarea añadida', 'success');
  }

  modalAddedImageIds = []; // ya quedaron guardadas en la tarea
  persist();
  closeTaskModal();
  renderBoard();
});

// Delete Task
deleteTaskBtn.addEventListener('click', () => {
  const id = taskIdInput.value;
  if (!id) return;

  if (confirm('¿Estás seguro de que deseas eliminar esta tarea?')) {
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
  } else {
    columnModalTitle.textContent = 'Nueva Columna';
    columnIdInput.value = '';
    columnTitleInput.value = '';
    columnColorInput.value = PALETTE_COLORS[columns.length % PALETTE_COLORS.length];
    deleteColumnBtn.style.display = 'none';
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

deleteColumnBtn.addEventListener('click', () => {
  const id = columnIdInput.value;
  if (!id) return;

  const tasksInCol = tasks.filter(t => t.columnId === id);
  if (tasksInCol.length > 0) {
    if (!confirm(`La columna contiene ${tasksInCol.length} tarea(s). ¿Deseas eliminarla y descartar sus tareas?`)) {
      return;
    }
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
  projects.forEach(project => {
    const total = (project.tasks || []).length;
    const done = (project.tasks || []).filter(t => t.completed).length;
    const colCount = (project.columns || []).length;
    const isActive = project.id === active.id;

    const li = document.createElement('li');
    li.className = `project-item ${isActive ? 'is-active' : ''}`;
    li.innerHTML = `
      <button type="button" class="project-item-main" title="Abrir ${escapeHtml(project.name)}">
        <span class="project-dot" style="background-color: ${project.color || '#6366f1'}"></span>
        <span class="project-item-text">
          <span class="project-item-name">${escapeHtml(project.name)}</span>
          <span class="project-item-meta">${colCount} columna${colCount === 1 ? '' : 's'} · ${done}/${total} tareas</span>
        </span>
        ${isActive ? `<svg class="project-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
      </button>
      <button type="button" class="project-item-edit" title="Editar proyecto" aria-label="Editar ${escapeHtml(project.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
      </button>
    `;
    li.querySelector('.project-item-main').addEventListener('click', () => {
      switchProject(project.id);
      closeProjectMenu();
    });
    li.querySelector('.project-item-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      closeProjectMenu();
      openProjectModal(project.id);
    });
    projectList.appendChild(li);
  });
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
    projectTemplateGroup.style.display = '';
    projectTemplateSelect.value = 'basic';
    deleteProjectBtn.style.display = 'none';
  }

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

  if (id) {
    const project = projects.find(p => p.id === id);
    if (project) {
      project.name = name;
      project.color = color;
      showToast('Proyecto actualizado', 'info');
    }
    persist();
    renderProjectSwitcher();
    renderBoard();
  } else {
    const template = PROJECT_TEMPLATES[projectTemplateSelect.value] || [];
    const newProject = {
      id: generateId('proj'),
      name: name,
      color: color,
      columns: deepClone(template),
      tasks: [],
      createdAt: Date.now()
    };
    projects.push(newProject);
    persist();
    switchProject(newProject.id);
    showToast(`Proyecto "${name}" creado`, 'success');
  }

  closeProjectModal();
});

deleteProjectBtn.addEventListener('click', () => {
  const id = projectIdInput.value;
  if (!id || projects.length <= 1) return;

  const project = projects.find(p => p.id === id);
  if (!project) return;
  const taskCount = (project.tasks || []).length;
  const msg = taskCount > 0
    ? `¿Eliminar el proyecto "${project.name}" con sus ${taskCount} tarea(s)? Esta acción no se puede deshacer.`
    : `¿Eliminar el proyecto "${project.name}"?`;
  if (!confirm(msg)) return;

  (project.bgImages || []).forEach(img => ImageStore.del(img.id));
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
      const used = new Set();
      projects.forEach(p => {
        (p.bgImages || []).forEach(i => used.add(i.id));
        (p.tasks || []).forEach(t => (t.images || []).forEach(i => used.add(i.id)));
      });
      const all = await this.keys();
      for (const k of all || []) if (!used.has(k)) await this.purge(k);
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

async function addBgImageFromFile(file, clientX = null, clientY = null) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    const { id, w, h } = await storeImageFile(file);

    // Tamaño inicial: como máximo 600px de ancho en el lienzo
    const width = Math.min(600, w);
    const height = Math.round(width * (h / w));
    let center;
    if (clientX !== null) {
      center = screenToCanvas(clientX, clientY);
    } else {
      const rect = viewportArea.getBoundingClientRect();
      center = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    getBgImages().push({ id, x: Math.round(center.x - width / 2), y: Math.round(center.y - height / 2), w: width, h: height });
    persist();
    selection = new Set([`img:${id}`]);
    renderBgImages();
    showToast('Imagen agregada al fondo. Arrástrala para moverla y usa la esquina para escalarla.', 'success');
  } catch (err) {
    console.error(err);
    showToast('No se pudo agregar la imagen', 'warning');
  }
}

function deleteBgImage(id) {
  const project = getActiveProject();
  project.bgImages = getBgImages().filter(img => img.id !== id);
  ImageStore.del(id);
  const url = bgImageUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  bgImageUrls.delete(id);
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
    imgEl.style.opacity = typeof data.opacity === 'number' ? data.opacity : 1;
    const cached = bgImageUrls.get(data.id);
    if (cached) {
      imgEl.src = cached;
    } else {
      ImageStore.get(data.id).then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        bgImageUrls.set(data.id, url);
        imgEl.src = url;
      }).catch(() => {});
    }

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

function transferBgImageToTask(imageId, taskId) {
  const task = tasks.find(t => t.id === taskId);
  const project = getActiveProject();
  const img = getBgImages().find(i => i.id === imageId);
  if (!task || !img) return;
  project.bgImages = getBgImages().filter(i => i.id !== imageId);
  task.images = task.images || [];
  task.images.push({ id: img.id, w: img.w, h: img.h });
  selection.delete(`img:${imageId}`);
  persist();
  renderBgImages();
  renderBoard();
  showToast(`Imagen movida a la tarea "${task.title.substring(0, 28)}"`, 'success');
}

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
    getImageUrl(img.id).then(url => { if (url) imgEl.src = url; });
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
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => f.type.startsWith('image/'));
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
const SVG_NS = 'http://www.w3.org/2000/svg';

const PEN_COLORS = ['#f8fafc', '#0f172a', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];
const PEN_SIZES = [2, 4, 8, 14];
const PEN_PREFS_KEY = 'zenban_pen_prefs_v1';

let currentTool = 'select';
let penPrefs = loadData(PEN_PREFS_KEY, { color: '#f43f5e', size: 4 });
const undoStack = [];

function isDrawingTool() {
  return currentTool === 'pen' || currentTool === 'eraser';
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
  penOptions.hidden = tool !== 'pen';

  if (isDrawingTool() && selection.size) setSelection([]);
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

function createStrokeEl(stroke) {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', strokeToPath(stroke.points));
  path.setAttribute('stroke', stroke.color);
  path.setAttribute('stroke-width', stroke.size);
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

function eraseAt(clientX, clientY) {
  const p = screenToCanvas(clientX, clientY);
  const radius = 10 / zoom;
  const drawings = getDrawings();
  for (let i = drawings.length - 1; i >= 0; i--) {
    const stroke = drawings[i];
    const reach = radius + stroke.size / 2;
    const hit = stroke.points.some(([x, y]) => Math.hypot(x - p.x, y - p.y) <= reach);
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

  if (currentTool === 'pen') {
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
  if (currentTool === 'pen' && activeStroke) {
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

function clearDrawings() {
  const drawings = getDrawings();
  if (drawings.length === 0) {
    showToast('No hay dibujos en este proyecto', 'info');
    return;
  }
  if (!confirm(`¿Borrar los ${drawings.length} trazo(s) dibujados en este proyecto?`)) return;
  undoStack.push({ type: 'clear', strokes: drawings.slice() });
  getActiveProject().drawings = [];
  persist();
  renderDrawings();
  showToast('Dibujos borrados (Ctrl+Z para recuperarlos)', 'warning');
}

toolbox.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
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
  const map = { v: 'select', p: 'pen', e: 'eraser', h: 'hand', t: 'text' };
  const tool = map[e.key.toLowerCase()];
  if (tool) setTool(tool);
});

renderPenOptions();

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

window.openBoardModal = function(boardId = null) {
  ensureBoards();
  if (boardId) {
    const board = boards.find(b => b.id === boardId);
    if (!board) return;
    boardModalTitle.textContent = 'Editar Tablero';
    boardIdInput.value = board.id;
    boardTitleInput.value = board.title;
    boardColorInput.value = board.color || '#6366f1';
    boardTemplateGroup.style.display = 'none';
    deleteBoardBtn.style.display = 'block';
  } else {
    boardModalTitle.textContent = 'Nuevo Tablero';
    boardIdInput.value = '';
    boardTitleInput.value = '';
    boardColorInput.value = PALETTE_COLORS[boards.length % PALETTE_COLORS.length];
    boardTemplateGroup.style.display = '';
    boardTemplateSelect.value = 'basic';
    deleteBoardBtn.style.display = 'none';
  }
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

deleteBoardBtn.addEventListener('click', () => {
  const id = boardIdInput.value;
  const board = boards.find(b => b.id === id);
  if (!board) return;
  const colIds = columns.filter(c => c.boardId === id).map(c => c.id);
  const taskCount = tasks.filter(t => colIds.includes(t.columnId)).length;
  const msg = taskCount > 0
    ? `¿Eliminar el tablero "${board.title}" con sus ${colIds.length} columna(s) y ${taskCount} tarea(s)? No se puede deshacer.`
    : `¿Eliminar el tablero "${board.title}"?`;
  if (!confirm(msg)) return;

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
    extend(b.x, b.y, el ? el.offsetWidth : 600, el ? el.offsetHeight : 300);
  });
  getBgImages().forEach(i => extend(i.x, i.y, i.w, i.h));
  getTexts().forEach(t => {
    const el = getTextEl(t.id);
    extend(t.x, t.y, el ? el.offsetWidth : t.w, el ? el.offsetHeight : t.size * 1.3);
  });
  getDrawings().forEach(s => s.points.forEach(([x, y]) => extend(x, y, 0, 0)));
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 500, maxY: 300 };
  return { minX, minY, maxX, maxY };
}

// ----- Selección -----
let selection = new Set();
let selectGestureActive = false;

function applySelectionVisuals() {
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
  selection = new Set(keys);
  applySelectionVisuals();
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
    const pts = s.points;
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
  const brds = boards.filter(b => selection.has(`board:${b.id}`)).map(b => ({ b, el: getBoardEl(b.id), x: b.x, y: b.y }));
  const strokes = getDrawings().filter(s => selection.has(`stroke:${s.id}`)).map(s => ({ s, el: drawLayer.querySelector(`[data-stroke-id="${s.id}"]`) }));
  const imgs = getBgImages().filter(i => selection.has(`img:${i.id}`)).map(i => ({ i, el: bgImageLayer.querySelector(`.bg-image[data-image-id="${i.id}"]`), x: i.x, y: i.y }));
  const txts = getTexts().filter(t => selection.has(`text:${t.id}`)).map(t => ({ t, el: getTextEl(t.id), x: t.x, y: t.y }));
  const singleImg = selection.size === 1 && imgs.length === 1 ? imgs[0] : null;
  let moved = false, dx = 0, dy = 0, targetCard = null;

  selectGestureActive = true;
  viewportArea.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
    if (!moved) brds.forEach(o => o.el && o.el.classList.add('is-moving'));
    moved = true;
    dx = (ev.clientX - startX) / zoom;
    dy = (ev.clientY - startY) / zoom;
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
    if (singleImg) {
      targetCard = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => n.classList && n.classList.contains('kanban-card')) || null;
      highlightDropCard(targetCard);
      if (singleImg.el) singleImg.el.classList.toggle('is-over-card', !!targetCard);
    }
  };

  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
    selectGestureActive = false;
    cancelSelectGesture = null;
    brds.forEach(o => o.el && o.el.classList.remove('is-moving'));
    highlightDropCard(null);
    if (!moved) return;

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
    selectGestureActive = false;
    brds.forEach(o => {
      o.b.x = o.x; o.b.y = o.y;
      if (o.el) { o.el.classList.remove('is-moving'); o.el.style.left = `${o.x}px`; o.el.style.top = `${o.y}px`; }
    });
    strokes.forEach(o => o.el && o.el.removeAttribute('transform'));
    imgs.forEach(o => { o.i.x = o.x; o.i.y = o.y; if (o.el) { o.el.style.left = `${o.x}px`; o.el.style.top = `${o.y}px`; } });
    txts.forEach(o => { o.t.x = o.x; o.t.y = o.y; if (o.el) { o.el.style.left = `${o.x}px`; o.el.style.top = `${o.y}px`; } });
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

  selectGestureActive = true;
  viewportArea.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      ghost = colEl.cloneNode(true);
      ghost.classList.add('column-drag-ghost');
      ghost.style.width = `${rect.width}px`;
      ghost.style.transform = `scale(${Math.min(1, zoom)})`;
      document.body.appendChild(ghost);
      colEl.classList.add('is-dragging-column');
      placeholder = document.createElement('div');
      placeholder.className = 'column-drop-placeholder';
    }
    ghost.style.left = `${ev.clientX - offX * Math.min(1, zoom)}px`;
    ghost.style.top = `${ev.clientY - offY * Math.min(1, zoom)}px`;

    const under = document.elementsFromPoint(ev.clientX, ev.clientY);
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
      if (ev.clientX < r.left + r.width / 2) { before = sib; break; }
    }
    container.insertBefore(placeholder, before || container.querySelector('.add-column-tile'));
    target = { boardId: frame.dataset.boardId, beforeColId: before ? before.dataset.columnId : null };
  };

  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    viewportArea.removeEventListener('pointermove', onMove);
    viewportArea.removeEventListener('pointerup', onUp);
    viewportArea.removeEventListener('pointercancel', onUp);
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
    if (el && overlaps(b.x, b.y, el.offsetWidth, el.offsetHeight)) keys.push(`board:${b.id}`);
  });
  getBgImages().forEach(i => { if (overlaps(i.x, i.y, i.w, i.h)) keys.push(`img:${i.id}`); });
  getTexts().forEach(t => {
    const el = getTextEl(t.id);
    if (el && overlaps(t.x, t.y, el.offsetWidth, el.offsetHeight)) keys.push(`text:${t.id}`);
  });
  getDrawings().forEach(s => {
    if (s.points.some(([x, y]) => x >= x1 && x <= x2 && y >= y1 && y <= y2)) keys.push(`stroke:${s.id}`);
  });
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
    selection = new Set([...base, ...itemsInRect(a.x, a.y, b.x, b.y)]);
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
  el.style.width = 'max-content';
  el.style.maxWidth = `${t.w}px`;
  el.style.fontSize = `${t.size}px`;
  el.style.color = t.color || '';
}

// Crea un texto en un punto del lienzo (o al centro de la vista). Sin contenido, se abre para escribir.
function addText(content = '', at = null) {
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
    text: content.replace(/\r\n/g, '\n').replace(/\s+$/, '')
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
    el.textContent = t.text;
    const handle = document.createElement('div');
    handle.className = 'canvas-text-handle';
    handle.title = 'Arrastra para agrandar o achicar';
    handle.addEventListener('pointerdown', (e) => startTextResize(e, t, el));
    el.appendChild(handle);
    textLayer.appendChild(el);
  });
  applySelectionVisuals();
}

// Agrandar o achicar arrastrando la esquina: escala la letra y el ancho juntos
function startTextResize(e, t, el) {
  if (isPanModeActive || isSpacePressed || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  setSelection([`text:${t.id}`]);
  const startX = e.clientX;
  const startWidth = el.offsetWidth;
  const orig = { w: t.w, size: t.size };
  el.setPointerCapture(e.pointerId);
  const onMove = (ev) => {
    const factor = Math.max(0.1, (startWidth + (ev.clientX - startX) / zoom) / startWidth);
    t.size = Math.max(4, +(orig.size * factor).toFixed(1));
    t.w = Math.max(40, Math.round(orig.w * factor));
    applyTextStyle(el, t);
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

function scaleSelectedTexts(factor) {
  selectedTexts().forEach(t => {
    t.size = Math.max(4, +(t.size * factor).toFixed(1));
    t.w = Math.max(40, Math.round(t.w * factor));
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
  const under = document.elementsFromPoint(e.clientX, e.clientY);
  const textEl = under.find(n => n.classList && n.classList.contains('canvas-text'));
  if (textEl) {
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
document.getElementById('ctxTextBigger').addEventListener('click', () => scaleSelectedTexts(1.2));
document.getElementById('ctxTextSmaller').addEventListener('click', () => scaleSelectedTexts(1 / 1.2));
ctxTextColor.addEventListener('input', () => {
  selectedTexts().forEach(t => {
    t.color = ctxTextColor.value;
    const el = getTextEl(t.id);
    if (el) el.style.color = t.color;
  });
  ctxDot.style.background = ctxTextColor.value;
});
ctxTextColor.addEventListener('change', () => persist());

// Herramienta Seleccionar (botón izquierdo): decide qué se toma con cada clic
viewportArea.addEventListener('pointerdown', (e) => {
  if (currentTool !== 'select' || isSpacePressed || isPanModeActive || e.button !== 0) return;
  if (e.pointerType === 'touch' && !e.isPrimary) return; // segundo dedo: es para mover el lienzo
  const t = e.target;
  if (t.closest('.toolbox, .zoom-hud, .mobile-fab, .bg-image-handle, .bg-image-toolbar, .canvas-text-handle')) return;
  if (t.closest('button, input, select, textarea, a, label')) return;

  let key = null;
  const strokeId = hitStroke(e.clientX, e.clientY);
  if (strokeId) {
    key = `stroke:${strokeId}`;
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
  }

  if (key) {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      if (selection.has(key)) {
        selection.delete(key);
        applySelectionVisuals();
        return;
      }
      selection.add(key);
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
  show('common', ['image', 'stroke', 'text', 'multi'].includes(ctx.type));
  contextBar.dataset.ctx = ctx.type;

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
  } else if (ctx.type === 'stroke') {
    ctxTitle.textContent = ctx.count === 1 ? 'Trazo' : `${ctx.count} trazos`;
    const first = selectedStrokes()[0];
    if (first) {
      ctxStrokeColor.value = first.color;
      ctxDot.style.background = first.color;
      const screenSize = first.size * zoom;
      ctxStrokeSize.value = String([2, 4, 8, 14].reduce((best, v) => Math.abs(v - screenSize) < Math.abs(best - screenSize) ? v : best, 4));
    }
  } else if (ctx.type === 'text') {
    ctxTitle.textContent = ctx.count === 1 ? 'Texto' : `${ctx.count} textos`;
    const first = selectedTexts()[0];
    const el = first && getTextEl(first.id);
    const color = first && first.color ? first.color : (el ? rgbToHex(getComputedStyle(el).color) : '#f8fafc');
    ctxTextColor.value = color;
    ctxDot.style.background = color;
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
  return data;
}

function hasSelectionContent(data) {
  return data.boards.length + data.strokes.length + data.images.length + (data.texts || []).length > 0;
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
  for (const b of data.boards) {
    const nb = deepClone(b);
    nb.id = generateId('board');
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
    const ns = deepClone(st);
    ns.id = generateId('stroke');
    ns.points = ns.points.map(([x, y]) => [+(x + offset).toFixed(1), +(y + offsetY).toFixed(1)]);
    getDrawings().push(ns);
    undoStack.push({ type: 'add', stroke: ns });
    newKeys.push(`stroke:${ns.id}`);
  });
  for (const img of data.images) {
    const newId = await copyImageBlob(img.id);
    if (!newId) continue;
    const ni = { ...deepClone(img), id: newId, x: img.x + offset, y: img.y + offsetY };
    getBgImages().push(ni);
    newKeys.push(`img:${newId}`);
  }
  (data.texts || []).forEach(t => {
    const nt = { ...deepClone(t), id: generateId('text'), x: t.x + offset, y: t.y + offsetY };
    getTexts().push(nt);
    newKeys.push(`text:${nt.id}`);
  });
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
function deleteSelection({ skipConfirm = false } = {}) {
  const strokeIds = selectedStrokes().map(s => s.id);
  const imageIds = selectedImages().map(i => i.id);
  const textIds = selectedTexts().map(t => t.id);
  const boardIds = boards.filter(b => selection.has(`board:${b.id}`)).map(b => b.id);

  if (boardIds.length && !skipConfirm) {
    const colIds = columns.filter(c => boardIds.includes(c.boardId)).map(c => c.id);
    const n = tasks.filter(t => colIds.includes(t.columnId)).length;
    if (!confirm(`¿Eliminar ${boardIds.length} tablero(s) con ${colIds.length} columna(s) y ${n} tarea(s)?`)) return false;
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
    project.bgImages = getBgImages().filter(img => img.id !== id);
    if (!skipConfirm) ImageStore.del(id); // al cortar, la imagen sigue disponible para pegar
  });
  if (textIds.length) getActiveProject().texts = getTexts().filter(t => !textIds.includes(t.id));
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
  if (first) openLightbox(first.id);
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
    if (el) el.setAttribute('stroke-width', size);
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

  canvasMenu.hidden = false;
  const w = canvasMenu.offsetWidth;
  const h = canvasMenu.offsetHeight;
  canvasMenu.style.left = `${Math.min(clientX, window.innerWidth - w - 8)}px`;
  canvasMenu.style.top = `${Math.min(clientY, window.innerHeight - h - 8)}px`;
}

function closeCanvasMenu() {
  canvasMenu.hidden = true;
}

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
  CLIENT_ID: 'zenban_google_client_id',
  STATE: 'zenban_oauth_state'
};
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
  if (SYNC.token) scheduleSync(2500);
  else setSyncStatus('pending');
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
  pending: 'Hay cambios sin subir. Toca tu foto para reconectar.',
  expired: 'La sesión de Google expiró. Toca tu foto para reconectar.',
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
}

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
  SYNC.token = null;
  SYNC.fileId = null;
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

function setSpace(space) {
  localStorage.setItem('zenban_space', JSON.stringify(space));
  SYNC.fileId = null;
  SYNC.imageFiles = null;
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
    SYNC.token = null;
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
  const tombs = new Map();
  [...(remote.deletedProjects || []), ...(local.deletedProjects || [])].forEach(t => {
    if (!tombs.has(t.id) || tombs.get(t.id) < t.at) tombs.set(t.id, t.at);
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

  return {
    version: 1,
    projects: merged.filter(p => !tombs.has(p.id) || (p.updatedAt || 0) > tombs.get(p.id)),
    tags: mergeTags(local.tags, remote.tags, base ? base.tags : null),
    deletedProjects: [...tombs.entries()].map(([id, at]) => ({ id, at }))
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
  SYNC.busy = true;
  setSyncStatus('syncing');
  try {
    const gen = SYNC.gen;
    if (inShared() && typeof checkSharedFolder === 'function' && !(await checkSharedFolder())) return;
    const file = await findDataFile();
    SYNC.fileId = file ? file.id : null;
    const remote = file ? await (await driveFetch(`${DRIVE_API}/files/${file.id}?alt=media&supportsAllDrives=true`)).json() : null;
    const local = localPayload();

    let result = local;
    if (remote && Array.isArray(remote.projects) && remote.projects.length) {
      if (lastSyncedAt() === 0) {
        // Primera vez con estos datos en este dispositivo: nunca se pisa nada sin preguntar
        const where = inShared() ? `la carpeta compartida "${currentSpace().folderName || 'ZenBan'}"` : 'tu Google Drive';
        const useDrive = confirm(`Ya hay datos de ZenBan en ${where}.\n\nAceptar: usar esos datos en este dispositivo (lo que hay aquí se reemplaza).\nCancelar: combinar esos datos con lo que hay en este dispositivo (no se pierde nada).`);
        result = useDrive ? dataPart(remote) : mergePayloads(local, remote, null);
      } else {
        const base = await SyncBase.get();
        // Sin copia de la última sincronización y sin cambios aquí: Drive manda (evita revivir lo borrado en otro lado)
        result = !base && !isDirty() ? dataPart(remote) : mergePayloads(local, remote, base);
      }
    }

    // Si hubo cambios aquí mientras se descargaba, se vuelve a empezar para no perderlos
    if (SYNC.gen !== gen) {
      SYNC.again = true;
      return;
    }

    if (!sameJson(dataPart(result), dataPart(local))) applyPayload(result);
    else localStorage.setItem(SYNC_KEYS.DELETED, JSON.stringify(result.deletedProjects || []));

    if (!remote || !sameJson(dataPart(result), dataPart(remote))) {
      // Si otra persona guardó mientras tanto, se vuelve a combinar antes de subir para no pisar su cambio
      if (file) {
        const now = await (await driveFetch(`${DRIVE_API}/files/${file.id}?fields=version&supportsAllDrives=true`)).json();
        if (String(now.version) !== String(file.version)) {
          SYNC.again = true;
          return;
        }
      }
      const data = { ...dataPart(result), version: 1, savedAt: Date.now() };
      SYNC.fileId = await driveUpload(DATA_FILE_NAME, new Blob([JSON.stringify(data)], { type: 'application/json' }), SYNC.fileId);
    }
    await SyncBase.set(dataPart(result));
    localStorage.setItem(SYNC_KEYS.LAST, String(Date.now()));
    if (SYNC.gen === gen) setDirty(false);

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

function referencedImageIds() {
  const ids = new Set();
  projects.forEach(p => {
    (p.bgImages || []).forEach(i => ids.add(i.id));
    (p.tasks || []).forEach(t => (t.images || []).forEach(i => ids.add(i.id)));
  });
  return ids;
}

// Sube las imágenes nuevas y descarga las que falten en este dispositivo
async function syncImages() {
  const ids = referencedImageIds();
  if (ids.size === 0) return;
  if (!SYNC.imageFiles) SYNC.imageFiles = await listDriveImages();
  let downloaded = 0;
  for (const id of ids) {
    const local = await ImageStore.get(id).catch(() => null);
    if (local && !SYNC.imageFiles.has(id)) {
      SYNC.imageFiles.set(id, await driveUpload(id, local));
    } else if (!local && SYNC.imageFiles.has(id)) {
      const r = await driveFetch(`${DRIVE_API}/files/${SYNC.imageFiles.get(id)}?alt=media&supportsAllDrives=true`);
      await ImageStore.put(id, await r.blob());
      downloaded++;
    }
  }
  if (downloaded) {
    renderBgImages();
    renderBoard();
  }
}

// ----- Eventos -----
googleSignInBtn.addEventListener('click', signInWithGoogle);
accountChip.addEventListener('click', (e) => {
  e.stopPropagation();
  // Sin sesión activa: el clic reconecta directamente
  if (!SYNC.token || Date.now() > SYNC.tokenExp) {
    signInWithGoogle();
    return;
  }
  accountMenu.hidden = !accountMenu.hidden;
});
document.addEventListener('click', (e) => {
  if (!accountMenu.hidden && !e.target.closest('#accountArea')) accountMenu.hidden = true;
});
document.getElementById('syncNowBtn').addEventListener('click', () => {
  accountMenu.hidden = true;
  syncNow();
});
document.getElementById('signOutBtn').addEventListener('click', () => {
  accountMenu.hidden = true;
  signOutGoogle();
});

// Traer cambios de otros dispositivos al volver a la app y cada cierto tiempo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && SYNC.token) syncNow();
});
window.addEventListener('online', () => { if (SYNC.token) syncNow(); });
// Con datos compartidos se revisan los cambios de los demás cada 15 segundos; si no, cada 45
let lastPoll = 0;
setInterval(() => {
  if (!SYNC.token || document.visibilityState !== 'visible') return;
  if (Date.now() - lastPoll < (inShared() ? 15000 : 45000)) return;
  lastPoll = Date.now();
  syncNow();
}, 5000);

// ----- Versión de la app (abajo a la derecha) -----
// Al publicar cambios, subir APP_VERSION junto con CACHE_NAME de sw.js y los ?v= de index.html
const APP_VERSION = '47';
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
});
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
  settingToolsAutoHide.checked = !!appSettings.toolsAutoHide;
  settingToolsOpacity.value = String(appSettings.toolsHiddenOpacity);
  syncToolsOpacityField();
  settingsModal.style.display = 'flex';
}

function closeSettings() {
  settingsModal.style.display = 'none';
  applyToolsAutoHide(); // deshace la vista previa si se canceló
}

// ----- Esconder las herramientas (barra lateral y barra de zoom) cuando no se usan -----
const settingToolsAutoHide = document.getElementById('settingToolsAutoHide');
const settingToolsOpacity = document.getElementById('settingToolsOpacity');
const settingToolsOpacityValue = document.getElementById('settingToolsOpacityValue');
const autoHideBars = [toolbox, document.getElementById('zoomHud')];
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

refreshAutoHide();

document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
// Recargar: útil en la app instalada del celular, que no tiene botón de recargar del navegador.
// Los datos ya están guardados en el dispositivo, así que no se pierde nada.
document.getElementById('reloadAppBtn').addEventListener('click', () => {
  brandVersion.hidden = true;
  if (editingTextId) finishTextEdit();
  location.reload();
});
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettings);
document.getElementById('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  appSettings.zoomMin = Number(settingZoomMin.value) || DEFAULT_SETTINGS.zoomMin;
  appSettings.toolsAutoHide = settingToolsAutoHide.checked;
  appSettings.toolsHiddenOpacity = Number(settingToolsOpacity.value);
  saveData(SETTINGS_KEY, appSettings);
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

renderAccount();
renderAppVersion();
const redirectedToken = consumeRedirectToken();
if (redirectedToken) onTokenResponse(redirectedToken);

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

