// ===== ZenBan - Archivo de tareas =====
// Las tareas archivadas salen del tablero (para que las columnas no crezcan sin fin) y se guardan en
// project.archivedTasks con de dónde salieron. Se archivan a mano (una tarea, las completadas de una
// columna o todas sus tareas) o solas: las completadas hace más de N días (Configuración).
// Se recuperan desde Configuración → Tareas archivadas.

const ARCHIVE_DAY_MS = 24 * 3600 * 1000;

function archivedTasksOf(project) {
  if (!Array.isArray(project.archivedTasks)) project.archivedTasks = [];
  return project.archivedTasks;
}

function archiveEntry(task, project) {
  const col = (project.columns || []).find(c => c.id === task.columnId);
  const board = col && (project.boards || []).find(b => b.id === col.boardId);
  return {
    ...task,
    archivedAt: Date.now(),
    archivedFrom: { columnId: task.columnId, columnTitle: col ? col.title : '', boardTitle: board ? board.title : '' }
  };
}

// Archiva tareas del proyecto abierto por id (las repetitivas nunca se archivan)
function archiveTasks(ids, message) {
  ids = ids.filter(id => { const t = tasks.find(x => x.id === id); return t && !t.repeat; });
  if (!ids.length) return 0;
  const project = getActiveProject();
  const set = new Set(ids);
  const list = archivedTasksOf(project);
  tasks.filter(t => set.has(t.id)).forEach(t => list.push(archiveEntry(t, project)));
  tasks = tasks.filter(t => !set.has(t.id));
  project.tasks = tasks;
  persist();
  renderBoard();
  if (message) showToast(message, 'success');
  return ids.length;
}

window.archiveTask = function (taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  if (t.repeat) { showToast('Las tareas repetitivas no se archivan: vuelven solas cada período', 'info'); return; }
  if (document.getElementById('taskModal').style.display === 'flex' && taskIdInput.value === taskId) closeTaskModal();
  archiveTasks([taskId], `"${t.title.substring(0, 30)}" archivada. Recupérala en Configuración → Tareas archivadas (o Ctrl+Z).`);
};

window.archiveColumnTasks = async function (colId, onlyCompleted) {
  const col = columns.find(c => c.id === colId);
  if (!col) return;
  const list = tasks.filter(t => t.columnId === colId && !t.repeat && (!onlyCompleted || t.completed));
  if (!list.length) {
    showToast(onlyCompleted ? `"${col.title}" no tiene tareas completadas` : `"${col.title}" no tiene tareas`, 'info');
    return;
  }
  const what = onlyCompleted ? `las ${list.length} tarea(s) completadas` : `las ${list.length} tarea(s)`;
  const ok = await askConfirm({
    title: `¿Archivar ${what}?`,
    message: `De la columna «${col.title}». Salen del tablero y puedes recuperarlas en Configuración → Tareas archivadas.`,
    confirmText: 'Archivar', icon: '📦'
  });
  if (!ok) return;
  archiveTasks(list.map(t => t.id), `${list.length} tarea(s) archivada(s)`);
};

// Archivo automático de las completadas hace más de N días (en todos los proyectos de este espacio)
function autoArchiveDays() {
  const v = appSettings.autoArchiveDays;
  return v === undefined ? 7 : Number(v);
}

function runAutoArchive() {
  const days = autoArchiveDays();
  if (!days) return;
  const limit = Date.now() - days * ARCHIVE_DAY_MS;
  let total = 0;
  projects.forEach(project => {
    const list = project.id === activeProjectId ? tasks : (project.tasks || []);
    const old = list.filter(t => t.completed && !t.repeat && t.completedAt && t.completedAt < limit);
    if (!old.length) return;
    if (project.id === activeProjectId) {
      archiveTasks(old.map(t => t.id));
    } else {
      const ids = new Set(old.map(t => t.id));
      old.forEach(t => archivedTasksOf(project).push(archiveEntry(t, project)));
      project.tasks = project.tasks.filter(t => !ids.has(t.id));
      project.updatedAt = Date.now();
    }
    total += old.length;
  });
  if (total) {
    saveData(STORAGE_KEYS.PROJECTS, projects);
    renderProjectSwitcher();
    showToast(`${total} tarea(s) completada(s) hace más de ${days} día(s) se archivaron solas`, 'info');
  }
}

setTimeout(runAutoArchive, 4000);
setInterval(runAutoArchive, 30 * 60 * 1000);

// ----- Ventana: tareas archivadas (recuperar o borrar) -----
function restoreArchived(projectId, taskId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const list = archivedTasksOf(project);
  const entry = list.find(t => t.id === taskId);
  if (!entry) return;
  const cols = project.columns || [];
  // Vuelve a su columna; si ya no existe, a la primera del proyecto
  const col = cols.find(c => c.id === (entry.archivedFrom || {}).columnId) || cols[0];
  if (!col) { showToast('Ese proyecto no tiene columnas donde devolverla. Crea un tablero primero.', 'warning'); return; }
  const { archivedAt, archivedFrom, ...task } = entry;
  task.columnId = col.id;
  project.archivedTasks = list.filter(t => t.id !== taskId);
  if (project.id === activeProjectId) {
    tasks.unshift(task);
    project.tasks = tasks;
    persist();
    renderBoard();
  } else {
    project.tasks = project.tasks || [];
    project.tasks.unshift(task);
    project.updatedAt = Date.now();
    saveData(STORAGE_KEYS.PROJECTS, projects);
  }
  showToast(`"${task.title.substring(0, 30)}" recuperada en "${project.name}" › ${col.title}`, 'success');
}

async function deleteArchived(projectId, taskId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const entry = archivedTasksOf(project).find(t => t.id === taskId);
  if (!entry) return;
  const ok = await askConfirm({
    title: '¿Borrar para siempre?',
    message: `«${entry.title}» se eliminará del archivo y no se podrá recuperar.`,
    confirmText: 'Borrar', danger: true
  });
  if (!ok) return;
  project.archivedTasks = archivedTasksOf(project).filter(t => t.id !== taskId);
  project.updatedAt = Date.now();
  if (project.id === activeProjectId) persist(); else saveData(STORAGE_KEYS.PROJECTS, projects);
}

function archivedCount() {
  return projects.reduce((n, p) => n + (p.archivedTasks || []).length, 0);
}

function openArchiveModal() {
  let m = document.getElementById('archiveModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'archiveModal';
    m.innerHTML = `
      <div class="modal-card archive-card">
        <div class="modal-header">
          <h2>📦 Tareas archivadas</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div class="archive-body">
          <input type="search" class="archive-search" placeholder="Buscar por tarea, proyecto o columna…" autocomplete="off">
          <div class="archive-list"></div>
        </div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.style.display = 'none'; });
    document.body.appendChild(m);
  }
  const list = m.querySelector('.archive-list');
  const search = m.querySelector('.archive-search');
  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const rows = [];
    projects.forEach(p => archivedTasksOf(p).slice().sort((a, b) => b.archivedAt - a.archivedAt).forEach(t => {
      const from = t.archivedFrom || {};
      const text = `${t.title} ${p.name} ${from.boardTitle || ''} ${from.columnTitle || ''}`.toLowerCase();
      if (q && !text.includes(q)) return;
      rows.push(`
        <div class="archive-row">
          <div class="archive-info">
            <b>${escapeHtml(t.title)}</b>
            <small>${escapeHtml(p.name)}${from.boardTitle ? ` › ${escapeHtml(from.boardTitle)}` : ''}${from.columnTitle ? ` › ${escapeHtml(from.columnTitle)}` : ''} · archivada ${new Date(t.archivedAt).toLocaleDateString()}</small>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-restore="${escapeHtml(t.id)}" data-project="${escapeHtml(p.id)}">Recuperar</button>
          <button type="button" class="btn btn-ghost btn-sm archive-del" data-delete="${escapeHtml(t.id)}" data-project="${escapeHtml(p.id)}" title="Borrar para siempre">&times;</button>
        </div>`);
    }));
    list.innerHTML = rows.join('') || `<p class="archive-empty">${archivedCount() ? 'Ninguna tarea coincide.' : 'No hay tareas archivadas en este espacio.'}</p>`;
  };
  list.onclick = (e) => {
    const r = e.target.closest('[data-restore]');
    if (r) { restoreArchived(r.dataset.project, r.dataset.restore); paint(); renderArchiveSetting(); return; }
    const d = e.target.closest('[data-delete]');
    if (d) deleteArchived(d.dataset.project, d.dataset.delete).then(() => { paint(); renderArchiveSetting(); });
  };
  search.value = '';
  search.oninput = paint;
  paint();
  m.style.display = 'flex';
}

// ----- Botones en las ventanas de tarea y de columna (útiles en el celular) -----
document.getElementById('archiveTaskBtn').addEventListener('click', () => {
  const id = taskIdInput.value;
  if (id) archiveTask(id);
});
['archiveColumnDoneBtn', 'archiveColumnAllBtn'].forEach(btnId => {
  document.getElementById(btnId).addEventListener('click', () => {
    const colId = document.getElementById('columnId').value;
    if (!colId) return;
    document.getElementById('columnModal').style.display = 'none';
    archiveColumnTasks(colId, btnId === 'archiveColumnDoneBtn');
  });
});

// ----- Configuración -----
function renderArchiveSetting() {
  const btn = document.getElementById('openArchiveBtn');
  if (btn) btn.textContent = `📦 Ver tareas archivadas (${archivedCount()})`;
  const sel = document.getElementById('settingAutoArchive');
  if (sel) sel.value = String(autoArchiveDays());
}

document.getElementById('openArchiveBtn').addEventListener('click', openArchiveModal);
document.getElementById('settingsForm').addEventListener('submit', () => {
  appSettings.autoArchiveDays = Number(document.getElementById('settingAutoArchive').value);
  saveData(SETTINGS_KEY, appSettings);
  setTimeout(runAutoArchive, 300);
});

// ----- Estilos -----
(function archiveStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .archive-card { max-width: 620px; }
    .archive-body { padding: 1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; min-height: 0; }
    .archive-list { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; max-height: 60vh; }
    .archive-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--bg-surface-hover); }
    .archive-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .archive-info b { font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .archive-info small { color: var(--text-dim); font-size: 0.75rem; }
    .archive-del { color: #ef4444; font-size: 1.1rem; }
    .archive-empty { color: var(--text-muted); text-align: center; padding: 2rem 0; margin: 0; }
    .column-archive-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
  `;
  document.head.appendChild(style);
})();
