// ===== ZenBan - Proyectos personales y compartidos en una sola lista =====
// - El menú de proyectos muestra los del espacio actual y los de los otros espacios (leídos de Drive),
//   en secciones; los compartidos llevan 👥. Al abrir uno de otro espacio, la app cambia de espacio.
// - En "Editar proyecto", el selector Espacio mueve el proyecto (con todo su contenido) a otro espacio.
// - El menú de la cuenta muestra en grande y con color en qué espacio estás.
// Usa las funciones de Drive de transfer.js (xferReadFile, xferSend, xferDestinations...).

const SPACES_CACHE_MS = 60 * 1000;
const OtherSpaces = { entries: [], loadedAt: 0, loading: null };

function spaceIsShared(s) {
  return s && s.mode === 'shared';
}

function spaceTitle(s) {
  return spaceIsShared(s) ? `Compartidos «${s.folderName || 'ZenBan'}»` : 'Personales';
}

// "tus datos personales" / "los datos compartidos «X»" (respeta mayúsculas del nombre)
function spacePhrase(s) {
  return spaceIsShared(s) ? `los datos compartidos «${s.folderName || 'ZenBan'}»` : 'tus datos personales';
}

function signedIn() {
  return syncEnabled() && SYNC.token && Date.now() < SYNC.tokenExp;
}

// ----- Indicador de espacio (menú de la cuenta y botón de proyectos) -----
function renderSpaceIndicator() {
  const here = xferHere();
  const box = document.getElementById('spaceIndicator');
  if (box) {
    box.dataset.mode = spaceIsShared(here) ? 'shared' : 'personal';
    document.getElementById('spaceIndicatorIcon').textContent = spaceIsShared(here) ? '👥' : '👤';
    document.getElementById('spaceIndicatorName').textContent = spaceIsShared(here)
      ? `Datos compartidos «${here.folderName || 'ZenBan'}»`
      : 'Datos personales';
  }
  const btn = document.getElementById('projectSwitcherBtn');
  if (btn) {
    let icon = document.getElementById('projectSpaceIcon');
    if (!icon) {
      icon = document.createElement('span');
      icon.id = 'projectSpaceIcon';
      icon.className = 'project-space-icon';
      const name = document.getElementById('currentProjectName');
      name.parentNode.insertBefore(icon, name);
    }
    icon.textContent = spaceIsShared(here) ? '👥' : '';
    icon.title = spaceIsShared(here) ? `Datos compartidos «${here.folderName || 'ZenBan'}»` : '';
    icon.hidden = !spaceIsShared(here);
  }
}

// ----- Proyectos de los otros espacios -----
async function loadOtherSpaces(force = false) {
  if (!signedIn()) { OtherSpaces.entries = []; return []; }
  if (!force && Date.now() - OtherSpaces.loadedAt < SPACES_CACHE_MS) return OtherSpaces.entries;
  if (OtherSpaces.loading) return OtherSpaces.loading;
  OtherSpaces.loading = (async () => {
    const dests = await xferDestinations();
    const entries = [];
    for (const space of dests) {
      try {
        const { file, data } = await xferReadFile(space);
        entries.push({ space, hasFile: !!file, projects: data.projects || [] });
      } catch (e) {
        entries.push({ space, hasFile: false, projects: [], error: true });
      }
    }
    OtherSpaces.entries = entries;
    OtherSpaces.loadedAt = Date.now();
    saveOtherSpacesCache(entries);
    return entries;
  })();
  try { return await OtherSpaces.loading; } finally { OtherSpaces.loading = null; }
}

// Copia liviana de los otros espacios (solo nombres) para mostrarlos al instante la próxima vez,
// mientras se actualizan desde Drive
const OTHER_SPACES_CACHE_KEY = 'zenban_other_spaces_v1';

function saveOtherSpacesCache(entries) {
  try {
    localStorage.setItem(OTHER_SPACES_CACHE_KEY, JSON.stringify({
      email: myEmail(),
      entries: entries.filter(e => !e.error).map(e => ({
        space: e.space,
        hasFile: e.hasFile,
        projects: e.projects.map(p => ({ id: p.id, name: p.name, color: p.color, meta: projectMeta(p), folder: p.folder, starred: p.starred, order: p.order }))
      }))
    }));
  } catch (e) {}
}

function loadOtherSpacesCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(OTHER_SPACES_CACHE_KEY) || 'null');
    if (saved && saved.email && saved.email === myEmail()) return saved.entries || [];
  } catch (e) {}
  return [];
}

// Los espacios conocidos, sin el actual (la copia guardada puede incluirlo si se cambió de espacio)
function knownOtherSpaces() {
  const here = xferHere();
  const sameSpace = (a, b) => spaceIsShared(a) === spaceIsShared(b) && (!spaceIsShared(a) || a.folderId === b.folderId);
  return (OtherSpaces.entries.length ? OtherSpaces.entries : loadOtherSpacesCache()).filter(e => !sameSpace(e.space, here));
}

function projectMeta(project) {
  if (project.meta) return project.meta;
  const total = (project.tasks || []).length;
  const done = (project.tasks || []).filter(t => t.completed).length;
  const cols = (project.columns || []).length;
  return `${cols} columna${cols === 1 ? '' : 's'} · ${done}/${total} tareas`;
}

function sectionHeader(space, note = '') {
  const li = document.createElement('li');
  li.className = `project-section ${spaceIsShared(space) ? 'is-shared' : 'is-personal'}`;
  li.innerHTML = `<span>${spaceIsShared(space) ? '👥' : '👤'} ${escapeHtml(spaceTitle(space))}</span>${note ? `<small>${escapeHtml(note)}</small>` : ''}`;
  return li;
}

function otherProjectItem(space, project) {
  const li = document.createElement('li');
  li.className = 'project-item is-other-space';
  li.innerHTML = `
    <button type="button" class="project-item-main" title="Abrir ${escapeHtml(project.name)} (cambia a ${escapeHtml(spacePhrase(space))})">
      <span class="project-dot" style="background-color: ${project.color || '#6366f1'}"></span>
      <span class="project-item-text">
        <span class="project-item-name">${spaceIsShared(space) ? '<span class="project-shared-mark" title="Compartido">👥</span>' : ''}${escapeHtml(project.name)}</span>
        <span class="project-item-meta">${projectMeta(project)}</span>
      </span>
    </button>
    <button type="button" class="project-item-edit" title="Editar proyecto" aria-label="Editar ${escapeHtml(project.name)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
    </button>`;
  li.querySelector('.project-item-main').addEventListener('click', () => {
    closeProjectMenu();
    switchToSpace(space, project.id);
  });
  li.querySelector('.project-item-edit').addEventListener('click', async (e) => {
    e.stopPropagation();
    closeProjectMenu();
    if (await switchToSpace(space, project.id)) openProjectModal(project.id);
  });
  return li;
}

// Agrega las secciones al menú que dibuja app.js
const baseRenderProjectSwitcher = renderProjectSwitcher;
renderProjectSwitcher = function () {
  baseRenderProjectSwitcher();
  renderSpaceIndicator();
  const here = xferHere();
  // Marca 👥 en los proyectos del espacio actual si es compartido
  if (spaceIsShared(here)) {
    projectList.querySelectorAll('.project-item-name').forEach(n => {
      if (!n.querySelector('.project-shared-mark')) n.insertAdjacentHTML('afterbegin', '<span class="project-shared-mark" title="Compartido">👥</span>');
    });
  }
  // Sin sesión de Google (venció al cerrar la app): se está conectando, o no se pudo y se ofrece reintentar
  const failed = !signedIn() && syncEnabled() && OtherSpaces.connectFailed;
  const connecting = !signedIn() && syncEnabled() && !failed;
  if (!signedIn() && !connecting && !failed) return;
  projectList.insertBefore(sectionHeader(here, 'Espacio actual'), projectList.firstChild);
  if (failed) {
    const head = document.createElement('li');
    head.className = 'project-section is-shared';
    head.innerHTML = '<span>👥 Otros espacios</span><small>Sin conexión con Google</small>';
    const li = document.createElement('li');
    li.className = 'project-section-note';
    li.innerHTML = '<button type="button" class="btn btn-primary btn-sm project-connect-btn">Conectar con Google</button>';
    li.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); openProjectMenu(); });
    projectList.appendChild(head);
    projectList.appendChild(li);
  }
  const syncing = signedIn() && SYNC.busy;
  const loading = connecting || syncing || !!OtherSpaces.loading;
  const entries = failed ? [] : knownOtherSpaces();
  const loadingLabel = connecting ? 'Conectando…' : syncing ? 'Sincronizando…' : 'Cargando…';
  if (!entries.length && loading) {
    // Todavía no se sabe qué hay: sección "cargando" con filas grises animadas
    const head = document.createElement('li');
    head.className = 'project-section is-shared';
    head.innerHTML = `<span>👥 Otros espacios</span>${loadingNote(loadingLabel)}`;
    projectList.appendChild(head);
    for (let i = 0; i < 2; i++) {
      const li = document.createElement('li');
      li.className = 'project-item project-skeleton';
      li.innerHTML = '<span class="skeleton-dot skeleton-line"></span><span class="skeleton-text"><span class="skeleton-line"></span><span class="skeleton-line is-short"></span></span>';
      projectList.appendChild(li);
    }
  }
  entries.forEach(entry => {
    const header = sectionHeader(entry.space);
    // Mientras se actualizan desde Drive, se muestran los de la última vez con la señal de carga
    if (loading) header.insertAdjacentHTML('beforeend', loadingNote('Actualizando…'));
    projectList.appendChild(header);
    if (entry.error) {
      const li = document.createElement('li');
      li.className = 'project-section-note';
      li.textContent = 'No se pudo leer este espacio.';
      projectList.appendChild(li);
      return;
    }
    if (!entry.projects.length) {
      const li = document.createElement('li');
      li.className = 'project-section-note';
      li.textContent = 'Sin proyectos todavía.';
      projectList.appendChild(li);
      return;
    }
    // Con sus carpetas y su orden (estrellas, orden manual), igual que en su propio espacio
    const collapsed = collapsedFolders();
    const sKey = spaceKey(toStoredSpace(entry.space));
    projectGroups(entry.projects).forEach(group => {
      if (group.folder) {
        const key = folderKey(sKey, group.folder);
        const open = !collapsed.has(key);
        projectList.appendChild(folderHeaderEl(group.folder, group.items.length, open, collapsed, key, 'is-other-space'));
        if (!open) return;
      }
      group.items.forEach(p => {
        const li = otherProjectItem(entry.space, p);
        if (group.folder) li.classList.add('in-folder');
        if (p.starred) li.querySelector('.project-item-name').insertAdjacentHTML('beforeend', ' <span class="project-star-mark">★</span>');
        projectList.appendChild(li);
      });
    });
  });
};

function loadingNote(label) {
  return `<small class="project-loading"><span class="project-spinner" aria-hidden="true"></span>${escapeHtml(label)}</small>`;
}

// Al abrir el menú: si la sesión de Google venció, se conecta (y sincroniza) primero;
// después se buscan o refrescan los otros espacios. Si no se logra en 25 s, se ofrece reintentar.
let waitSignInTimer = null;
const REOPEN_PROJECTS_KEY = 'zenban_reopen_projects';
const baseOpenProjectMenu = openProjectMenu;
openProjectMenu = function () {
  baseOpenProjectMenu();
  clearInterval(waitSignInTimer);
  OtherSpaces.connectFailed = false;
  const rerender = () => { if (!projectMenu.hidden) renderProjectSwitcher(); };
  const refresh = async () => {
    renderProjectSwitcher();
    // Primero se sube lo pendiente de este espacio, así la lista y el cambio de espacio parten al día
    if (isDirty() || !SYNC.remoteVersion) await syncNow().catch(() => {});
    loadOtherSpaces().then(rerender).catch(rerender);
    if (OtherSpaces.loading) rerender();
  };
  if (signedIn()) { refresh(); return; }
  if (!syncEnabled()) return;
  // Se inicia sesión ahora (el toque del usuario permite abrir la ventana de Google).
  // En la app instalada del celular es por redirección: al volver se abre la lista sola.
  if (isInstalledApp()) localStorage.setItem(REOPEN_PROJECTS_KEY, String(Date.now()));
  signInWithGoogle();
  renderProjectSwitcher();
  const end = Date.now() + 25000;
  waitSignInTimer = setInterval(() => {
    if (projectMenu.hidden) { clearInterval(waitSignInTimer); return; }
    if (signedIn()) { clearInterval(waitSignInTimer); refresh(); return; }
    if (Date.now() > end) {
      clearInterval(waitSignInTimer);
      OtherSpaces.connectFailed = true;
      rerender();
    }
  }, 400);
};

// Volviendo del inicio de sesión por redirección: abre de nuevo la lista de proyectos
(function reopenProjectsAfterLogin() {
  const at = Number(localStorage.getItem(REOPEN_PROJECTS_KEY) || 0);
  localStorage.removeItem(REOPEN_PROJECTS_KEY);
  if (!at || Date.now() - at > 5 * 60 * 1000) return;
  const end = Date.now() + 20000;
  const timer = setInterval(() => {
    if (signedIn()) { clearInterval(timer); openProjectMenu(); }
    else if (Date.now() > end) clearInterval(timer);
  }, 400);
})();

// ----- Cambiar de espacio sin perder datos -----
function toStoredSpace(s) {
  if (!spaceIsShared(s)) return { mode: 'personal' };
  return { mode: 'shared', folderId: s.folderId, folderName: s.folderName, ownerEmail: s.ownerEmail, ownerName: s.ownerName };
}

async function waitSyncIdle(ms = 20000) {
  const end = Date.now() + ms;
  while (SYNC.busy && Date.now() < end) await new Promise(r => setTimeout(r, 200));
  return !SYNC.busy;
}

// Sube lo pendiente del espacio actual, trae el otro de Drive y lo deja como datos locales
async function switchToSpace(target, projectId = null) {
  if (!signedIn()) {
    showToast('Inicia sesión con Google para abrir proyectos de otro espacio', 'info');
    signInWithGoogle();
    return false;
  }
  // Puede tardar unos segundos (sube lo pendiente y trae el otro espacio): aviso de carga sobre el lienzo
  showBusy(`Abriendo ${spacePhrase(target)}…`);
  try {
    // 1) Nada pendiente en el espacio actual
    await waitSyncIdle();
    if (isDirty()) {
      await syncNow();
      await waitSyncIdle();
    }
    if (isDirty()) {
      showToast('Hay cambios sin subir en este espacio. Espera a que se sincronicen e inténtalo de nuevo.', 'warning');
      return false;
    }
    // 2) Datos del otro espacio
    const { file, data } = await xferReadFile(target);
    if (!file || !(data.projects || []).length) {
      // Espacio sin datos todavía: el flujo de siempre (pregunta si combinar)
      if (spaceIsShared(target)) {
        joinSharedSpace({ id: target.folderId, name: target.folderName, owners: [{ emailAddress: target.ownerEmail, displayName: target.ownerName }] });
      } else {
        leaveSharedSpace();
      }
      return false;
    }
    // 3) Reemplaza los datos locales por los del otro espacio (ya estaba todo subido)
    setSpace(toStoredSpace(target));
    SYNC.fileId = file.id;
    SYNC.remoteVersion = String(file.version); // los datos locales quedan iguales a esa versión de Drive
    applyPayload(dataPart(data));
    await SyncBase.set(dataPart(data));
    setDirty(false);
    localStorage.setItem(SYNC_KEYS.LAST, String(Date.now()));
    if (projectId && projects.some(p => p.id === projectId)) switchProject(projectId);
    renderShareState();
    renderAccount();
    setSyncStatus('ok');
    OtherSpaces.loadedAt = 0;
    loadOtherSpaces(true).catch(() => {});
    syncImages().catch(() => {});
    showToast(`Estás en ${spacePhrase(target)}`, 'success');
    return true;
  } catch (e) {
    console.warn('Cambiar de espacio', e);
    if (e.message === 'auth') signInWithGoogle();
    showToast('No se pudo abrir ese espacio. Revisa tu conexión e inténtalo de nuevo.', 'warning');
    return false;
  } finally {
    hideBusy();
  }
}

// ----- Mover un proyecto completo a otro espacio -----
async function moveProjectToSpace(projectId, target) {
  if (!signedIn()) {
    showToast('Inicia sesión con Google para mover proyectos entre espacios', 'info');
    signInWithGoogle();
    return;
  }
  if (projects.length <= 1) {
    showToast('Es el único proyecto de este espacio. Crea otro antes de moverlo.', 'warning');
    return;
  }
  // Se abre el proyecto para que tenga tableros (como al usarlo) y se envía todo su contenido
  if (activeProjectId !== projectId) switchProject(projectId);
  const project = getActiveProject();
  const payload = {
    boards: deepClone(project.boards || []),
    columns: deepClone(project.columns || []),
    tasks: deepClone(project.tasks || []),
    images: deepClone(project.bgImages || []),
    texts: deepClone(project.texts || []),
    strokes: deepClone(project.drawings || [])
  };
  showToast(`Moviendo «${project.name}»…`, 'info');
  try {
    await xferSend({ payload, dest: target, projectChoice: 'new', columnChoice: '', move: false });
  } catch (e) {
    console.warn('Mover proyecto', e);
    showToast(e.message === 'conflicto' ? 'Ese espacio se estaba sincronizando. Inténtalo de nuevo.' : 'No se pudo mover el proyecto. Revisa tu conexión e inténtalo de nuevo.', 'warning');
    return;
  }
  // Se quita de aquí, igual que al eliminarlo (queda registrado para la sincronización)
  const name = project.name;
  recordDeletedProject(projectId);
  projects = projects.filter(p => p.id !== projectId);
  activeProjectId = projects[0].id;
  saveData(STORAGE_KEYS.PROJECTS, projects);
  switchProject(activeProjectId);
  OtherSpaces.loadedAt = 0;
  loadOtherSpaces(true).catch(() => {});
  showToast(`«${name}» ahora está en ${spacePhrase(target)}`, 'success');
}

// ----- Selector "Espacio" en Editar proyecto -----
const projectSpaceGroup = document.getElementById('projectSpaceGroup');
const projectSpaceSelect = document.getElementById('projectSpaceSelect');
let projectSpaceOptions = [];

const baseOpenProjectModal = window.openProjectModal;
window.openProjectModal = function (projectId = null) {
  baseOpenProjectModal(projectId);
  projectSpaceGroup.style.display = 'none';
  if (!projectId || !signedIn()) return;
  const here = xferHere();
  projectSpaceOptions = [here];
  const fill = () => {
    projectSpaceSelect.innerHTML = projectSpaceOptions.map((s, i) =>
      `<option value="${i}">${spaceIsShared(s) ? '👥 Compartido' : '👤 Personal'}${spaceIsShared(s) ? ` «${escapeHtml(s.folderName || 'ZenBan')}»` : ''}${i === 0 ? ' (actual)' : ''}</option>`).join('');
    projectSpaceSelect.value = '0';
  };
  fill();
  projectSpaceGroup.style.display = '';
  xferDestinations().then(d => { projectSpaceOptions = [here, ...d]; fill(); }).catch(() => {});
};

// Se lee el espacio elegido antes de que app.js guarde y cierre la ventana
document.getElementById('projectForm').addEventListener('submit', () => {
  const id = projectIdInput.value;
  const choice = Number(projectSpaceSelect.value || 0);
  if (!id || projectSpaceGroup.style.display === 'none' || !choice) return;
  const target = projectSpaceOptions[choice];
  setTimeout(() => moveProjectToSpace(id, target), 0);
}, true);

// ----- Estilos -----
(function spacesStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .space-indicator { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; padding: 10px 12px; border-radius: 12px; border: 1px solid transparent; }
    .space-indicator[data-mode="personal"] { background: rgba(99, 102, 241, 0.14); border-color: rgba(99, 102, 241, 0.45); color: #6366f1; }
    .space-indicator[data-mode="shared"] { background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.5); color: #10b981; }
    .space-indicator-icon { font-size: 1.6rem; line-height: 1; }
    .space-indicator-text { display: flex; flex-direction: column; line-height: 1.2; }
    .space-indicator-text small { font-size: 0.72rem; opacity: 0.85; color: var(--text-muted); }
    .space-indicator-text strong { font-size: 1rem; font-weight: 700; }
    .project-section { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 10px 12px 4px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; list-style: none; }
    .project-section.is-personal { color: #6366f1; }
    .project-section.is-shared { color: #10b981; }
    .project-section small { font-size: 0.68rem; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--text-dim); }
    .project-section-note { padding: 4px 14px 8px; font-size: 0.8rem; color: var(--text-muted); list-style: none; }
    .project-loading { display: inline-flex; align-items: center; gap: 5px; color: #10b981 !important; }
    .project-spinner { width: 11px; height: 11px; border-radius: 50%; border: 2px solid rgba(16, 185, 129, 0.25); border-top-color: #10b981; animation: projectSpin 0.8s linear infinite; }
    @keyframes projectSpin { to { transform: rotate(360deg); } }
    .project-skeleton { display: flex; align-items: center; gap: 10px; padding: 10px 12px; list-style: none; pointer-events: none; }
    .skeleton-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .skeleton-text { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .skeleton-text .skeleton-line { display: block; height: 10px; border-radius: 5px; width: 70%; }
    .skeleton-text .skeleton-line.is-short { width: 40%; height: 8px; }
    .project-shared-mark { margin-right: 4px; }
    .project-star-mark { color: #f59e0b; }
    .project-folder.is-other-space .project-folder-btn { font-weight: 500; opacity: 0.9; }
    .project-item.is-other-space .project-item-name { opacity: 0.92; }
    .project-space-icon { margin-right: 2px; }
    .project-space-icon[hidden] { display: none; }
    .project-space-hint { display: block; margin-top: 6px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; }
  `;
  document.head.appendChild(style);
})();

renderSpaceIndicator();
