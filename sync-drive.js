// ===== ZenBan - Sesión, espacios y Google Drive =====
// Estado de la sincronización (SYNC), claves guardadas, sesión de Google, espacio de datos (personal o
// compartido) y acceso a los archivos de Drive. Se carga antes de app.js.

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
  DATA_SPACE: 'zenban_data_space', // espacio al que pertenecen los datos guardados en este navegador
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

// Los datos guardados en este navegador son de otro espacio: se usan los de Drive tal cual, sin combinar.
// (Si no, un dispositivo que quedó con los proyectos personales en el compartido los vuelve a subir
// en cada sincronización.) Las versiones anteriores no anotaban el espacio: en un compartido no se confía.
function localDataOfOtherSpace() {
  const owner = localStorage.getItem(SYNC_KEYS.DATA_SPACE);
  return owner ? owner !== tabSpaceKey : inShared();
}

// Cada proyecto lleva anotado el espacio al que pertenece (p.space). Al sincronizar, un proyecto de otro
// espacio nunca se sube aquí: aunque lo traiga otro dispositivo (el celular y el PC abiertos a la vez,
// cada uno en un espacio) o una versión vieja de la app que mezcló los datos.
function claimProjects(list, key) {
  let n = 0;
  (list || []).forEach(p => { if (p && !p.space) { p.space = key; n++; } });
  return n;
}

function foreignProjects(list, key) {
  return (list || []).filter(p => p && p.space && p.space !== key);
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
