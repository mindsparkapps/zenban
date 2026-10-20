// ===== ZenBan - Fotos con la cámara y capturas compartidas desde otras apps =====
// - Sacar foto: en el celular abre la cámara del teléfono; en el computador muestra la cámara en una
//   ventana. La foto queda en el lienzo donde se pidió (o al centro de la vista) y la vista se acerca a ella.
// - Compartir con ZenBan (Android): al compartir una captura o imagen desde otra app, el service worker la
//   guarda y abre ZenBan, que pregunta en qué proyecto ponerla.

const SHARE_CACHE = 'zbshare-inbox';

// ----- Sacar foto -----
let photoTarget = null; // punto del lienzo donde va la foto

function photoPoint(point) {
  if (point) return point;
  const rect = viewportArea.getBoundingClientRect();
  return screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function placePhoto(file, point) {
  return addBgImageFromFile(file, null, null, { at: point, focus: true, message: 'Foto agregada al lienzo' });
}

// Cámara del teléfono (o elegir archivo si el navegador no tiene cámara)
const photoInput = document.createElement('input');
photoInput.type = 'file';
photoInput.accept = 'image/*';
photoInput.setAttribute('capture', 'environment');
photoInput.hidden = true;
document.body.appendChild(photoInput);
photoInput.addEventListener('change', async () => {
  const file = photoInput.files && photoInput.files[0];
  photoInput.value = '';
  if (file) await placePhoto(file, photoTarget);
});

function takePhoto(point = null) {
  photoTarget = photoPoint(point);
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (touch || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    photoInput.click();
    return;
  }
  openCameraModal();
}

// Ventana con la cámara (computador)
let camStream = null;
let camFacing = 'user';

function cameraModal() {
  let m = document.getElementById('cameraModal');
  if (m) return m;
  m = document.createElement('div');
  m.className = 'modal-backdrop';
  m.id = 'cameraModal';
  m.style.display = 'none';
  m.innerHTML = `
    <div class="modal-card camera-card">
      <div class="modal-header">
        <h2>📷 Sacar foto</h2>
        <button class="modal-close-btn" type="button" data-cam="close" aria-label="Cerrar">&times;</button>
      </div>
      <div class="camera-view">
        <video id="cameraVideo" autoplay playsinline muted></video>
        <p class="camera-msg" id="cameraMsg" hidden></p>
      </div>
      <div class="modal-actions camera-actions">
        <button type="button" class="btn btn-ghost" data-cam="flip" title="Cambiar de cámara">🔄 Cambiar</button>
        <div class="spacer"></div>
        <button type="button" class="btn btn-ghost" data-cam="close">Cancelar</button>
        <button type="button" class="btn btn-primary" data-cam="shoot">📸 Sacar foto</button>
      </div>
    </div>`;
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    if (b.dataset.cam === 'close') closeCameraModal();
    if (b.dataset.cam === 'flip') { camFacing = camFacing === 'user' ? 'environment' : 'user'; startCamera(); }
    if (b.dataset.cam === 'shoot') shootPhoto();
  });
  document.body.appendChild(m);
  return m;
}

async function startCamera() {
  stopCamera();
  const msg = document.getElementById('cameraMsg');
  const video = document.getElementById('cameraVideo');
  msg.hidden = true;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    video.srcObject = camStream;
    // La cámara del frente se ve como espejo (más natural); la trasera, normal
    video.style.transform = camFacing === 'user' ? 'scaleX(-1)' : 'none';
    // El botón Cambiar solo si hay más de una cámara
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    cameraModal().querySelector('[data-cam="flip"]').hidden = devices.filter(d => d.kind === 'videoinput').length < 2;
  } catch (e) {
    console.warn('Cámara', e);
    msg.textContent = e && e.name === 'NotAllowedError'
      ? 'No hay permiso para usar la cámara. Actívalo en el candado de la barra de direcciones.'
      : 'No se encontró una cámara. Puedes elegir una imagen desde el menú Imagen.';
    msg.hidden = false;
  }
}

function stopCamera() {
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null;
}

function openCameraModal() {
  const m = cameraModal();
  m.style.display = 'flex';
  startCamera();
}

function closeCameraModal() {
  stopCamera();
  const m = document.getElementById('cameraModal');
  if (m) m.style.display = 'none';
}

function shootPhoto() {
  const video = document.getElementById('cameraVideo');
  if (!camStream || !video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  // La vista previa del frente se ve como espejo, pero la foto se guarda sin espejar (los textos se leen bien)
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    closeCameraModal();
    const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
    await placePhoto(file, photoTarget);
  }, 'image/jpeg', 0.9);
}

document.getElementById('toolCamera').addEventListener('click', () => takePhoto());

// Atajo: C
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (Array.from(document.querySelectorAll('.modal-backdrop')).some(m => m.style.display === 'flex')) return;
  takePhoto();
});

// ----- Capturas compartidas desde otras apps -----
async function readSharedInbox() {
  if (!('caches' in window)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const keys = await cache.keys();
  if (!keys.length) return null;
  const files = [];
  let text = '';
  for (const req of keys) {
    const res = await cache.match(req);
    if (!res) continue;
    if (req.url.includes('/__share/text')) {
      text = await res.text();
    } else {
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get('X-File-Name') || 'captura.png');
      files.push(new File([blob], name, { type: blob.type || 'image/png' }));
    }
  }
  await caches.delete(SHARE_CACHE);
  return { files, text };
}

function chooseProjectDialog(count, onPick) {
  let m = document.getElementById('shareInModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'shareInModal';
    m.innerHTML = `
      <div class="modal-card modal-sm">
        <div class="modal-header">
          <h2>📥 Guardar en ZenBan</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div class="share-in-body">
          <p class="share-in-text"></p>
          <div class="share-in-list"></div>
        </div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.style.display = 'none'; });
    document.body.appendChild(m);
  }
  m.querySelector('.share-in-text').textContent = `¿En qué proyecto pongo ${count === 1 ? 'la imagen' : `las ${count} imágenes`}?`;
  const list = m.querySelector('.share-in-list');
  list.innerHTML = projects.map(p => `
    <button type="button" class="share-in-project ${p.id === activeProjectId ? 'is-current' : ''}" data-project-id="${escapeHtml(p.id)}">
      <span class="project-dot" style="background-color:${p.color || '#6366f1'}"></span>
      <span>${escapeHtml(p.name)}</span>${p.id === activeProjectId ? '<small>(abierto)</small>' : ''}
    </button>`).join('');
  list.querySelectorAll('[data-project-id]').forEach(b => b.addEventListener('click', () => {
    m.style.display = 'none';
    onPick(b.dataset.projectId);
  }));
  m.style.display = 'flex';
}

async function receiveSharedItems() {
  const params = new URLSearchParams(location.search);
  if (!params.has('share')) return;
  history.replaceState(null, '', location.pathname);
  let inbox = null;
  try { inbox = await readSharedInbox(); } catch (e) { console.warn('Compartir con ZenBan', e); }
  if (!inbox || (!inbox.files.length && !inbox.text)) {
    if (params.get('share') === 'error') showToast('No se pudo recibir lo compartido. Inténtalo de nuevo.', 'warning');
    return;
  }
  chooseProjectDialog(inbox.files.length || 1, async (projectId) => {
    if (projectId !== activeProjectId) switchProject(projectId);
    const rect = viewportArea.getBoundingClientRect();
    let point = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    for (const file of inbox.files) {
      await addBgImageFromFile(file, null, null, { at: point, focus: true, message: 'Imagen compartida agregada' });
      point = { x: point.x + 40, y: point.y + 40 };
    }
    if (inbox.text && inbox.text.trim()) addText(inbox.text.trim(), { x: point.x, y: point.y + 40 });
  });
}

// ----- Estilos -----
(function captureStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .camera-card { max-width: 720px; }
    .camera-view { position: relative; background: #000; display: flex; align-items: center; justify-content: center; min-height: 240px; }
    .camera-view video { width: 100%; max-height: 65vh; display: block; }
    .camera-msg { position: absolute; inset: 0; margin: 0; padding: 1.5rem; display: flex; align-items: center; justify-content: center; text-align: center; color: #fff; background: rgba(0,0,0,0.75); font-size: 0.9rem; }
    .camera-msg[hidden] { display: none; }
    .camera-actions { padding: 1rem 1.5rem; }
    .camera-actions [hidden] { display: none; }
    .share-in-body { padding: 1rem 1.5rem 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .share-in-text { margin: 0; color: var(--text-muted); font-size: 0.9rem; }
    .share-in-list { display: flex; flex-direction: column; gap: 6px; max-height: 55vh; overflow-y: auto; }
    .share-in-project { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-medium); background: var(--bg-surface-hover); color: var(--text-main); font: inherit; font-size: 0.95rem; text-align: left; cursor: pointer; }
    .share-in-project:hover { border-color: var(--accent-primary); }
    .share-in-project.is-current { border-color: var(--accent-primary); }
    .share-in-project small { margin-left: auto; color: var(--text-muted); }
  `;
  document.head.appendChild(style);
})();

receiveSharedItems();
