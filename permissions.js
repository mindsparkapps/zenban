// ===== ZenBan - Personas del espacio compartido y sus permisos =====
// - Junto a tu foto se ve cuántas personas comparten los datos y sus fotos de Google; al tocarlo se abre
//   la ventana de datos compartidos.
// - El dueño elige para cada persona qué puede hacer: "Editar todo", "Crear" (agregar tareas y objetos
//   y editar solo lo que esa persona creó) o "Solo ver", en general y por tablero.
//   Los permisos se guardan en el Drive PERSONAL del dueño (fuera de la carpeta compartida) y se
//   comparten con cada persona solo para lectura: nadie más que el dueño puede cambiarlos.
// - ZenBan los respeta en la app: si alguien sin permiso cambia algo, el cambio se deshace al guardar.

// (los niveles antiguos 'edit' | 'create' | 'view' se siguen leyendo; ver normPerm)
const PERM_FILE_PROP = 'zenbanPermFile';
const MEMBERS_CACHE_KEY = 'zenban_members:';
const PERMS_CACHE_KEY = 'zenban_perms:';

let spacePerms = null;        // { v, members: { email: { level, boards: { boardId: level } } } }
let permsLoadedAt = 0;

function permsCacheKey() { return PERMS_CACHE_KEY + (currentSpace().folderId || ''); }

function loadCachedPerms() {
  try { spacePerms = JSON.parse(localStorage.getItem(permsCacheKey()) || 'null'); } catch (e) { spacePerms = null; }
}

// ----- Permisos como casillas independientes: ver, editar, eliminar (y agregar, solo en lo general) -----
// Cada persona tiene unas casillas en general, puede tener otras por tablero y otras por objeto (el objeto manda sobre
// el tablero y el tablero sobre lo general). Lo que una persona crea ella misma siempre lo puede ver, editar y eliminar:
// las casillas valen para lo que creó el dueño u otras personas.
// Guardado: members[correo] = { perm: {ver,editar,eliminar,agregar}, level (para versiones antiguas), boards: { id: {ver,editar,eliminar} } }
//           objects['texts:ID'] = { correo: {ver,editar,eliminar} }  (la clave es la lista del proyecto y el id del objeto)
// Los permisos antiguos (texto 'edit' | 'create' | 'view') se leen y se convierten en casillas.
const PERM_ALL = { ver: true, editar: true, eliminar: true, agregar: true };
function normPerm(v) {
  if (!v) return null;
  let p;
  if (typeof v === 'string') {
    p = v === 'edit' ? { ...PERM_ALL } : v === 'create' ? { ver: true, editar: false, eliminar: false, agregar: true } : { ver: true, editar: false, eliminar: false, agregar: false };
  } else {
    p = { ver: v.ver !== false, editar: !!v.editar, eliminar: !!v.eliminar, agregar: !!v.agregar };
  }
  if (!p.ver) { p.editar = false; p.eliminar = false; p.agregar = false; }
  return p;
}
const permIsFull = (p, conAgregar = true) => !!p && p.ver && p.editar && p.eliminar && (!conAgregar || p.agregar);
// Texto antiguo equivalente (para versiones antiguas de ZenBan y para decirle a los plugins qué nivel tiene la persona)
function levelOfPerm(p) {
  if (permIsFull(p)) return 'edit';
  return !p.editar && !p.agregar && !p.eliminar ? 'view' : 'create';
}

function objectKey(arrayName, id) { return `${arrayName}:${id}`; }
function ownerEmailLower() { return (currentSpace().ownerEmail || '').toLowerCase(); }
function memberPermOf(email) {
  const m = spacePerms && spacePerms.members && spacePerms.members[email];
  return (m && (normPerm(m.perm) || normPerm(m.level))) || { ...PERM_ALL };
}
function boardPermOf(email, boardId) {
  const m = spacePerms && spacePerms.members && spacePerms.members[email];
  return (m && m.boards && normPerm(m.boards[boardId])) || null;
}
function objectPermOf(email, key) {
  const o = spacePerms && spacePerms.objects && spacePerms.objects[key];
  return (o && normPerm(o[email])) || null;
}
// Permiso efectivo de una persona: dueño y creador del objeto, todo; si no, el del objeto, el del tablero o el general
function permOf(email, { boardId = null, key = null, item = null } = {}) {
  if (!inShared() || !email || email === ownerEmailLower()) return { ...PERM_ALL };
  if (item && item.createdBy && item.createdBy === email) return { ...PERM_ALL };
  return (key && objectPermOf(email, key)) || (boardId && boardPermOf(email, boardId)) || memberPermOf(email);
}
const myPerm = (opts) => permOf(myEmail(), opts);

function iAmSpaceOwner() {
  return ownerEmailLower() === myEmail();
}

// ¿Esta persona tiene límites? (en datos personales o siendo el dueño, nunca)
function restrictedUser() {
  if (!inShared() || !myEmail() || iAmSpaceOwner()) return false;
  const m = spacePerms && spacePerms.members && spacePerms.members[myEmail()];
  const objs = Object.values((spacePerms && spacePerms.objects) || {}).map(o => o && normPerm(o[myEmail()])).filter(Boolean);
  return (!!m && (!permIsFull(memberPermOf(myEmail())) || Object.values(m.boards || {}).some(b => !permIsFull(normPerm(b), false))))
    || objs.some(p => !permIsFull(p, false));
}

// Nivel antiguo de la persona (se usa en la lista de personas, en los tableros y se le manda a los plugins)
function myPermLevel(boardId = null) {
  if (!inShared() || iAmSpaceOwner()) return 'edit';
  return levelOfPerm(myPerm({ boardId }));
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
  const body = JSON.stringify({ v: 1, folderId: currentSpace().folderId, savedAt: Date.now(), members: perms.members, objects: perms.objects || {} });
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
  spacePerms = { v: 1, members: perms.members, objects: perms.objects || {} };
  localStorage.setItem(permsCacheKey(), JSON.stringify(spacePerms));
}

// ----- Hacer cumplir los permisos al guardar -----
// Compara el proyecto con cómo estaba en el último guardado y deshace lo que esta persona no puede hacer.
function itemKeyIds(arr) { return new Map((arr || []).filter(x => x && x.id != null).map(x => [x.id, x])); }

// permOf(item, before) devuelve las casillas { agregar, editar, eliminar } que valen para ese elemento.
// Lo que la persona creó ella misma siempre lo puede cambiar y borrar.
function enforceList(prevArr, curArr, permFor, label, denied) {
  const prev = itemKeyIds(prevArr);
  const cur = itemKeyIds(curArr);
  const me = myEmail();
  const out = [];
  let changed = false;
  (curArr || []).forEach(item => {
    if (!item || item.id == null) { out.push(item); return; }
    const before = prev.get(item.id);
    if (!before) {
      if (permFor(item, null).agregar) { if (!item.createdBy) item.createdBy = me; out.push(item); }
      else { changed = true; denied.add(`crear ${label}`); }
      return;
    }
    if (JSON.stringify(before) === JSON.stringify(item)) { out.push(item); return; }
    const own = before.createdBy && before.createdBy === me;
    if (own || permFor(item, before).editar) out.push(item);
    else { out.push(before); changed = true; denied.add(`cambiar ${label}`); }
  });
  prev.forEach((item, id) => {
    if (cur.has(id)) return;
    const own = item.createdBy && item.createdBy === me;
    if (own || permFor(item, item).eliminar) return;
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
  const boardsFix = enforceList(prev.boards, project.boards, (b, before) => before ? myPerm({ boardId: b.id }) : myPerm(), 'tableros', denied);
  // Columnas: son la estructura del tablero (hace falta poder editar ese tablero; borrarlas, además poder eliminar)
  const colsFix = enforceList(prev.columns, project.columns, (c) => { const p = myPerm({ boardId: c.boardId }); return { agregar: p.editar, editar: p.editar, eliminar: p.editar && p.eliminar }; }, 'columnas', denied);
  // Tareas: según el tablero de su columna
  const tasksFix = enforceList(prev.tasks, project.tasks, (t, before) => myPerm({ boardId: colBoard.get((before || t).columnId) }), 'tareas', denied);
  if (boardsFix) project.boards = boardsFix;
  if (colsFix) { project.columns = colsFix; columns = colsFix; }
  if (tasksFix) { project.tasks = tasksFix; tasks = tasksFix; }
  // Lo del lienzo (textos, notas, imágenes, dibujos, frames, conectores…): permiso general
  for (const k of Object.keys(project)) {
    if (['boards', 'columns', 'tasks'].includes(k) || !Array.isArray(project[k])) continue;
    // Un permiso puesto a un objeto en particular manda sobre el del proyecto
    const fix = enforceList(prev[k], project[k], (it) => myPerm({ key: it ? objectKey(k, it.id) : null }), 'objetos del lienzo', denied);
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

// ----- Casillas de permisos (ver, editar, eliminar y, en lo general, agregar) -----
function permSummary(p) {
  if (!p.ver) return 'No ve nada';
  const rest = ['editar', 'eliminar', 'agregar'].filter(k => p[k]);
  if (!rest.length) return 'Solo ver';
  return 'Ver' + (rest.length > 1 ? `, ${rest.slice(0, -1).join(', ')} y ${rest[rest.length - 1]}` : ` y ${rest[0]}`);
}

// attrs: atributos del contenedor. inherit: null (sin opción) o { on, text } para la casilla «Igual que…».
function permBoxesHtml(p, { agregar = false, inherit = null, disabled = false } = {}) {
  const box = (k, label) => `<label class="perm-box"><input type="checkbox" data-p="${k}" ${p[k] ? 'checked' : ''} ${disabled || (inherit && inherit.on) ? 'disabled' : ''}> ${label}</label>`;
  return `<div class="perm-boxes">
    ${inherit ? `<label class="perm-box perm-inherit"><input type="checkbox" data-inherit ${inherit.on ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${shareEsc(inherit.text)}</label>` : ''}
    <div class="perm-box-row">${box('ver', 'Ver')}${box('editar', 'Editar')}${box('eliminar', 'Eliminar')}${agregar ? box('agregar', 'Agregar nuevos') : ''}</div>
  </div>`;
}
function readPermBoxes(root) {
  const inh = root.querySelector('[data-inherit]');
  if (inh && inh.checked) return null; // «igual que…»: sin permiso propio
  const g = (k) => { const i = root.querySelector(`input[data-p="${k}"]`); return !!(i && i.checked); };
  return normPerm({ ver: g('ver'), editar: g('editar'), eliminar: g('eliminar'), agregar: g('agregar') });
}
// Reglas entre casillas: sin «Ver» no hay nada más; marcar editar/eliminar/agregar marca «Ver»;
// «Igual que…» deja las casillas sin poder tocarse
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || !t.closest) return;
  const root = t.closest('.perm-boxes');
  if (!root) return;
  if (t.matches('[data-inherit]')) {
    root.querySelectorAll('input[data-p]').forEach(i => { i.disabled = t.checked; });
    return;
  }
  if (!t.matches('input[data-p]')) return;
  const ver = root.querySelector('input[data-p="ver"]');
  if (t.dataset.p === 'ver' && !t.checked) root.querySelectorAll('input[data-p]').forEach(i => { i.checked = false; });
  else if (t.checked && ver) ver.checked = true;
});

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
    const lvl = p.role === 'owner' ? 'dueño' : permSummary(memberPermOf(email));
    return `<div class="share-row member-row">
      ${avatarHtml(p, 'is-big')}
      <div class="member-info"><strong>${shareEsc(p.displayName || p.emailAddress)}</strong><small>${shareEsc(p.emailAddress || '')} · ${shareEsc(lvl)}</small>${p.role === 'owner' ? `<label class="lock-toggle"><input type="checkbox" id="showLocksChk"${locksVisible() ? ' checked' : ''}> Modificar permisos individuales</label>` : ''}</div>
      ${owner && p.role !== 'owner' ? `<button class="btn btn-ghost share-btn-sm" data-perms="${shareEsc(email)}">Permisos</button><button class="btn btn-ghost share-btn-sm" data-remove="${shareEsc(p.id)}">Quitar</button>` : ''}
    </div>`;
  }).join('') + (!owner ? `<p class="share-note">Tus permisos: ${shareEsc(permSummary(myPerm()))}${spacePerms && spacePerms.members && spacePerms.members[myEmail()] && Object.keys(spacePerms.members[myEmail()].boards || {}).length ? ' (con cambios en algunos tableros)' : ''}. Solo el dueño los puede cambiar.</p>` : '');
  const locksChk = box.querySelector('#showLocksChk');
  if (locksChk) locksChk.addEventListener('change', () => {
    try { localStorage.setItem('zenban_show_locks', locksChk.checked ? '1' : '0'); } catch (e) {}
    if (!locksChk.checked) closeLockPopover();
    markObjectLocks();
  });
  box.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await removeMember(b.dataset.remove); showToast('Acceso quitado', 'success'); } catch (e) { showToast('No se pudo quitar el acceso', 'warning'); }
    enhanceMembersList();
  }));
  box.querySelectorAll('[data-perms]').forEach(b => b.addEventListener('click', () => openPermsEditor(b.dataset.perms, members)));
}

function openPermsEditor(email, members) {
  const box = el('shareMembers');
  const perms = { members: JSON.parse(JSON.stringify((spacePerms && spacePerms.members) || {})), objects: JSON.parse(JSON.stringify((spacePerms && spacePerms.objects) || {})) };
  const m = perms.members[email] || { boards: {} };
  const person = members.find(p => (p.emailAddress || '').toLowerCase() === email) || {};
  const general = memberPermOf(email);
  const boardsHtml = projects.map(p => (p.boards || []).length ? `<div class="perm-project">${shareEsc(p.name)}</div>` +
    p.boards.map(b => { const bp = normPerm((m.boards || {})[b.id]);
      return `<div class="perm-board-block" data-board-block="${shareEsc(b.id)}"><div class="perm-board-name">▦ ${shareEsc(b.title || 'Tablero')}</div>${permBoxesHtml(bp || general, { inherit: { on: !bp, text: 'Igual que lo general' } })}</div>`; }).join('') : '').join('');
  box.innerHTML = `
    <div class="perm-editor">
      <div class="perm-head">${avatarHtml(person, 'is-big')}<div><strong>${shareEsc(person.displayName || email)}</strong><small>${shareEsc(email)}</small></div></div>
      <div class="perm-board-block is-general" id="permGeneral"><div class="perm-board-name">En general (lienzo, proyectos y tableros nuevos)</div>${permBoxesHtml(general, { agregar: true })}</div>
      <div class="share-sep">Por tablero</div>
      ${boardsHtml || '<p class="share-note">No hay tableros.</p>'}
      <p class="share-note">Marca lo que esta persona puede hacer con lo que creaste tú u otras personas. Lo que ella crea lo puede ver, editar y eliminar siempre. Para un objeto en particular, toca su candado. Los permisos quedan en tu Drive personal: solo tú los puedes cambiar.</p>
      <div class="share-actions"><button class="btn btn-ghost" id="permCancel">Volver</button><button class="btn btn-primary" id="permSave">Guardar permisos</button></div>
    </div>`;
  el('permCancel').addEventListener('click', enhanceMembersList);
  el('permSave').addEventListener('click', async (e) => {
    const boards = {};
    box.querySelectorAll('[data-board-block]').forEach(b => { const p = readPermBoxes(b); if (p) boards[b.dataset.boardBlock] = { ver: p.ver, editar: p.editar, eliminar: p.eliminar }; });
    const g = readPermBoxes(el('permGeneral'));
    perms.members[email] = { perm: g, level: levelOfPerm(g), boards };
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
    .perm-lock { position: absolute; top: calc(-22px * var(--inv-zoom, 1)); right: 0; width: calc(20px * var(--inv-zoom, 1)); height: calc(20px * var(--inv-zoom, 1)); padding: calc(2px * var(--inv-zoom, 1)); box-sizing: border-box; border-radius: 50%; background: var(--bg-surface, #fff); box-shadow: 0 1px 4px rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; z-index: 5; cursor: help; }
    .perm-lock { pointer-events: auto; }
    .perm-lock svg { width: 100%; height: 100%; display: block; }
    .lock-popover { position: fixed; z-index: 100000; width: 340px; max-width: calc(100vw - 16px); max-height: 70vh; overflow: auto; padding: 12px; border-radius: 12px; background: var(--bg-surface, #fff); color: var(--text-main, #111); border: 1px solid var(--border-medium, #ccc); box-shadow: 0 8px 28px rgba(0,0,0,.35); font-size: .85rem; }
    .lock-pop-title { font-weight: 800; margin-bottom: 8px; }
    .lock-pop-list { display: flex; flex-direction: column; gap: 10px; }
    .lock-pop-row { display: flex; align-items: flex-start; gap: 8px; }
    .lock-pop-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .lock-pop-who select { width: 100%; font: inherit; }
    .lock-pop-who small { color: var(--text-muted, #666); }
    .lock-toggle { display: flex !important; align-items: center; gap: 6px; margin-top: 4px; font-size: 0.78rem; color: var(--text-main); cursor: pointer; }
    .lock-toggle input { margin: 0; }
    .perm-lock.is-full { color: #16a34a; }
    .perm-lock.is-part { color: #eab308; }
    .perm-hidden { display: none !important; }
    .perm-boxes { display: flex; flex-direction: column; gap: 4px; }
    .perm-box-row { display: flex; flex-wrap: wrap; gap: 4px 14px; }
    .perm-box { display: inline-flex; align-items: center; gap: 5px; font-size: .85rem; cursor: pointer; }
    .perm-box input { accent-color: var(--accent-primary, #6366f1); }
    .perm-inherit { color: var(--text-muted, #666); }
    .perm-board-block { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-top: 1px solid var(--border-medium, #ddd); }
    .perm-board-name { font-weight: 600; font-size: .85rem; }
    .perm-lock.is-view { color: #dc2626; }
    .board-frame > .perm-lock { right: auto; left: 0; }
  `;
  document.head.appendChild(style);
})();

// ----- Candado en cada objeto del lienzo (solo en un espacio compartido) -----
// Verde abierto: puedes ver, editar y eliminar · Amarillo abierto: puedes hacer solo una parte (por ejemplo ver y editar,
// pero no eliminar) · Rojo cerrado: solo puedes verlo. Si no puedes ver un objeto, no se muestra.
const LOCK_KINDS = {
  full: { cls: 'is-full', title: 'Candado verde: puedes ver, editar y eliminar este objeto' },
  part: { cls: 'is-part', title: 'Candado amarillo: tienes solo parte de los permisos de este objeto' },
  view: { cls: 'is-view', title: 'Candado rojo: solo puedes ver este objeto' }
};
const LOCK_SVG = {
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" fill-opacity=".25"></rect><path d="M8 11V7a4 4 0 0 1 7.5-2"></path></svg>',
  closed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" fill-opacity=".25"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>'
};

function lockKindOf(p) {
  if (!p.editar && !p.eliminar) return 'view';
  return p.editar && p.eliminar ? 'full' : 'part';
}

function putObjectLock(el, kind, key, detail) {
  let b = el.querySelector(':scope > .perm-lock');
  if (!kind) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('span');
    el.appendChild(b);
  }
  b.dataset.key = key || '';
  const k = LOCK_KINDS[kind];
  b.className = `perm-lock ${k.cls}`;
  b.title = (detail || k.title) + ' · toca para ver y cambiar los permisos de las personas';
  b.setAttribute('aria-label', k.title);
  b.innerHTML = kind === 'view' ? LOCK_SVG.closed : LOCK_SVG.open;
}

// Mostrar u ocultar los candados de los objetos (casilla en la ventana de datos compartidos; se recuerda en este equipo)
function locksVisible() {
  try { return localStorage.getItem('zenban_show_locks') !== '0'; } catch (e) { return true; }
}

function markObjectLocks() {
  const on = inShared() && !!myEmail();
  const find = (list, id) => (list || []).find(x => x && String(x.id) === String(id));
  const project = on ? getActiveProject() : null;
  const sets = [
    ['.canvas-text[data-text-id]', 'textId', () => getTexts(), false, 'texts'],
    ['.bg-image[data-image-id]', 'imageId', () => getBgImages(), false, 'bgImages'],
    ['.canvas-frame[data-frame-id]', 'frameId', () => getFrames(), false, 'frames'],
    ['.board-frame[data-board-id]', 'boardId', () => (project && project.boards) || [], true, 'boards']
  ];
  sets.forEach(([sel, key, list, isBoard, arr]) => {
    let items = null;
    document.querySelectorAll(sel).forEach(el => {
      if (!on) { putObjectLock(el, null); el.classList.remove('perm-hidden'); return; }
      items = items || list();
      const item = find(items, el.dataset[key]);
      const k = item ? objectKey(arr, item.id) : null;
      const p = item ? myPerm({ boardId: isBoard ? item.id : null, key: k, item }) : null;
      // Sin la casilla «Ver» el objeto no se muestra
      el.classList.toggle('perm-hidden', !!p && !p.ver);
      putObjectLock(el, p && locksVisible() ? lockKindOf(p) : null, k, p ? `${LOCK_KINDS[lockKindOf(p)].title.split(':')[0]}: ${permSummary(p).toLowerCase()}` : null);
    });
  });
}

// El lienzo captura el puntero en pointerdown (mover, seleccionar), y entonces el click nunca llega al candado:
// por eso el recuadro se abre en pointerdown, en la fase de captura de window, antes que cualquier otro manejador.
window.addEventListener('pointerdown', (e) => {
  const lock = e.target.closest && e.target.closest('.perm-lock');
  if (!lock || e.button > 0) return;
  e.preventDefault();
  e.stopPropagation();
  openLockPopover(lock);
}, true);

// ----- Al tocar el candado: las personas del proyecto y su permiso sobre ESE objeto -----
// El dueño puede cambiar el permiso de cada persona para este objeto; vale por encima del que tiene en el proyecto.
function lockObjectByKey(key) {
  const i = key.indexOf(':');
  const arr = key.slice(0, i), id = key.slice(i + 1);
  const project = getActiveProject();
  return { arr, id, item: ((project && project[arr]) || []).find(x => x && String(x.id) === id) || null };
}

// Permiso de una persona sobre este objeto: el efectivo, y el propio del objeto (o del tablero) si lo tiene
function personPermOnObject(email, role, key, item) {
  const { arr, id } = lockObjectByKey(key);
  const over = role === 'owner' ? null : (arr === 'boards' ? boardPermOf(email, id) : objectPermOf(email, key));
  return { perm: role === 'owner' ? { ...PERM_ALL } : permOf(email, { boardId: arr === 'boards' ? id : null, key: arr === 'boards' ? null : key, item }), over };
}

function lockPermText(p) {
  const dot = lockKindOf(p) === 'full' ? '🟢' : lockKindOf(p) === 'part' ? '🟡' : '🔴';
  return `${p.ver ? dot : '⚫'} ${permSummary(p)}`;
}

function closeLockPopover() {
  const p = document.getElementById('lockPopover');
  if (p) p.remove();
  document.removeEventListener('pointerdown', onLockPopoverOutside, true);
  document.removeEventListener('keydown', onLockPopoverKey, true);
}
function onLockPopoverOutside(e) { const p = document.getElementById('lockPopover'); if (p && !p.contains(e.target)) closeLockPopover(); }
function onLockPopoverKey(e) { if (e.key === 'Escape') closeLockPopover(); }

async function openLockPopover(lockEl) {
  closeLockPopover();
  const key = lockEl.dataset.key;
  if (!key) return;
  const owner = iAmSpaceOwner();
  const pop = document.createElement('div');
  pop.id = 'lockPopover';
  pop.className = 'lock-popover';
  pop.innerHTML = '<p class="share-note">Cargando personas…</p>';
  document.body.appendChild(pop);
  const r = lockEl.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 330))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 120))}px`;
  // Se agregan después de este toque, para que el mismo toque no cierre el recuadro
  setTimeout(() => {
    if (!document.getElementById('lockPopover')) return;
    document.addEventListener('pointerdown', onLockPopoverOutside, true);
    document.addEventListener('keydown', onLockPopoverKey, true);
  }, 0);
  const members = cachedMembers() || await refreshMembers() || [];
  if (!document.getElementById('lockPopover')) return;
  const { arr, item } = lockObjectByKey(key);
  if (!members.length) { pop.innerHTML = '<p class="share-note">No hay otras personas en este proyecto.</p>'; return; }
  pop.innerHTML = `
    <div class="lock-pop-title">Permisos de este objeto</div>
    <div class="lock-pop-list">${members.map(p => {
      const email = (p.emailAddress || '').toLowerCase();
      const isOwner = p.role === 'owner';
      const { perm, over } = personPermOnObject(email, p.role, key, item);
      const creator = !isOwner && item && item.createdBy && item.createdBy === email; // lo que uno crea, lo controla entero
      const control = isOwner
        ? '<small>🟢 Dueño: ve, edita y elimina todo</small>'
        : creator
          ? '<small>🟢 Lo creó esta persona: ve, edita y elimina</small>'
          : owner
            ? `<div data-lock-email="${shareEsc(email)}">${permBoxesHtml(over || perm, { inherit: { on: !over, text: `Igual que el proyecto${over ? '' : ` (${permSummary(perm).toLowerCase()})`}` } })}</div>`
            : `<small>${shareEsc(lockPermText(perm))}${over ? ' · propio de este objeto' : ''}</small>`;
      return `<div class="lock-pop-row">${avatarHtml(p)}<div class="lock-pop-who"><strong>${shareEsc(p.displayName || p.emailAddress || '')}</strong>${control}</div></div>`;
    }).join('')}</div>
    ${owner ? `<div class="share-actions"><button class="btn btn-ghost" type="button" id="lockPopCancel">Cerrar</button><button class="btn btn-primary" type="button" id="lockPopSave">Guardar</button></div>
      <p class="share-note">Lo que marques vale por encima del permiso del proyecto, solo para este objeto. Quien crea un objeto siempre tiene todos los permisos sobre él.</p>`
      : '<p class="share-note">Solo el dueño de los datos compartidos puede cambiar los permisos.</p>'}`;
  // Con el contenido ya puesto, se acomoda para que quepa entero en la pantalla (si no cabe abajo, va arriba del candado)
  const h = pop.offsetHeight, w = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  pop.style.top = `${r.bottom + 6 + h <= window.innerHeight - 8 ? r.bottom + 6 : Math.max(8, Math.min(r.top - h - 6, window.innerHeight - h - 8))}px`;
  const cancel = pop.querySelector('#lockPopCancel');
  if (cancel) cancel.addEventListener('click', closeLockPopover);
  const save = pop.querySelector('#lockPopSave');
  if (save) save.addEventListener('click', async () => {
    const perms = { members: JSON.parse(JSON.stringify((spacePerms && spacePerms.members) || {})), objects: JSON.parse(JSON.stringify((spacePerms && spacePerms.objects) || {})) };
    const { id } = lockObjectByKey(key);
    pop.querySelectorAll('[data-lock-email]').forEach(row => {
      const email = row.dataset.lockEmail;
      const p = readPermBoxes(row); // null = igual que el proyecto
      const val = p ? { ver: p.ver, editar: p.editar, eliminar: p.eliminar } : null;
      if (arr === 'boards') {
        const m = perms.members[email] || (perms.members[email] = { boards: {} });
        m.boards = m.boards || {};
        if (val) m.boards[id] = val; else delete m.boards[id];
      } else {
        const o = perms.objects[key] || (perms.objects[key] = {});
        if (val) o[email] = val; else delete o[email];
        if (!Object.keys(o).length) delete perms.objects[key];
      }
    });
    save.disabled = true;
    save.textContent = 'Guardando…';
    try {
      await saveSpacePerms(perms, members);
      showToast('Permisos del objeto guardados', 'success');
      markObjectLocks();
      markReadOnlyBoards();
      closeLockPopover();
    } catch (err) {
      console.warn(err);
      showToast('No se pudieron guardar los permisos', 'warning');
      save.disabled = false;
      save.textContent = 'Guardar';
    }
  });
}

['renderTexts', 'renderBgImages', 'renderFrames'].forEach(name => {
  const base = window[name];
  if (typeof base !== 'function') return;
  window[name] = function () {
    const r = base.apply(this, arguments);
    try { markObjectLocks(); } catch (e) { console.warn('Candados', e); }
    return r;
  };
});
{
  const baseRenderBoardForLocks = renderBoard; // ya envuelta arriba para los permisos de tableros
  renderBoard = function () {
    const r = baseRenderBoardForLocks.apply(this, arguments);
    try { markObjectLocks(); } catch (e) { console.warn('Candados', e); }
    return r;
  };
}
// Los permisos llegan después de dibujar el lienzo (se leen de Drive): al llegar se vuelven a poner los candados
const baseLoadSpacePermsForLocks = loadSpacePerms;
loadSpacePerms = async function () {
  const r = await baseLoadSpacePermsForLocks.apply(this, arguments);
  try { markObjectLocks(); } catch (e) {}
  return r;
};
