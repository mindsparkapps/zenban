// ===== ZenBan - Enviar objetos entre tus datos personales y los datos compartidos =====
// Desde la barra de acciones (tableros, imágenes, textos, trazos o una selección) o desde una tarea,
// se elige el espacio y el proyecto de destino y si se mueve (se quita de aquí) o se copia (queda en ambos).
// Se escribe directamente en el zenban-data.json del otro espacio en Drive, con control de versión,
// y las imágenes se copian a la carpeta de ese espacio. Funciona en ambas direcciones.

const XFER_BASIC_COLUMNS = [
  { id: 'todo', title: 'Por hacer', color: '#6366f1' },
  { id: 'in_progress', title: 'En progreso', color: '#f59e0b' },
  { id: 'done', title: 'Completadas', color: '#10b981' }
];

// ----- Espacios -----
function xferSpaceKey(s) {
  return s.mode === 'shared' ? s.folderId : 'personal';
}

function xferHere() {
  return inShared() ? currentSpace() : { mode: 'personal' };
}

function xferSpaceLabel(s) {
  if (s.mode !== 'shared') return 'Datos personales';
  return `Datos compartidos "${s.folderName || 'ZenBan'}"${s.ownerName && !s.ownedByMe ? ` (de ${s.ownerName})` : ''}`;
}

async function xferDestinations() {
  const list = [{ mode: 'personal' }];
  (await findSharedSpaces()).forEach(f => {
    const owner = (f.owners && f.owners[0]) || {};
    list.push({ mode: 'shared', folderId: f.id, folderName: f.name, ownedByMe: !!f.ownedByMe, ownerName: owner.displayName || owner.emailAddress || '' });
  });
  const here = xferSpaceKey(xferHere());
  return list.filter(s => xferSpaceKey(s) !== here);
}

function xferQuery(space, cond) {
  if (space.mode === 'shared') {
    const q = `'${space.folderId}' in parents and trashed=false and ${cond}`;
    return `q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  }
  return `spaces=appDataFolder&q=${encodeURIComponent(cond)}`;
}

function xferParent(space) {
  return space.mode === 'shared' ? space.folderId : 'appDataFolder';
}

// ----- Drive del otro espacio -----
async function xferReadFile(space) {
  const r = await driveFetch(`${DRIVE_API}/files?${xferQuery(space, `name='${DATA_FILE_NAME}'`)}&orderBy=createdTime&fields=files(id,version)`);
  const file = ((await r.json()).files || [])[0] || null;
  if (!file) return { file: null, data: { version: 1, projects: [], tags: [], deletedProjects: [] } };
  const data = await (await driveFetch(`${DRIVE_API}/files/${file.id}?alt=media&supportsAllDrives=true`)).json();
  if (!data || !Array.isArray(data.projects)) throw new Error('formato');
  return { file, data };
}

async function xferUpload(space, name, blob) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [xferParent(space)] })], { type: 'application/json' }));
  form.append('file', blob);
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', body: form });
  return (await r.json()).id;
}

// Lee, modifica y guarda. Si alguien guardó entre medio, vuelve a leer y reaplica (hasta 3 reintentos).
async function xferWrite(space, mutate) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { file, data } = await xferReadFile(space);
    const result = mutate(data);
    data.savedAt = Date.now();
    const body = new Blob([JSON.stringify(data)], { type: 'application/json' });
    if (file) {
      const now = await (await driveFetch(`${DRIVE_API}/files/${file.id}?fields=version&supportsAllDrives=true`)).json();
      if (String(now.version) !== String(file.version)) continue;
      await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', body });
    } else {
      await xferUpload(space, DATA_FILE_NAME, body);
    }
    return result;
  }
  throw new Error('conflicto');
}

// Blob de una imagen: del dispositivo o, si no está descargada, de Drive del espacio actual
async function xferImageBlob(id) {
  const local = await ImageStore.get(id).catch(() => null);
  if (local) return local;
  if (!SYNC.imageFiles) SYNC.imageFiles = await listDriveImages();
  const fileId = SYNC.imageFiles.get(id);
  if (!fileId) return null;
  return (await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`)).blob();
}

// ----- Qué se envía -----
function xferRand() {
  return Math.random().toString(36).substr(2, 5);
}

function xferColumnId(oldId) {
  if (isDoneColumn(oldId)) return `done-${xferRand()}`;
  if (oldId === 'todo' || String(oldId).startsWith('todo-')) return `todo-${xferRand()}`;
  if (oldId === 'in_progress' || String(oldId).startsWith('in_progress-')) return `in_progress-${xferRand()}`;
  return generateId('col');
}

// Lo seleccionado en el lienzo (o el tablero enfocado si no hay selección)
function xferSelectionPayload() {
  if (selection.size) return collectSelection();
  const ctx = getContext();
  if (ctx.type !== 'board') return null;
  const b = boards.find(x => x.id === ctx.boardId);
  if (!b) return null;
  const cols = columns.filter(c => c.boardId === b.id);
  return {
    boards: [deepClone(b)],
    columns: deepClone(cols),
    tasks: deepClone(tasks.filter(t => cols.some(c => c.id === t.columnId))),
    strokes: [], images: [], texts: []
  };
}

function xferSummary(p) {
  if (p.task) return `la tarea "${p.task.title}"`;
  const parts = [];
  if (p.boards.length) parts.push(`${p.boards.length} tablero(s) con ${p.columns.length} columna(s) y ${p.tasks.length} tarea(s)`);
  if (p.images.length) parts.push(`${p.images.length} imagen(es)`);
  if ((p.texts || []).length) parts.push(`${p.texts.length} texto(s)`);
  if (p.strokes.length) parts.push(`${p.strokes.length} trazo(s)`);
  if ((p.frames || []).length) parts.push(`${p.frames.length} frame(s)`);
  return parts.join(', ');
}

// Límites del contenido de un proyecto (formato guardado) para ubicar lo nuevo a la derecha
function xferBounds(project) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity;
  const ext = (x, y, w) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); };
  (project.boards || []).forEach(b => {
    const n = (project.columns || []).filter(c => c.boardId === b.id).length;
    ext(b.x || 0, b.y || 0, Math.max(1, n) * 354 + 48);
  });
  (project.bgImages || []).forEach(i => ext(i.x || 0, i.y || 0, i.w || 0));
  (project.texts || []).forEach(t => ext(t.x || 0, t.y || 0, t.w || 0));
  (project.drawings || []).forEach(s => (s.points || []).forEach(([x, y]) => ext(x, y, 0)));
  return minX === Infinity ? null : { minX, minY, maxX };
}

function xferSourceBounds(p) {
  let minX = Infinity, minY = Infinity;
  const ext = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); };
  p.boards.forEach(b => ext(b.x || 0, b.y || 0));
  p.images.forEach(i => ext(i.x || 0, i.y || 0));
  (p.texts || []).forEach(t => ext(t.x || 0, t.y || 0));
  p.strokes.forEach(s => (s.points || []).forEach(([x, y]) => ext(x, y)));
  (p.frames || []).forEach(fr => ext(fr.x || 0, fr.y || 0));
  return minX === Infinity ? { minX: 0, minY: 0 } : { minX, minY };
}

function xferNewProject(name, color, withBoard) {
  const project = { id: generateId('proj'), name, color: color || '#6366f1', columns: [], tasks: [], boards: [], createdAt: Date.now() };
  if (withBoard) {
    const board = { id: generateId('board'), title: 'Tablero principal', color: '#6366f1', x: 40, y: 32, filters: { q: '', priority: 'all', tag: 'all' } };
    const s = xferRand();
    project.boards.push(board);
    XFER_BASIC_COLUMNS.forEach(c => project.columns.push({ id: `${c.id}-${s}`, title: c.title, color: c.color, boardId: board.id }));
  }
  return project;
}

// Copia de cada tarea con id nuevo; sus imágenes se suben con ids nuevos
function xferCloneTask(t, columnId, uploads) {
  const nt = deepClone(t);
  nt.id = generateId('task');
  nt.columnId = columnId;
  nt.images = (t.images || []).map(img => {
    const newId = generateId('img');
    uploads.push({ oldId: img.id, newId });
    return { ...img, id: newId };
  });
  return nt;
}

// Prepara los objetos para el destino (ids nuevos) y la lista de imágenes a subir
function xferBuild(p) {
  const uploads = [];
  const colMap = {};
  // Clave original → clave nueva (para que las flechas unan los objetos enviados)
  const keyMap = {};
  const out = { boards: [], columns: [], tasks: [], images: [], texts: [], strokes: [], uploads };
  p.boards.forEach(b => {
    const nb = deepClone(b);
    nb.id = generateId('board');
    keyMap[`board:${b.id}`] = `board:${nb.id}`;
    out.boards.push({ nb, oldId: b.id });
  });
  p.columns.forEach(c => {
    const nc = deepClone(c);
    nc.id = xferColumnId(c.id);
    colMap[c.id] = nc.id;
    const board = out.boards.find(x => x.oldId === c.boardId);
    nc.boardId = board ? board.nb.id : nc.boardId;
    out.columns.push(nc);
  });
  out.boards = out.boards.map(x => x.nb);
  p.tasks.forEach(t => { if (colMap[t.columnId]) out.tasks.push(xferCloneTask(t, colMap[t.columnId], uploads)); });
  p.images.forEach(i => {
    const newId = generateId('img');
    // Una imagen que usa un archivo compartido (src, de la Biblioteca) se lleva una copia de ese archivo
    uploads.push({ oldId: i.src || i.id, newId });
    const ni = { ...deepClone(i), id: newId };
    delete ni.src;
    out.images.push(ni);
    keyMap[`img:${i.id}`] = `img:${newId}`;
  });
  (p.texts || []).forEach(t => {
    const id = generateId('text');
    keyMap[`text:${t.id}`] = `text:${id}`;
    out.texts.push({ ...deepClone(t), id });
  });
  p.strokes.forEach(s => out.strokes.push({ ...deepClone(s), id: generateId('stroke') }));
  // Frames (con ids nuevos) y las flechas entre los objetos enviados
  out.frames = (p.frames || []).map(f => {
    const nf = { ...deepClone(f), id: generateId('frame') };
    keyMap[`frame:${f.id}`] = `frame:${nf.id}`;
    // Su imagen de pestaña también viaja (con id nuevo)
    if (f.image && !isRemoteImage(f.image)) {
      const newId = generateId('img');
      uploads.push({ oldId: f.image, newId });
      nf.image = newId;
    }
    return nf;
  });
  const mapKey = (ref) => keyMap[endpointKey(ref)];
  out.connectors = (p.connectors || []).filter(c => mapKey(c.from) && mapKey(c.to))
    .map(c => ({ ...deepClone(c), id: generateId('conn'), from: mapKey(c.from), to: mapKey(c.to) }));
  return out;
}

function xferEnsureTags(data, taskList) {
  data.tags = Array.isArray(data.tags) ? data.tags : [];
  taskList.forEach(t => (t.tags || []).forEach(name => {
    if (data.tags.some(x => String(x.name).toLowerCase() === String(name).toLowerCase())) return;
    const src = tagLibrary.find(x => String(x.name).toLowerCase() === String(name).toLowerCase());
    data.tags.push({ id: generateId('tag'), name, color: src ? src.color : TAG_DEFAULT_COLORS[data.tags.length % TAG_DEFAULT_COLORS.length] });
  }));
}

// ----- Envío a otro proyecto de este mismo espacio (sin pasar por Drive) -----
function xferIsHere(space) {
  return xferSpaceKey(space) === xferSpaceKey(xferHere());
}

async function xferSendLocal({ payload, projectChoice, columnChoice, move }) {
  const built = payload.task ? null : xferBuild(payload);
  const uploads = built ? built.uploads : [];
  let taskCopy = null;
  if (payload.task) taskCopy = xferCloneTask(payload.task, null, uploads);
  // Las imágenes se copian con ids nuevos en este dispositivo (la sincronización las sube)
  for (const u of uploads) {
    const blob = await xferImageBlob(u.oldId);
    if (blob) await ImageStore.put(u.newId, blob);
  }
  const current = getActiveProject();
  let project = projects.find(p => p.id === projectChoice);
  if (!project) {
    project = xferNewProject(`${current.name} (copia)`, current.color, !!payload.task);
    projects.push(project);
  }
  ['columns', 'tasks', 'boards', 'bgImages', 'texts', 'drawings', 'frames', 'connectors'].forEach(k => { if (!Array.isArray(project[k])) project[k] = []; });
  let where = `"${project.name}"`;
  if (payload.task) {
    const col = project.columns.find(c => c.id === columnChoice) || project.columns[0];
    if (!col) throw new Error('sin columnas');
    project.tasks.unshift({ ...taskCopy, columnId: col.id, completed: isDoneColumn(col.id) ? true : taskCopy.completed });
    where += ` › "${col.title}"`;
  } else {
    const destB = xferBounds(project);
    const srcB = xferSourceBounds(payload);
    const dx = destB ? Math.round(destB.maxX + 80 - srcB.minX) : 0;
    const dy = destB ? Math.round(destB.minY - srcB.minY) : 0;
    built.boards.forEach(b => project.boards.push({ ...b, x: Math.round((b.x || 0) + dx), y: Math.round((b.y || 0) + dy) }));
    project.columns.push(...built.columns);
    project.tasks.push(...built.tasks);
    built.images.forEach(i => project.bgImages.push({ ...i, x: Math.round(i.x + dx), y: Math.round(i.y + dy) }));
    built.texts.forEach(t => project.texts.push({ ...t, x: Math.round(t.x + dx), y: Math.round(t.y + dy) }));
    built.strokes.forEach(s => project.drawings.push({ ...s, points: s.points.map(([x, y]) => [+(x + dx).toFixed(1), +(y + dy).toFixed(1)]) }));
      (built.frames || []).forEach(f => project.frames.push({ ...f, x: Math.round(f.x + dx), y: Math.round(f.y + dy) }));
      project.connectors.push(...(built.connectors || []));
  }
  project.updatedAt = Date.now();
  if (move) {
    if (payload.task) {
      tasks = tasks.filter(t => t.id !== payload.task.id);
      getActiveProject().tasks = tasks;
      closeTaskModal();
    } else {
      if (!selection.size && payload.boards.length === 1) selection = new Set([`board:${payload.boards[0].id}`]);
      deleteSelection({ skipConfirm: true });
    }
  } else if (payload.task) {
    closeTaskModal();
  }
  saveData(STORAGE_KEYS.PROJECTS, projects);
  persist();
  renderBoard();
  renderProjectSwitcher();
  return where;
}

// ----- Envío -----
async function xferSend({ payload, dest, projectChoice, columnChoice, move }) {
  if (xferIsHere(dest)) return xferSendLocal({ payload, projectChoice, columnChoice, move });
  const built = payload.task ? null : xferBuild(payload);
  const uploads = built ? built.uploads : [];
  let taskCopy = null;
  if (payload.task) taskCopy = xferCloneTask(payload.task, null, uploads);

  // 1) Imágenes primero, para que estén cuando los otros dispositivos lean los datos
  for (const u of uploads) {
    const blob = await xferImageBlob(u.oldId);
    if (blob) await xferUpload(dest, u.newId, blob);
  }

  // 2) Datos del otro espacio
  const current = getActiveProject();
  const placed = await xferWrite(dest, (data) => {
    let project = projectChoice === 'new' ? null : data.projects.find(x => x.id === projectChoice);
    if (!project) {
      project = xferNewProject(current.name, current.color, !!payload.task);
      data.projects.push(project);
    }
    ['columns', 'tasks', 'boards', 'bgImages', 'texts', 'drawings', 'frames', 'connectors'].forEach(k => { if (!Array.isArray(project[k])) project[k] = []; });
    let where = `"${project.name}"`;
    if (payload.task) {
      const col = project.columns.find(c => c.id === columnChoice) || project.columns[0];
      if (!col) throw new Error('sin columnas');
      const t = { ...taskCopy, columnId: col.id, completed: isDoneColumn(col.id) ? true : taskCopy.completed };
      project.tasks.unshift(t);
      xferEnsureTags(data, [t]);
      const board = project.boards.find(b => b.id === col.boardId);
      where += `${board ? ` › "${board.title}"` : ''} › "${col.title}"`;
    } else {
      const destB = xferBounds(project);
      const srcB = xferSourceBounds(payload);
      const dx = destB ? Math.round(destB.maxX + 80 - srcB.minX) : 0;
      const dy = destB ? Math.round(destB.minY - srcB.minY) : 0;
      built.boards.forEach(b => project.boards.push({ ...b, x: Math.round((b.x || 0) + dx), y: Math.round((b.y || 0) + dy) }));
      project.columns.push(...built.columns);
      project.tasks.push(...built.tasks);
      built.images.forEach(i => project.bgImages.push({ ...i, x: Math.round(i.x + dx), y: Math.round(i.y + dy) }));
      built.texts.forEach(t => project.texts.push({ ...t, x: Math.round(t.x + dx), y: Math.round(t.y + dy) }));
      built.strokes.forEach(s => project.drawings.push({ ...s, points: s.points.map(([x, y]) => [+(x + dx).toFixed(1), +(y + dy).toFixed(1)]) }));
      (built.frames || []).forEach(f => project.frames.push({ ...f, x: Math.round(f.x + dx), y: Math.round(f.y + dy) }));
      project.connectors.push(...(built.connectors || []));
      xferEnsureTags(data, built.tasks);
    }
    project.updatedAt = Date.now();
    return where;
  });

  // 3) Mover: se quita de aquí (lo normal de la sincronización lleva el cambio a los otros dispositivos)
  if (move) {
    if (payload.task) {
      tasks = tasks.filter(t => t.id !== payload.task.id);
      persist();
      closeTaskModal();
      renderBoard();
    } else {
      if (!selection.size && payload.boards.length === 1) selection = new Set([`board:${payload.boards[0].id}`]);
      deleteSelection({ skipConfirm: true });
    }
  } else if (payload.task) {
    closeTaskModal();
  }
  return placed;
}

// Las listas de la ventana van en orden alfabético (sin distinguir mayúsculas ni tildes, y "Proyecto 2"
// antes que "Proyecto 10")
function xferSortByName(list, nameOf) {
  return [...list].sort((a, b) => String(nameOf(a) || '').localeCompare(String(nameOf(b) || ''), 'es', { sensitivity: 'base', numeric: true }));
}

// Opciones del selector "Proyecto de destino": los proyectos que ya existen y, aparte,
// la opción de crear uno nuevo (para que no se confunda con un proyecto existente)
function xferProjectOptions(list, newName) {
  const existing = list.length
    ? `<optgroup label="Proyectos que ya existen">${xferSortByName(list, p => p.name).map(p => `<option value="${shareEsc(p.id)}">${shareEsc(p.name)}</option>`).join('')}</optgroup>`
    : '';
  const create = newName
    ? `<optgroup label="O crear uno"><option value="new">➕ Crear proyecto nuevo «${shareEsc(newName)}»</option></optgroup>`
    : '';
  return existing + create;
}

// ----- Ventana -----
function xferModal() {
  let m = document.getElementById('transferModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'transferModal';
    m.style.display = 'none';
    m.innerHTML = `
      <div class="modal-card modal-sm">
        <div class="modal-header">
          <h2>⇄ Enviar a otro proyecto</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div id="transferBody"></div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.style.display = 'none'; });
    document.body.appendChild(m);
    const style = document.createElement('style');
    style.textContent = `
      #transferBody { padding: 1.25rem 1.5rem 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
      #transferBody .form-group { margin: 0; }
      .xfer-mode { display: flex; flex-direction: column; gap: 6px; }
      .xfer-mode label { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 10px; cursor: pointer; color: var(--text-main); font-size: 0.9rem; }
      .xfer-mode label small { display: block; color: var(--text-muted); font-size: 0.78rem; }
      .xfer-mode input { margin-top: 3px; }
      .xfer-mode label:has(input:checked) { border-color: var(--accent-primary); background: var(--bg-surface-hover); }
      .xfer-actions { display: flex; justify-content: flex-end; gap: 8px; }`;
    document.head.appendChild(style);
  }
  return m;
}

async function openTransfer(payload) {
  if (!payload || (!payload.task && !xferSummary(payload))) {
    showToast('Selecciona primero lo que quieres enviar', 'info');
    return;
  }
  const m = xferModal();
  const body = document.getElementById('transferBody');
  m.style.display = 'flex';
  body.innerHTML = '<p class="share-text">Buscando tus espacios…</p>';

  // Siempre se puede enviar a otro proyecto de este espacio; los otros espacios necesitan la sesión de Google
  const here = xferHere();
  let dests = [here];
  if (syncEnabled() && SYNC.token && Date.now() < SYNC.tokenExp) {
    try {
      // Este espacio primero y los demás en orden alfabético
      dests = [here, ...xferSortByName(await xferDestinations(), xferSpaceLabel)];
    } catch (e) {
      showToast('No se pudieron leer tus otros espacios; puedes enviar dentro de este', 'warning');
    }
  }
  body.innerHTML = `
    <p class="share-text" style="margin:0">Enviar ${shareEsc(xferSummary(payload))} desde <strong>${shareEsc(xferSpaceLabel(here))}</strong>.</p>
    <div class="form-group">
      <label for="xferSpace">Espacio de destino</label>
      <select id="xferSpace">${dests.map((d, i) => `<option value="${i}">${shareEsc(xferSpaceLabel(d))}${i === 0 ? ' (este espacio)' : ''}</option>`).join('')}</select>
    </div>
    <div class="form-group">
      <label for="xferProject">Proyecto de destino</label>
      <select id="xferProject" disabled><option>Cargando…</option></select>
    </div>
    <div class="form-group" id="xferColumnGroup" style="${payload.task ? '' : 'display:none'}">
      <label for="xferColumn">Columna de destino</label>
      <select id="xferColumn" disabled></select>
    </div>
    <div class="xfer-mode">
      <label><input type="radio" name="xferMode" value="move" checked><span>Mover<small>Se quita de este proyecto.</small></span></label>
      <label><input type="radio" name="xferMode" value="copy"><span>Copiar<small>Queda en ambos lados.</small></span></label>
    </div>
    <div class="xfer-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="xferGo" disabled>Enviar</button>
    </div>`;

  const spaceSel = document.getElementById('xferSpace');
  const projSel = document.getElementById('xferProject');
  const colSel = document.getElementById('xferColumn');
  const go = document.getElementById('xferGo');
  const current = getActiveProject();
  let destData = null;

  const fillColumns = () => {
    if (!payload.task) return;
    const proj = destData && destData.projects.find(p => p.id === projSel.value);
    if (!proj) {
      colSel.innerHTML = '<option value="">Por hacer (tablero nuevo)</option>';
    } else {
      // Tableros en orden alfabético; dentro de cada uno las columnas siguen el orden del tablero
      // (Por hacer → En progreso → Completadas)
      const brds = proj.boards || [];
      const boardOf = (c) => brds.find(x => x.id === c.boardId);
      const cols = proj.columns || [];
      const opts = [...cols]
        .sort((a, b) => {
          const ba = boardOf(a), bb = boardOf(b);
          return String((ba || {}).title || '').localeCompare(String((bb || {}).title || ''), 'es', { sensitivity: 'base', numeric: true })
            || brds.indexOf(ba) - brds.indexOf(bb)
            || cols.indexOf(a) - cols.indexOf(b);
        })
        .map(c => {
          const b = boardOf(c);
          return `<option value="${shareEsc(c.id)}">${shareEsc((b ? b.title + ' › ' : '') + c.title)}</option>`;
        });
      colSel.innerHTML = opts.join('') || '<option value="">(sin columnas)</option>';
    }
    colSel.disabled = false;
  };

  const loadProjects = async () => {
    projSel.disabled = true;
    colSel.disabled = true;
    go.disabled = true;
    projSel.innerHTML = '<option>Cargando…</option>';
    const destSpace = dests[Number(spaceSel.value)];
    if (xferIsHere(destSpace)) {
      // Este espacio: los demás proyectos (no el abierto)
      destData = { projects: projects.filter(p => p.id !== current.id) };
      projSel.innerHTML = xferProjectOptions(destData.projects, `${current.name} (copia)`);
      const first = xferSortByName(destData.projects, p => p.name)[0];
      projSel.value = first ? first.id : 'new';
      projSel.disabled = false;
      fillColumns();
      go.disabled = false;
      return;
    }
    try {
      destData = (await xferReadFile(destSpace)).data;
    } catch (e) {
      projSel.innerHTML = '<option>No se pudo leer ese espacio</option>';
      return;
    }
    const same = destData.projects.find(p => String(p.name).toLowerCase() === String(current.name).toLowerCase());
    projSel.innerHTML = xferProjectOptions(destData.projects, same ? null : current.name);
    const first = xferSortByName(destData.projects, p => p.name)[0];
    projSel.value = same ? same.id : (payload.task && first ? first.id : 'new');
    projSel.disabled = false;
    fillColumns();
    go.disabled = false;
  };

  spaceSel.addEventListener('change', loadProjects);
  projSel.addEventListener('change', fillColumns);
  go.addEventListener('click', async () => {
    const move = document.querySelector('input[name="xferMode"]:checked').value === 'move';
    const dest = dests[Number(spaceSel.value)];
    go.disabled = true;
    go.textContent = 'Enviando…';
    try {
      const where = await xferSend({ payload, dest, projectChoice: projSel.value, columnChoice: colSel.value, move });
      m.style.display = 'none';
      showToast(`${move ? 'Movido' : 'Copiado'} a ${xferIsHere(dest) ? '' : `${xferSpaceLabel(dest)} › `}${where}`, 'success');
    } catch (e) {
      console.warn('Enviar a otro espacio', e);
      go.disabled = false;
      go.textContent = 'Enviar';
      if (e.message === 'auth') { m.style.display = 'none'; requestReconnect('La sesión de Google venció. Reconecta e inténtalo de nuevo.'); }
      else if (e.message === 'conflicto') showToast('Ese espacio se estaba sincronizando. Inténtalo de nuevo en unos segundos.', 'warning');
      else showToast('No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.', 'warning');
    }
  });

  await loadProjects();
}

// ----- Botones -----
document.querySelectorAll('[data-send-space]').forEach(btn => {
  btn.addEventListener('click', () => openTransfer(xferSelectionPayload()));
});
document.getElementById('sendTaskBtn').addEventListener('click', () => {
  const task = tasks.find(t => t.id === taskIdInput.value);
  if (task) openTransfer({ task: deepClone(task) });
});
