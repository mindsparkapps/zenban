// ===== ZenBan - Personas del espacio compartido y sus permisos =====
// - Junto a tu foto se ve cuántas personas comparten los datos y sus fotos de Google; al tocarlo se abre
//   la ventana de datos compartidos.
// - El dueño elige para cada persona qué puede hacer: "Editar todo", "Crear" (agregar tareas y objetos
//   y editar solo lo que esa persona creó) o "Solo ver", en general y por tablero.
//   Los permisos se guardan en el Drive PERSONAL del dueño (fuera de la carpeta compartida) y se
//   comparten con cada persona solo para lectura: nadie más que el dueño puede cambiarlos.
// - ZenBan los respeta en la app: si alguien sin permiso cambia algo, el cambio se deshace al guardar.

const PERM_LEVELS = { edit: 'Editar todo', create: 'Crear (y editar lo suyo)', view: 'Solo ver' };
const PERM_RANK = { view: 0, create: 1, edit: 2 };
const PERM_FILE_PROP = 'zenbanPermFile';
const MEMBERS_CACHE_KEY = 'zenban_members:';
const PERMS_CACHE_KEY = 'zenban_perms:';

let spacePerms = null;        // { v, members: { email: { level, boards: { boardId: level } } } }
let permsLoadedAt = 0;

function permsCacheKey() { return PERMS_CACHE_KEY + (currentSpace().folderId || ''); }

function loadCachedPerms() {
  try { spacePerms = JSON.parse(localStorage.getItem(permsCacheKey()) || 'null'); } catch (e) { spacePerms = null; }
}

function iAmSpaceOwner() {
  return (currentSpace().ownerEmail || '').toLowerCase() === myEmail();
}

// ¿Esta persona tiene límites? (en datos personales o siendo el dueño, nunca)
function restrictedUser() {
  if (!inShared() || !myEmail() || iAmSpaceOwner()) return false;
  const m = spacePerms && spacePerms.members && spacePerms.members[myEmail()];
  return !!m && (m.level !== 'edit' || Object.values(m.boards || {}).some(l => l !== 'edit'));
}

function myPermLevel(boardId = null) {
  if (!inShared() || iAmSpaceOwner()) return 'edit';
  const m = spacePerms && spacePerms.members && spacePerms.members[myEmail()];
  if (!m) return 'edit';
  return (boardId && m.boards && m.boards[boardId]) || m.level || 'edit';
}

// ----- Leer y guardar los permisos (archivo en el Drive personal del dueño) -----
async function fetchPermFileId() {
  const f = await driveJson(`${DRIVE_API}/files/${currentSpace().folderId}?fields=properties,owners(emailAddress)&supportsAllDrives=true`);
  return { fileId: (f.properties || {})[PERM_FILE_PROP] || null, owner: ((f.owners || [])[0] || {}).emailAddress || '' };
}

async function loadSpacePerms(force = false) {
  if (!inShared() || !SYNC.token) return spacePerms;
  if (!force && Date.now() - permsLoadedAt < 120000) return spacePerms;
  permsLoadedAt = Date.now();
  try {
    const { fileId, owner } = await fetchPermFileId();
    if (!fileId) { spacePerms = null; localStorage.removeItem(permsCacheKey()); return null; }
    // Solo valen los permisos de un archivo cuyo dueño es el dueño de la carpeta compartida
    const meta = await driveJson(`${DRIVE_API}/files/${fileId}?fields=owners(emailAddress)&supportsAllDrives=true`);
    const fileOwner = ((meta.owners || [])[0] || {}).emailAddress || '';
    if (!owner || fileOwner.toLowerCase() !== owner.toLowerCase()) return spacePerms;
    const data = await (await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`)).json();
    spacePerms = data && data.members ? data : null;
    localStorage.setItem(permsCacheKey(), JSON.stringify(spacePerms));
    markReadOnlyBoards();
  } catch (e) {
    console.warn('Permisos', e);
  }
  return spacePerms;
}

async function saveSpacePerms(perms, members) {
  const name = `ZenBan permisos (${currentSpace().folderName || 'datos compartidos'}).json`;
  const body = JSON.stringify({ v: 1, folderId: currentSpace().folderId, savedAt: Date.now(), members: perms.members });
  let { fileId } = await fetchPermFileId();
  if (fileId) {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
    });
  } else {
    // En "Mi unidad" del dueño (no en la carpeta compartida): las demás personas no pueden cambiarlo
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name, mimeType: 'application/json', appProperties: { zenbanPerms: currentSpace().folderId } })], { type: 'application/json' }));
    form.append('file', new Blob([body], { type: 'application/json' }));
    const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form });
    fileId = (await r.json()).id;
    await driveJson(`${DRIVE_API}/files/${currentSpace().folderId}?supportsAllDrives=true`, 'PATCH', { properties: { [PERM_FILE_PROP]: fileId } });
  }
  // Cada persona puede leerlo (solo lectura)
  const shared = await driveJson(`${DRIVE_API}/files/${fileId}/permissions?fields=permissions(emailAddress)&supportsAllDrives=true`);
  const readers = new Set((shared.permissions || []).map(p => (p.emailAddress || '').toLowerCase()));
  for (const m of members) {
    const email = (m.emailAddress || '').toLowerCase();
    if (!email || readers.has(email) || m.role === 'owner') continue;
    await driveJson(`${DRIVE_API}/files/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, 'POST', { type: 'user', role: 'reader', emailAddress: email });
  }
  spacePerms = { v: 1, members: perms.members };
  localStorage.setItem(permsCacheKey(), JSON.stringify(spacePerms));
}

// ----- Hacer cumplir los permisos al guardar -----
// Compara el proyecto con cómo estaba en el último guardado y deshace lo que esta persona no puede hacer.
function itemKeyIds(arr) { return new Map((arr || []).filter(x => x && x.id != null).map(x => [x.id, x])); }

function enforceList(prevArr, curArr, levelOf, label, denied) {
  const prev = itemKeyIds(prevArr);
  const cur = itemKeyIds(curArr);
  const me = myEmail();
  const out = [];
  let changed = false;
  (curArr || []).forEach(item => {
    if (!item || item.id == null) { out.push(item); return; }
    const before = prev.get(item.id);
    const lvl = levelOf(item, before);
    if (!before) {
      if (PERM_RANK[lvl] >= PERM_RANK.create) { if (lvl !== 'edit' && !item.createdBy) item.createdBy = me; out.push(item); }
      else { changed = true; denied.add(`crear ${label}`); }
      return;
    }
    if (JSON.stringify(before) === JSON.stringify(item)) { out.push(item); return; }
    const own = before.createdBy && before.createdBy === me;
    if (lvl === 'edit' || (lvl === 'create' && own)) out.push(item);
    else { out.push(before); changed = true; denied.add(`cambiar ${label}`); }
  });
  prev.forEach((item, id) => {
    if (cur.has(id)) return;
    const lvl = levelOf(item, item);
    const own = item.createdBy && item.createdBy === me;
    if (lvl === 'edit' || (lvl === 'create' && own)) return;
    out.push(item);
    changed = true;
    denied.add(`borrar ${label}`);
  });
  return changed ? out : null;
}

function enforcePermissions() {
  if (!restrictedUser() || !lastSnapshot) return;
  const project = getActiveProject();
  if (!project) return;
  project.columns = columns;
  project.tasks = tasks;
  let prev;
  try { prev = JSON.parse(lastSnapshot); } catch (e) { return; }
  if (!prev || prev.id !== project.id) return;
  const denied = new Set();
  const general = myPermLevel();
  const colBoard = new Map([...(prev.columns || []), ...(project.columns || [])].map(c => [c.id, c.boardId]));
  // Tableros: agregarlos depende del permiso general; cambiarlos o borrarlos, del de ese tablero
  const boardsFix = enforceList(prev.boards, project.boards, (b, before) => before ? myPermLevel(b.id) : general, 'tableros', denied);
  // Columnas: son la estructura del tablero (solo con "Editar todo" en ese tablero)
  const colsFix = enforceList(prev.columns, project.columns, (c) => (myPermLevel(c.boardId) === 'edit' ? 'edit' : 'view'), 'columnas', denied);
  // Tareas: según el tablero de su columna
  const tasksFix = enforceList(prev.tasks, project.tasks, (t, before) => myPermLevel(colBoard.get((before || t).columnId)), 'tareas', denied);
  if (boardsFix) project.boards = boardsFix;
  if (colsFix) { project.columns = colsFix; columns = colsFix; }
  if (tasksFix) { project.tasks = tasksFix; tasks = tasksFix; }
  // Lo del lienzo (textos, notas, imágenes, dibujos, frames, conectores…): permiso general
  for (const k of Object.keys(project)) {
    if (['boards', 'columns', 'tasks'].includes(k) || !Array.isArray(project[k])) continue;
    const fix = enforceList(prev[k], project[k], () => general, 'objetos del lienzo', denied);
    if (fix) project[k] = fix;
  }
  // Nombre, color y demás datos del proyecto: solo con "Editar todo"
  if (general !== 'edit') {
    for (const k of Object.keys(prev)) {
      if (k === 'updatedAt' || Array.isArray(prev[k])) continue;
      if (JSON.stringify(prev[k]) !== JSON.stringify(project[k])) { project[k] = prev[k]; denied.add('cambiar el proyecto'); }
    }
  }
  if (denied.size) {
    setTimeout(() => {
      renderBoard(); renderBgImages(); renderTexts(); renderDrawings();
      showToast(`No tienes permiso para ${[...denied].join(', ')}. El dueño de los datos compartidos lo puede cambiar.`, 'warning');
    }, 0);
  }
}

const basePersistForPerms = persist;
persist = function () {
  try { enforcePermissions(); } catch (e) { console.warn('Permisos', e); }
  return basePersistForPerms.apply(this, arguments);
};

// Tableros que esta persona solo puede ver: se marcan con un candado
function markReadOnlyBoards() {
  document.querySelectorAll('.board-frame').forEach(el => {
    const lvl = myPermLevel(el.dataset.boardId);
    el.classList.toggle('is-perm-view', lvl === 'view');
    el.classList.toggle('is-perm-create', lvl === 'create');
  });
}
const baseRenderBoardForPerms = renderBoard;
renderBoard = function () {
  baseRenderBoardForPerms.apply(this, arguments);
  markReadOnlyBoards();
};

// ----- Personas: número y fotos junto a la cuenta -----
function cachedMembers() {
  try { return JSON.parse(localStorage.getItem(MEMBERS_CACHE_KEY + (currentSpace().folderId || '')) || 'null'); } catch (e) { return null; }
}

async function refreshMembers() {
  if (!inShared() || !SYNC.token) return cachedMembers();
  try {
    const members = (await listMembers()).map(p => ({ id: p.id, role: p.role, emailAddress: p.emailAddress, displayName: p.displayName, photoLink: p.photoLink }));
    localStorage.setItem(MEMBERS_CACHE_KEY + currentSpace().folderId, JSON.stringify(members));
    renderMembersChip();
    return members;
  } catch (e) {
    return cachedMembers();
  }
}

function avatarHtml(p, cls = '') {
  const name = p.displayName || p.emailAddress || '?';
  return p.photoLink
    ? `<img class="member-avatar ${cls}" src="${shareEsc(p.photoLink)}" alt="" title="${shareEsc(name)}" referrerpolicy="no-referrer">`
    : `<span class="member-avatar ${cls}" title="${shareEsc(name)}">${shareEsc(name.charAt(0).toUpperCase())}</span>`;
}

function renderMembersChip() {
  let chip = el('membersChip');
  const members = inShared() ? cachedMembers() : null;
  if (!members || !members.length) { if (chip) chip.hidden = true; return; }
  if (!chip) {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'membersChip';
    chip.className = 'members-chip';
    chip.addEventListener('click', () => openShareModal());
    const area = el('accountArea');
    area.insertBefore(chip, area.firstChild);
  }
  chip.title = `${members.length} persona(s) comparten estos datos`;
  chip.innerHTML = `<span class="members-count">👥 ${members.length}</span><span class="members-faces">${members.slice(0, 4).map(p => avatarHtml(p)).join('')}</span>`;
  chip.hidden = false;
}

// ----- Ventana de datos compartidos: la lista de personas con fotos, número y permisos -----
// (share.js la llama en vez de su lista simple)
async function enhanceMembersList() {
  const box = el('shareMembers');
  if (!box) return;
  const owner = iAmSpaceOwner();
  const [members] = await Promise.all([refreshMembers(), loadSpacePerms(true)]);
  if (!members) return;
  const sep = box.previousElementSibling;
  if (sep && sep.classList.contains('share-sep')) sep.textContent = `Personas con acceso · ${members.length}`;
  const perms = (spacePerms && spacePerms.members) || {};
  box.innerHTML = members.map(p => {
    const email = (p.emailAddress || '').toLowerCase();
    const lvl = p.role === 'owner' ? 'dueño' : PERM_LEVELS[(perms[email] || {}).level || 'edit'];
    return `<div class="share-row member-row">
      ${avatarHtml(p, 'is-big')}
      <div class="member-info"><strong>${shareEsc(p.displayName || p.emailAddress)}</strong><small>${shareEsc(p.emailAddress || '')} · ${shareEsc(lvl)}</small></div>
      ${owner && p.role !== 'owner' ? `<button class="btn btn-ghost share-btn-sm" data-perms="${shareEsc(email)}">Permisos</button><button class="btn btn-ghost share-btn-sm" data-remove="${shareEsc(p.id)}">Quitar</button>` : ''}
    </div>`;
  }).join('') + (!owner ? `<p class="share-note">Tus permisos: ${shareEsc(PERM_LEVELS[myPermLevel()])}${spacePerms && spacePerms.members && spacePerms.members[myEmail()] && Object.keys(spacePerms.members[myEmail()].boards || {}).length ? ' (con cambios en algunos tableros)' : ''}. Solo el dueño los puede cambiar.</p>` : '');
  box.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await removeMember(b.dataset.remove); showToast('Acceso quitado', 'success'); } catch (e) { showToast('No se pudo quitar el acceso', 'warning'); }
    enhanceMembersList();
  }));
  box.querySelectorAll('[data-perms]').forEach(b => b.addEventListener('click', () => openPermsEditor(b.dataset.perms, members)));
}

function openPermsEditor(email, members) {
  const box = el('shareMembers');
  const perms = { members: JSON.parse(JSON.stringify((spacePerms && spacePerms.members) || {})) };
  const m = perms.members[email] || { level: 'edit', boards: {} };
  const person = members.find(p => (p.emailAddress || '').toLowerCase() === email) || {};
  const opts = (sel, withInherit) => (withInherit ? `<option value="">Igual que lo general</option>` : '') +
    Object.entries(PERM_LEVELS).map(([v, t]) => `<option value="${v}" ${sel === v ? 'selected' : ''}>${t}</option>`).join('');
  const boardsHtml = projects.map(p => (p.boards || []).length ? `<div class="perm-project">${shareEsc(p.name)}</div>` +
    p.boards.map(b => `<label class="perm-board"><span>▦ ${shareEsc(b.title || 'Tablero')}</span><select data-board="${shareEsc(b.id)}">${opts((m.boards || {})[b.id] || '', true)}</select></label>`).join('') : '').join('');
  box.innerHTML = `
    <div class="perm-editor">
      <div class="perm-head">${avatarHtml(person, 'is-big')}<div><strong>${shareEsc(person.displayName || email)}</strong><small>${shareEsc(email)}</small></div></div>
      <label class="perm-board is-general"><span>En general (lienzo, proyectos y tableros nuevos)</span><select id="permGeneral">${opts(m.level || 'edit', false)}</select></label>
      <div class="share-sep">Por tablero</div>
      ${boardsHtml || '<p class="share-note">No hay tableros.</p>'}
      <p class="share-note">"Crear" permite agregar tareas y objetos y editar solo lo que esa persona creó. Los permisos quedan en tu Drive personal: solo tú los puedes cambiar.</p>
      <div class="share-actions"><button class="btn btn-ghost" id="permCancel">Volver</button><button class="btn btn-primary" id="permSave">Guardar permisos</button></div>
    </div>`;
  el('permCancel').addEventListener('click', enhanceMembersList);
  el('permSave').addEventListener('click', async (e) => {
    const boards = {};
    box.querySelectorAll('[data-board]').forEach(s => { if (s.value) boards[s.dataset.board] = s.value; });
    perms.members[email] = { level: el('permGeneral').value, boards };
    e.target.disabled = true;
    e.target.textContent = 'Guardando…';
    try {
      await saveSpacePerms(perms, members);
      showToast('Permisos guardados', 'success');
      enhanceMembersList();
    } catch (err) {
      console.warn(err);
      showToast('No se pudieron guardar los permisos', 'warning');
      e.target.disabled = false;
      e.target.textContent = 'Guardar permisos';
    }
  });
}

// ----- Al iniciar y después de sincronizar: personas y permisos al día -----
loadCachedPerms();
renderMembersChip();
const baseSyncNowForPerms = syncNow;
syncNow = async function () {
  const r = await baseSyncNowForPerms.apply(this, arguments);
  if (inShared() && SYNC.token) {
    const prevSpace = currentSpace().folderId;
    if (!cachedMembers() || Date.now() - permsLoadedAt > 120000) refreshMembers();
    loadSpacePerms().then(() => { if (currentSpace().folderId === prevSpace) markReadOnlyBoards(); });
  } else {
    renderMembersChip();
  }
  return r;
};

(function addPermStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .members-chip { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 8px 0 10px; margin-right: 6px; border-radius: 999px; border: 1px solid var(--border-medium); background: var(--bg-surface); color: var(--text-main); font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
    .members-chip[hidden] { display: none; }
    .members-count { white-space: nowrap; }
    .members-faces { display: inline-flex; }
    @media (max-width: 640px) { .members-faces { display: none; } .members-chip { padding: 0 8px; } }
    .members-faces .member-avatar { margin-left: -6px; border: 2px solid var(--bg-surface); }
    .members-faces .member-avatar:first-child { margin-left: 0; }
    .member-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-primary); color: #fff; font-size: 0.7rem; font-weight: 700; flex-shrink: 0; }
    .member-avatar.is-big { width: 36px; height: 36px; font-size: 0.95rem; }
    .member-row { justify-content: flex-start; }
    .member-info { flex: 1; min-width: 0; }
    .perm-editor { display: flex; flex-direction: column; gap: 8px; }
    .perm-head { display: flex; align-items: center; gap: 10px; }
    .perm-head small { display: block; color: var(--text-muted); font-size: 0.78rem; }
    .perm-project { font-weight: 700; font-size: 0.82rem; color: var(--text-muted); margin-top: 6px; }
    .perm-board { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.85rem; }
    .perm-board.is-general { font-weight: 600; }
    .perm-board select { max-width: 55%; }
    .board-frame.is-perm-view::after { content: '🔒 Solo ver'; position: absolute; top: calc(-26px * var(--inv-zoom, 1)); right: 0; padding: 2px 8px; border-radius: 999px; background: #475569; color: #fff; font-size: calc(12px * var(--inv-zoom, 1)); pointer-events: none; }
    .board-frame.is-perm-create::after { content: '➕ Puedes agregar'; position: absolute; top: calc(-26px * var(--inv-zoom, 1)); right: 0; padding: 2px 8px; border-radius: 999px; background: #0f766e; color: #fff; font-size: calc(12px * var(--inv-zoom, 1)); pointer-events: none; }
  `;
  document.head.appendChild(style);
})();
