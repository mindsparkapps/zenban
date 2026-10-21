// ===== ZenBan - Copias de seguridad en este dispositivo =====
// Red de seguridad para no perder trabajo: antes de que la sincronización reemplace datos de este
// dispositivo y algo deje de estar (tareas, textos, imágenes, tableros…), se guarda una copia.
// También se guarda una copia automática cada 12 horas. Desde ⚙️ Configuración › Copias de seguridad
// se ve cada copia y "Recuperar lo que falta" devuelve lo que ya no está (sin borrar nada de lo actual).

const BACKUP_LIMIT = 20;
const BACKUP_AUTO_MS = 12 * 3600 * 1000;

const Backups = {
  key() { return 'backups:' + (inShared() ? currentSpace().folderId : 'personal'); },
  async list() {
    try {
      const db = await SyncBase.open();
      return await new Promise((resolve) => {
        const q = db.transaction('kv').objectStore('kv').get(this.key());
        q.onsuccess = () => resolve(Array.isArray(q.result) ? q.result : []);
        q.onerror = () => resolve([]);
      });
    } catch (e) { return []; }
  },
  async save(list) {
    try {
      const db = await SyncBase.open();
      await new Promise((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(list, this.key());
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    } catch (e) {}
  },
  // json: los datos ya convertidos a texto (se toman en el momento, antes de que cambien)
  async add(reason, json, count) {
    const list = await this.list();
    list.unshift({ at: Date.now(), reason, count, json });
    await this.save(list.slice(0, BACKUP_LIMIT));
  }
};

// Todos los objetos de unos datos como "tipo:id" (para saber qué deja de estar)
function payloadObjectIds(payload) {
  const ids = new Set();
  ((payload && payload.projects) || []).forEach(p => {
    ids.add(`project:${p.id}`);
    ['tasks', 'columns', 'boards', 'texts', 'bgImages', 'drawings', 'frames', 'connectors'].forEach(k => {
      (p[k] || []).forEach(o => { if (o && o.id != null) ids.add(`${k}:${o.id}`); });
    });
  });
  return ids;
}

// La llama la sincronización justo antes de reemplazar los datos de este dispositivo.
// Devuelve cuántos de los que se van nunca habían llegado a Drive (eso no debería pasar: se avisa).
async function backupBeforeReplace(local, result, base, reason) {
  const before = payloadObjectIds(local);
  const after = payloadObjectIds(result);
  const dropped = [...before].filter(id => !after.has(id));
  if (!dropped.length) return 0;
  const json = JSON.stringify(dataPart(local)); // ahora, antes de aplicar los cambios
  const baseIds = base ? payloadObjectIds(base) : new Set();
  const unsynced = dropped.filter(id => !baseIds.has(id)).length;
  await Backups.add(reason, json, dropped.length);
  if (unsynced) {
    showToast(`Se guardó una copia de ${unsynced} elemento(s) de este dispositivo que no estaban en Drive. Recupéralos en ⚙️ Configuración › Copias de seguridad.`, 'warning');
  }
  return unsynced;
}

async function autoBackup() {
  const list = await Backups.list();
  const lastAuto = list.find(b => b.reason === 'Copia automática');
  if (lastAuto && Date.now() - lastAuto.at < BACKUP_AUTO_MS) return;
  await Backups.add('Copia automática', JSON.stringify(dataPart(localPayload())), 0);
}
setTimeout(() => autoBackup().catch(() => {}), 8000);

// ----- Ventana "Copias de seguridad" -----
function backupSummary(data) {
  const n = { projects: 0, tasks: 0, texts: 0, images: 0, boards: 0 };
  (data.projects || []).forEach(p => {
    n.projects++;
    n.tasks += (p.tasks || []).length;
    n.texts += (p.texts || []).length;
    n.images += (p.bgImages || []).length;
    n.boards += (p.boards || []).length;
  });
  return `${n.projects} proyecto(s) · ${n.tasks} tarea(s) · ${n.texts} texto(s) · ${n.images} imagen(es)`;
}

async function openBackups() {
  let m = document.getElementById('backupsModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'backupsModal';
    m.innerHTML = `
      <div class="modal-card backups-card">
        <div class="modal-header">
          <h2>🛟 Copias de seguridad</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div class="backups-body">
          <p class="setup-text">Se guardan en este dispositivo antes de que la sincronización quite algo de aquí, y una automática cada 12 horas. "Recuperar lo que falta" devuelve lo que hoy no está, sin borrar nada de lo actual.</p>
          <div class="backups-list"></div>
        </div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.style.display = 'none'; });
    document.body.appendChild(m);
  }
  const listEl = m.querySelector('.backups-list');
  listEl.innerHTML = '<p class="setup-text">Cargando…</p>';
  m.style.display = 'flex';
  const list = await Backups.list();
  const now = payloadObjectIds(localPayload());
  if (!list.length) { listEl.innerHTML = '<p class="setup-text">Todavía no hay copias en este dispositivo.</p>'; return; }
  listEl.innerHTML = list.map((b, i) => {
    let data = null;
    try { data = JSON.parse(b.json); } catch (e) {}
    const missing = data ? [...payloadObjectIds(data)].filter(id => !now.has(id)).length : 0;
    return `<div class="backup-row">
      <div class="backup-info"><b>${escapeHtml(new Date(b.at).toLocaleString())}</b><small>${escapeHtml(b.reason)}${data ? ` · ${escapeHtml(backupSummary(data))}` : ''}</small>
        <small class="${missing ? 'backup-missing' : ''}">${missing ? `${missing} elemento(s) que hoy no están` : 'Todo lo de esta copia está en tus datos actuales'}</small></div>
      <button type="button" class="btn ${missing ? 'btn-primary' : 'btn-ghost'} btn-sm" data-restore="${i}" ${missing ? '' : 'disabled'}>Recuperar lo que falta</button>
    </div>`;
  }).join('');
  listEl.onclick = async (e) => {
    const btn = e.target.closest('[data-restore]');
    if (!btn) return;
    const b = list[Number(btn.dataset.restore)];
    const ok = await askConfirm({
      title: '¿Recuperar lo que falta?',
      message: 'Se agregan a tus datos los elementos de esta copia que hoy no están. No se borra ni se cambia nada de lo actual.',
      confirmText: 'Recuperar', icon: '🛟'
    });
    if (!ok) return;
    restoreBackup(b);
    m.style.display = 'none';
  };
}

function restoreBackup(b) {
  const data = JSON.parse(b.json);
  const before = payloadObjectIds(localPayload()).size;
  // Sin base: se juntan ambos (lo de aquí gana si un elemento está en los dos)
  const merged = mergePayloads(localPayload(), { ...data, deletedProjects: [] }, null);
  merged.deletedProjects = deletedProjects();
  applyPayload(merged);
  // Que se suba a Drive
  onLocalDataChanged();
  const added = payloadObjectIds(localPayload()).size - before;
  showToast(added ? `Se recuperaron ${added} elemento(s)` : 'No había nada para recuperar', added ? 'success' : 'info');
}

document.getElementById('openBackupsBtn').addEventListener('click', openBackups);
