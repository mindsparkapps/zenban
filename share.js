// ===== ZenBan - Datos compartidos entre varias cuentas de Google =====
// Quien comparte crea una carpeta en su Drive ("ZenBan (datos compartidos)") y la comparte
// como editor con las demás cuentas. Todas las personas sincronizan contra esa carpeta.

const SHARE_KEY = 'zenban';
const SHARE_FOLDER_NAME = 'ZenBan (datos compartidos)';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function el(id) { return document.getElementById(id); }

function myEmail() { return ((savedUser() || {}).email || '').toLowerCase(); }

function dismissedInvites() {
  try { return JSON.parse(localStorage.getItem('zenban_invites_dismissed') || '[]'); } catch (e) { return []; }
}

// Comprueba que la carpeta compartida sigue existiendo y que aún tienes acceso
async function checkSharedFolder() {
  const s = currentSpace();
  try {
    const f = await (await driveFetch(`${DRIVE_API}/files/${s.folderId}?fields=id,name,trashed,owners(emailAddress,displayName)&supportsAllDrives=true`)).json();
    if (f.trashed) { const e = new Error('gone'); e.status = 404; throw e; }
    const owner = (f.owners && f.owners[0]) || {};
    if (f.name !== s.folderName || owner.emailAddress !== s.ownerEmail) {
      localStorage.setItem('zenban_space', JSON.stringify({ ...s, folderName: f.name, ownerEmail: owner.emailAddress, ownerName: owner.displayName }));
      renderShareState();
    }
    return true;
  } catch (e) {
    if (e.status === 404 || e.status === 403) {
      setSpace({ mode: 'personal' });
      markSpaceSwitch();
      renderShareState();
      showToast('Ya no tienes acceso a los datos compartidos. Volviste a tus datos personales.', 'warning');
      return false;
    }
    throw e;
  }
}

async function driveJson(url, method = 'GET', body = null) {
  const opts = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const r = await driveFetch(url, opts);
  return r.status === 204 ? null : r.json();
}

async function createSharedSpace(emails) {
  const folder = await driveJson(`${DRIVE_API}/files?fields=id,name&supportsAllDrives=true`, 'POST', {
    name: SHARE_FOLDER_NAME,
    mimeType: FOLDER_MIME,
    properties: { [SHARE_KEY]: 'shared' }
  });
  const user = savedUser() || {};
  setSpace({ mode: 'shared', folderId: folder.id, folderName: folder.name, ownerEmail: user.email, ownerName: user.name });
  setDirty(true);
  for (const email of emails) await addMember(email);
  renderShareState();
  await syncNow();
}

async function addMember(email) {
  const s = currentSpace();
  const msg = encodeURIComponent('Te compartí mis tableros de ZenBan. Abre https://mindsparkapps.github.io/zenban/ e inicia sesión con esta cuenta de Google.');
  await driveJson(`${DRIVE_API}/files/${s.folderId}/permissions?sendNotificationEmail=true&emailMessage=${msg}&supportsAllDrives=true`, 'POST', {
    type: 'user',
    role: 'writer',
    emailAddress: email
  });
}

async function listMembers() {
  const s = currentSpace();
  const j = await driveJson(`${DRIVE_API}/files/${s.folderId}/permissions?fields=permissions(id,type,role,emailAddress,displayName,photoLink)&supportsAllDrives=true`);
  return (j.permissions || []).filter(p => p.type === 'user');
}

async function removeMember(permissionId) {
  await driveJson(`${DRIVE_API}/files/${currentSpace().folderId}/permissions/${permissionId}?supportsAllDrives=true`, 'DELETE');
}

async function findSharedSpaces() {
  const q = `mimeType='${FOLDER_MIME}' and properties has { key='${SHARE_KEY}' and value='shared' } and trashed=false`;
  const j = await driveJson(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,ownedByMe,owners(emailAddress,displayName))&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=50`);
  return j.files || [];
}

// Cambia de espacio con el aviso "Abriendo…": primero sube lo pendiente del espacio actual
// (para no perderlo) y después trae los datos del nuevo
async function changeSpaceWithBusy(space, label, message, type) {
  closeShareModal();
  showBusy(label);
  try {
    if (isDirty() && SYNC.token) {
      await syncNow();
      if (typeof waitSyncIdle === 'function') await waitSyncIdle();
    }
    setSpace(space);
    // Primera sincronización con ese espacio: se usan sus datos tal cual (no se mezclan)
    markSpaceSwitch();
    renderShareState();
    await syncNow();
    if (typeof waitSyncIdle === 'function') await waitSyncIdle();
    showToast(message, type);
  } finally {
    hideBusy();
    if (typeof renderSpaceIndicator === 'function') renderSpaceIndicator();
  }
}

function joinSharedSpace(folder) {
  const owner = (folder.owners && folder.owners[0]) || {};
  return changeSpaceWithBusy(
    { mode: 'shared', folderId: folder.id, folderName: folder.name, ownerEmail: owner.emailAddress, ownerName: owner.displayName },
    `Abriendo los datos compartidos «${folder.name}»…`,
    `Usando los datos compartidos "${folder.name}"`, 'success');
}

function leaveSharedSpace() {
  return changeSpaceWithBusy(
    { mode: 'personal' },
    'Abriendo tus datos personales…',
    'Volviste a tus datos personales. Los datos compartidos siguen en la carpeta.', 'info');
}

// Al iniciar sesión: si hay datos compartidos (de otra persona, o tuyos creados desde otro dispositivo), se te ofrecen
async function checkSharedInvites() {
  if (inShared() || !SYNC.token) return;
  try {
    const dismissed = dismissedInvites();
    const invites = (await findSharedSpaces()).filter(f => !dismissed.includes(f.id));
    if (invites.length) openShareModal(invites);
  } catch (e) {
    console.warn('Buscar datos compartidos', e);
  }
}

// ----- Interfaz -----
function shareEsc(s) { return escapeHtml(s == null ? '' : String(s)); }

function renderShareState() {
  const badge = el('shareBadge');
  const s = currentSpace();
  if (badge) {
    badge.hidden = !inShared();
    badge.title = inShared() ? `Datos compartidos: ${s.folderName || ''}` : '';
  }
  const item = el('shareMenuBtn');
  if (item) item.textContent = inShared() ? '👥 Datos compartidos' : '👥 Compartir datos…';
}

function closeShareModal() {
  const m = el('shareModal');
  if (m) m.style.display = 'none';
}

function shareModalShell() {
  let m = el('shareModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'shareModal';
    m.style.display = 'none';
    m.innerHTML = `
      <div class="modal-card modal-sm">
        <div class="modal-header">
          <h2>👥 Datos compartidos</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div id="shareBody"></div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeShareModal(); });
    document.body.appendChild(m);
  }
  m.style.display = 'flex';
  return el('shareBody');
}

function parseEmails(text) {
  return [...new Set(String(text).split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
}

async function openShareModal(invites = null) {
  if (!SYNC.token || Date.now() > SYNC.tokenExp) { requestReconnect('Para compartir datos, reconecta con Google desde tu foto.'); return; }
  const body = shareModalShell();

  // Alguien compartió datos contigo
  if (invites && invites.length) {
    body.innerHTML = `
      <p class="share-text">${invites.every(f => f.ownedByMe)
        ? 'En otro dispositivo usas tus tableros como datos compartidos. Úsalos aquí también para ver lo mismo en todos tus dispositivos.'
        : 'Te compartieron tableros de ZenBan. Si los usas, verás y editarás lo mismo que las demás personas.'}</p>
      <div class="share-list">${invites.map(f => {
        const o = (f.owners && f.owners[0]) || {};
        return `<div class="share-row"><div><strong>${shareEsc(f.name)}</strong><small>${f.ownedByMe ? 'Tuya (creada en otro dispositivo)' : 'De ' + shareEsc(o.displayName || o.emailAddress || 'otra cuenta')}</small></div>
          <button class="btn btn-primary share-btn-sm" data-join="${shareEsc(f.id)}">Usar</button></div>`;
      }).join('')}</div>
      <div class="share-actions"><button class="btn btn-ghost" data-later>Ahora no</button></div>`;
    body.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => {
      joinSharedSpace(invites.find(f => f.id === b.dataset.join));
    }));
    body.querySelector('[data-later]').addEventListener('click', () => {
      localStorage.setItem('zenban_invites_dismissed', JSON.stringify([...dismissedInvites(), ...invites.map(f => f.id)]));
      closeShareModal();
      showToast('Puedes usarlos después desde tu foto → Compartir datos', 'info');
    });
    return;
  }

  // Todavía no usas datos compartidos
  if (!inShared()) {
    body.innerHTML = `
      <p class="share-text">Comparte tus datos con otras cuentas de Google: todos verán y editarán lo mismo y los cambios llegan a los demás en unos segundos.</p>
      <div class="form-group">
        <label>Correos de Gmail de las personas</label>
        <textarea id="shareEmails" rows="3" placeholder="persona1@gmail.com, persona2@gmail.com"></textarea>
      </div>
      <p class="share-note">Se creará la carpeta "${SHARE_FOLDER_NAME}" en tu Google Drive con tus datos actuales.</p>
      <div class="share-actions"><button class="btn btn-primary" id="shareCreateBtn">Compartir</button></div>
      <div class="share-sep">¿Alguien ya compartió datos contigo?</div>
      <div class="share-actions"><button class="btn btn-ghost" id="shareFindBtn">Buscar datos compartidos conmigo</button></div>
      <div id="shareFound"></div>`;
    el('shareCreateBtn').addEventListener('click', async (e) => {
      const emails = parseEmails(el('shareEmails').value).filter(x => x !== myEmail());
      if (!emails.length) { showToast('Escribe al menos un correo válido', 'warning'); return; }
      e.target.disabled = true;
      e.target.textContent = 'Compartiendo…';
      try {
        await createSharedSpace(emails);
        showToast('Datos compartidos. Les llegará un correo de Google.', 'success');
        openShareModal();
      } catch (err) {
        console.warn(err);
        showToast('No se pudo compartir. Revisa los correos e inténtalo de nuevo.', 'warning');
        e.target.disabled = false;
        e.target.textContent = 'Compartir';
      }
    });
    el('shareFindBtn').addEventListener('click', async () => {
      const box = el('shareFound');
      box.innerHTML = '<p class="share-note">Buscando…</p>';
      try {
        const found = await findSharedSpaces();
        if (!found.length) { box.innerHTML = '<p class="share-note">No encontré datos compartidos contigo.</p>'; return; }
        box.innerHTML = `<div class="share-list">${found.map(f => {
          const o = (f.owners && f.owners[0]) || {};
          return `<div class="share-row"><div><strong>${shareEsc(f.name)}</strong><small>${f.ownedByMe ? 'Tuya' : 'De ' + shareEsc(o.displayName || o.emailAddress || '')}</small></div>
            <button class="btn btn-primary share-btn-sm" data-join="${shareEsc(f.id)}">Usar</button></div>`;
        }).join('')}</div>`;
        box.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => joinSharedSpace(found.find(f => f.id === b.dataset.join))));
      } catch (err) {
        box.innerHTML = '<p class="share-note">No se pudo buscar. Inténtalo de nuevo.</p>';
      }
    });
    return;
  }

  // Ya usas datos compartidos: personas con acceso
  const s = currentSpace();
  const isOwner = (s.ownerEmail || '').toLowerCase() === myEmail();
  body.innerHTML = `
    <p class="share-text">Estás usando los datos compartidos <strong>${shareEsc(s.folderName || '')}</strong>${isOwner ? '' : ` de ${shareEsc(s.ownerName || s.ownerEmail || '')}`}.</p>
    <div class="share-sep">Personas con acceso</div>
    <div class="share-list" id="shareMembers"><p class="share-note">Cargando…</p></div>
    <div class="form-group" style="margin-top:12px;">
      <label>Agregar personas</label>
      <textarea id="shareEmails" rows="2" placeholder="correo@gmail.com"></textarea>
    </div>
    <div class="share-actions"><button class="btn btn-primary" id="shareAddBtn">Agregar</button></div>
    <div class="share-sep"></div>
    <div class="share-actions"><button class="btn btn-ghost" id="shareLeaveBtn">Volver a mis datos personales</button></div>`;

  const renderMembers = async () => {
    const box = el('shareMembers');
    try {
      const members = await listMembers();
      box.innerHTML = members.map(p => `
        <div class="share-row">
          <div><strong>${shareEsc(p.displayName || p.emailAddress)}</strong><small>${shareEsc(p.emailAddress || '')} · ${p.role === 'owner' ? 'dueño' : 'puede editar'}</small></div>
          ${isOwner && p.role !== 'owner' ? `<button class="btn btn-ghost share-btn-sm" data-remove="${shareEsc(p.id)}">Quitar</button>` : ''}
        </div>`).join('');
      box.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await removeMember(b.dataset.remove); showToast('Acceso quitado', 'success'); } catch (e) { showToast('No se pudo quitar el acceso', 'warning'); }
        renderMembers();
      }));
    } catch (e) {
      box.innerHTML = '<p class="share-note">No se pudo cargar la lista.</p>';
    }
  };
  renderMembers();

  el('shareAddBtn').addEventListener('click', async (e) => {
    const emails = parseEmails(el('shareEmails').value).filter(x => x !== myEmail());
    if (!emails.length) { showToast('Escribe al menos un correo válido', 'warning'); return; }
    e.target.disabled = true;
    try {
      for (const email of emails) await addMember(email);
      el('shareEmails').value = '';
      showToast('Persona agregada. Le llegará un correo de Google.', 'success');
    } catch (err) {
      showToast('No se pudo agregar. Revisa el correo.', 'warning');
    }
    e.target.disabled = false;
    renderMembers();
  });
  el('shareLeaveBtn').addEventListener('click', async () => {
    const ok = await askConfirm({
      title: '¿Dejar de usar los datos compartidos?',
      message: 'En este dispositivo volverás a tus datos personales. Los datos compartidos siguen en la carpeta y las demás personas no se ven afectadas.',
      confirmText: 'Volver a mis datos', icon: '👥'
    });
    if (ok) leaveSharedSpace();
  });
}

function setupSharing() {
  const style = document.createElement('style');
  style.textContent = `
    .share-text { color: var(--text-muted); margin: 0 0 14px; line-height: 1.5; }
    .share-note { color: var(--text-dim); font-size: 0.82rem; margin: 6px 0 12px; }
    .share-actions { display: flex; justify-content: flex-end; gap: 8px; margin: 6px 0; }
    .share-sep { color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 8px; border-top: 1px solid var(--border-subtle); padding-top: 14px; }
    .share-list { display: flex; flex-direction: column; gap: 6px; }
    .share-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 10px; }
    .share-row strong { display: block; color: var(--text-main); font-size: 0.92rem; }
    .share-row small { display: block; color: var(--text-muted); font-size: 0.78rem; word-break: break-all; }
    .share-badge { position: absolute; left: -4px; bottom: -4px; font-size: 12px; line-height: 1; background: var(--bg-surface); border-radius: 50%; padding: 1px; }
    .share-badge[hidden] { display: none; }
    .share-btn-sm { padding: 6px 12px; font-size: 0.82rem; }
    #shareBody { padding: 1.25rem 1.5rem 1.5rem; max-height: 70vh; overflow-y: auto; }
    #shareBody textarea { width: 100%; }
  `;
  document.head.appendChild(style);

  const chip = el('accountChip');
  if (chip && !el('shareBadge')) {
    const b = document.createElement('span');
    b.className = 'share-badge';
    b.id = 'shareBadge';
    b.textContent = '👥';
    b.hidden = true;
    chip.appendChild(b);
  }
  const syncBtn = el('syncNowBtn');
  if (syncBtn && !el('shareMenuBtn')) {
    const btn = document.createElement('button');
    btn.className = 'account-menu-btn';
    btn.id = 'shareMenuBtn';
    btn.addEventListener('click', () => { el('accountMenu').hidden = true; openShareModal(); });
    syncBtn.parentNode.insertBefore(btn, syncBtn);
  }
  renderShareState();
}
setupSharing();
