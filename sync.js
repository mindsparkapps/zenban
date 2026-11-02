// ===== ZenBan - Ciclo de sincronización con Drive =====
// Cuándo sincronizar, qué subir y qué traer: syncNow() combina lo de este navegador con Drive (merge en
// sync-merge.js, acceso a Drive en sync-drive.js) y syncImages() sube y baja las imágenes.

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

// ----- Datos: empaquetar, combinar y aplicar -----
function localPayload() {
  return { version: 1, projects, tags: tagLibrary, deletedProjects: deletedProjects() };
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
  // Hay una versión más nueva publicada: no se sube nada con esta y se actualiza (sigue al recargar)
  if (AppUpdate.pending) {
    applyAppUpdate();
    return;
  }
  SYNC.busy = true;
  setSyncStatus('syncing');
  try {
    // Lo que guardó otra ventana de ZenBan se suma antes de comparar con Drive
    if (otherWindowSaved()) adoptOtherWindowData();
    // Los proyectos de este navegador que aún no tienen espacio son de este (si los datos son de aquí)
    if (localStorage.getItem(SYNC_KEYS.SWITCH) !== '1' && !localDataOfOtherSpace() && claimProjects(projects, tabSpaceKey)) {
      saveData(STORAGE_KEYS.PROJECTS, projects);
    }
    const gen = SYNC.gen;
    if (inShared() && typeof checkSharedFolder === 'function' && !(await checkSharedFolder())) return;
    const file = await findDataFile();
    SYNC.fileId = file ? file.id : null;
    // Ni Drive ni este dispositivo cambiaron desde la última sincronización: no hay nada que descargar
    // ni comparar. (Descargar y comparar todo cada 45 s congelaba un momento los toques en el celular.)
    if (file && SYNC.remoteVersion && String(file.version) === SYNC.remoteVersion && !isDirty() && SYNC.gen === gen && lastSyncedAt() && !localDataOfOtherSpace()) {
      setSyncStatus('ok');
      return;
    }
    const remote = file ? await (await driveFetch(`${DRIVE_API}/files/${file.id}?alt=media&supportsAllDrives=true`)).json() : null;
    // Drive lo guardó una versión más nueva de la app: esta no lo toca (podría guardarlo distinto) y se actualiza
    if (remote && Number(remote.appVersion) > Number(APP_VERSION)) {
      AppUpdate.pending = Number(remote.appVersion);
      SYNC.again = true;
      return;
    }
    const remoteText = remote ? JSON.stringify(dataPart(remote)) : null;
    // Lo que está en el archivo de este espacio es de este espacio
    if (remote && Array.isArray(remote.projects)) claimProjects(remote.projects, tabSpaceKey);
    const local = localPayload();

    let result = local;
    let mergeBase = null; // copia de la última sincronización (para saber qué nunca llegó a Drive)
    const switching = localStorage.getItem(SYNC_KEYS.SWITCH) === '1' || localDataOfOtherSpace();
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

    // Los proyectos de otro espacio se quitan (sin marcarlos como borrados: siguen vivos en el suyo).
    // Se guarda una copia por si acaso y se avisa.
    const foreign = foreignProjects(result.projects, tabSpaceKey);
    if (foreign.length) {
      const ids = new Set(foreign.map(p => p.id));
      const kept = result.projects.filter(p => !ids.has(p.id));
      result = { ...dataPart(result), projects: kept.length ? kept : [blankProject()] };
      console.warn('Proyectos de otro espacio quitados', foreign.map(p => `${p.name} (${p.space})`));
      if (typeof Backups !== 'undefined') {
        await Backups.add('Proyectos de otro espacio quitados', JSON.stringify({ projects: foreign, tags: [], deletedProjects: [] }), foreign.length);
      }
      showToast(`Se quitaron ${foreign.length} proyecto(s) que son de otro espacio (siguen en el suyo). Hay una copia en ⚙️ Configuración › Copias de seguridad.`, 'warning');
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
    // (se compara con lo que había en Drive antes de anotarle el espacio, para que las anotaciones se suban)
    if (!remote || JSON.stringify(dataPart(result)) !== remoteText) {
      // Si otra persona guardó mientras tanto, se vuelve a combinar antes de subir para no pisar su cambio
      if (file) {
        const now = await (await driveFetch(`${DRIVE_API}/files/${file.id}?fields=version&supportsAllDrives=true`)).json();
        if (String(now.version) !== String(file.version)) {
          SYNC.remoteVersion = null;
          SYNC.again = true;
          return;
        }
      }
      // appVersion: los dispositivos con una versión anterior no tocan este archivo y se actualizan antes
      const data = { ...dataPart(result), version: 1, appVersion: Number(APP_VERSION), savedAt: Date.now() };
      SYNC.remoteVersion = null;
      SYNC.fileId = await driveUpload(DATA_FILE_NAME, new Blob([JSON.stringify(data)], { type: 'application/json' }), SYNC.fileId);
    }
    await SyncBase.set(dataPart(result));
    localStorage.setItem(SYNC_KEYS.LAST, String(Date.now()));
    localStorage.removeItem(SYNC_KEYS.SWITCH);
    localStorage.setItem(SYNC_KEYS.DATA_SPACE, tabSpaceKey);
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
